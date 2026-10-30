import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database.connection import Base, get_db
from app.models.all_models import User, Department, Doctor, Patient, QueueEntry
from app.services.queue_service import (
    WAITING_STATUSES, CONSULTING_STATUSES, ACTIVE_STATUSES,
    STATUS_WAITING, STATUS_CONSULTING, STATUS_COMPLETED, STATUS_CANCELLED,
    calculate_queue_state
)
from app.utils.auth import create_access_token
from app.main import app

# In-memory SQLite for clean test isolation
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    
    # 1. Departments
    dept_card = Department(id=1, name="Cardiology", code="CARD", avg_consult_time=15.0, is_active=True)
    dept_ortho = Department(id=2, name="Orthopedics", code="ORTHO", avg_consult_time=12.0, is_active=True)
    dept_derma = Department(id=3, name="Dermatology", code="DERM", avg_consult_time=10.0, is_active=True)
    db.add_all([dept_card, dept_ortho, dept_derma])
    db.commit()

    # 2. Doctors
    u_doc1 = User(id=1, email="dr.kumar@mediwait.ai", hashed_password="pw", full_name="Dr. Rajesh Kumar", role="doctor")
    u_doc2 = User(id=2, email="dr.sharma@mediwait.ai", hashed_password="pw", full_name="Dr. Priya Sharma", role="doctor")
    db.add_all([u_doc1, u_doc2])
    db.commit()

    d1 = Doctor(id=1, user_id=1, department_id=1, specialization="Cardiology", status="available", room_number="Room 201")
    d2 = Doctor(id=2, user_id=2, department_id=2, specialization="Orthopedics", status="available", room_number="Room 305")
    db.add_all([d1, d2])
    db.commit()

    # 3. Patients
    u_pat1 = User(id=10, email="john@example.com", hashed_password="pw", full_name="John Doe", role="patient", phone="9876543210")
    u_pat2 = User(id=11, email="alice@example.com", hashed_password="pw", full_name="Alice Smith", role="patient", phone="9876543211")
    u_pat3 = User(id=12, email="bob@example.com", hashed_password="pw", full_name="Bob Brown", role="patient", phone="9876543212")
    db.add_all([u_pat1, u_pat2, u_pat3])
    db.commit()

    p1 = Patient(id=1, user_id=10, mrn="MRN-001", date_of_birth=datetime(1990, 1, 1), gender="Male")
    p2 = Patient(id=2, user_id=11, mrn="MRN-002", date_of_birth=datetime(1985, 5, 12), gender="Female")
    p3 = Patient(id=3, user_id=12, mrn="MRN-003", date_of_birth=datetime(1978, 11, 23), gender="Male")
    db.add_all([p1, p2, p3])
    db.commit()

    db.close()
    yield
    db = TestingSessionLocal()
    db.close()

def auth_headers(user_id: int):
    token = create_access_token({"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}

# =========================================================================
# TEST A: New Patient Visit Registration and Selection
# =========================================================================
def test_a_new_visit_registration_and_selection():
    """
    Test A:
    - Register a new patient visit.
    - Verify a unique token is generated (e.g. CARD-...).
    - Verify the saved visit ID is selected.
    - Verify the assigned doctor is displayed when available.
    - Verify queue position (1) and patients ahead (0) are correct.
    - Verify the estimated waiting time corresponds to the new visit.
    """
    payload = {
        "full_name": "John Doe",
        "phone": "9876543210",
        "department_id": 1,
        "priority": "normal",
        "symptoms": "Chest tightness",
        "age": 35,
        "gender": "Male"
    }
    
    # 1. Register new visit as authenticated patient John Doe (user_id=10)
    res = client.post("/api/queue/register", json=payload, headers=auth_headers(10))
    assert res.status_code == 200, res.text
    new_visit = res.json()
    
    assert new_visit["id"] is not None
    assert new_visit["token_number"].startswith("CARD-")
    assert new_visit["doctor_name"] == "Dr. Rajesh Kumar"
    assert new_visit["room_number"] == "Room 201"
    assert new_visit["status"] == "waiting"
    assert new_visit["queue_position"] == 1
    assert new_visit["patients_ahead"] == 0
    assert new_visit["estimated_wait_time"] > 0
    
    # 2. Verify explicit visit selection via /api/queue/my-token?visit_id=...
    token_res = client.get(f"/api/queue/my-token?visit_id={new_visit['id']}")
    assert token_res.status_code == 200
    retrieved = token_res.json()
    assert retrieved["id"] == new_visit["id"]
    assert retrieved["token_number"] == new_visit["token_number"]
    assert retrieved["doctor_name"] == "Dr. Rajesh Kumar"
    assert retrieved["queue_position"] == 1
    assert retrieved["patients_ahead"] == 0

# =========================================================================
# TEST B: Existing Completed Visit Transition
# =========================================================================
def test_b_existing_completed_visit_transition():
    """
    Test B:
    - Start with a completed visit (e.g. historical token A-127).
    - Register a new visit for the same patient.
    - Verify the dashboard (/api/queue/my-token) displays the new active visit
      rather than the completed visit.
    - Verify the completed visit remains accessible in visit history (/api/queue/my-visits).
    """
    db = TestingSessionLocal()
    # Create an older completed visit for John Doe (patient_id=1)
    old_completed = QueueEntry(
        token_number="A-127",
        patient_id=1,
        department_id=1,
        doctor_id=1,
        status="completed",
        priority="normal",
        queue_position=0,
        estimated_wait_time=0,
        check_in_time=datetime.utcnow() - timedelta(hours=3),
        consult_start_time=datetime.utcnow() - timedelta(hours=2),
        consult_end_time=datetime.utcnow() - timedelta(hours=1, minutes=45)
    )
    db.add(old_completed)
    db.commit()
    db.refresh(old_completed)
    old_id = old_completed.id
    db.close()

    # Before new registration: /my-token returns the completed visit fallback
    pre_res = client.get("/api/queue/my-token", headers=auth_headers(10))
    assert pre_res.status_code == 200
    assert pre_res.json()["token_number"] == "A-127"
    assert pre_res.json()["status"] == "completed"

    # Now register a brand new visit for John Doe
    payload = {
        "full_name": "John Doe",
        "phone": "9876543210",
        "department_id": 1,
        "priority": "normal",
        "symptoms": "Follow-up check"
    }
    reg_res = client.post("/api/queue/register", json=payload, headers=auth_headers(10))
    assert reg_res.status_code == 200
    new_visit_id = reg_res.json()["id"]
    new_token = reg_res.json()["token_number"]

    # After new registration: /my-token MUST select the new ACTIVE visit, NOT A-127!
    post_res = client.get("/api/queue/my-token", headers=auth_headers(10))
    assert post_res.status_code == 200
    active_token_data = post_res.json()
    assert active_token_data["id"] == new_visit_id
    assert active_token_data["token_number"] == new_token
    assert active_token_data["token_number"] != "A-127"
    assert active_token_data["status"] == "waiting"
    assert active_token_data["queue_position"] == 1

    # Verify visit history contains BOTH visits with correct statuses
    history_res = client.get("/api/queue/my-visits", headers=auth_headers(10))
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history) == 2
    assert history[0]["id"] == new_visit_id
    assert history[0]["status"] == "waiting"
    assert history[1]["id"] == old_id
    assert history[1]["token_number"] == "A-127"
    assert history[1]["status"] == "completed"

# =========================================================================
# TEST C: Multiple Patients Ordering and Patients Ahead
# =========================================================================
def test_c_multiple_patients_contiguous_queue():
    """
    Test C:
    Register at least three active visits in the same queue.
    Expected basic ordering:
    - Patient A: Queue Position 1, Patients Ahead 0
    - Patient B: Queue Position 2, Patients Ahead 1
    - Patient C: Queue Position 3, Patients Ahead 2
    """
    patients = [
        {"full_name": "Patient A", "phone": "1111111111", "user_id": 10},
        {"full_name": "Patient B", "phone": "2222222222", "user_id": 11},
        {"full_name": "Patient C", "phone": "3333333333", "user_id": 12},
    ]
    
    registered_entries = []
    for p in patients:
        res = client.post("/api/queue/register", json={
            "full_name": p["full_name"],
            "phone": p["phone"],
            "department_id": 1,
            "priority": "normal"
        }, headers=auth_headers(p["user_id"]))
        assert res.status_code == 200
        registered_entries.append(res.json())

    # Verify Patient A
    res_a = client.get(f"/api/queue/my-token?visit_id={registered_entries[0]['id']}")
    assert res_a.json()["queue_position"] == 1
    assert res_a.json()["patients_ahead"] == 0

    # Verify Patient B
    res_b = client.get(f"/api/queue/my-token?visit_id={registered_entries[1]['id']}")
    assert res_b.json()["queue_position"] == 2
    assert res_b.json()["patients_ahead"] == 1

    # Verify Patient C
    res_c = client.get(f"/api/queue/my-token?visit_id={registered_entries[2]['id']}")
    assert res_c.json()["queue_position"] == 3
    assert res_c.json()["patients_ahead"] == 2

# =========================================================================
# TEST D: Consultation Lifecycle and Dynamic Recalculation
# =========================================================================
def test_d_complete_consultation_lifecycle():
    """
    Test D:
    - Complete the first patient's consultation.
    - Verify that patient is removed from the active queue.
    - Verify the remaining patients' positions are recalculated.
    - Verify the completed patient no longer has an active queue position.
    """
    # Register 3 patients
    v1 = client.post("/api/queue/register", json={"full_name": "P1", "phone": "100", "department_id": 1, "priority": "normal"}).json()
    v2 = client.post("/api/queue/register", json={"full_name": "P2", "phone": "200", "department_id": 1, "priority": "normal"}).json()
    v3 = client.post("/api/queue/register", json={"full_name": "P3", "phone": "300", "department_id": 1, "priority": "normal"}).json()

    # Call patient 1 into consultation
    call_res = client.post(f"/api/queue/{v1['id']}/call-next")
    assert call_res.status_code == 200
    v1_called = call_res.json()
    assert v1_called["status"] == "consulting"
    assert v1_called["queue_position"] == 0

    # While P1 is consulting:
    # P2 is next waiting: position 1, ahead 0
    res_v2 = client.get(f"/api/queue/my-token?visit_id={v2['id']}").json()
    assert res_v2["queue_position"] == 1
    assert res_v2["patients_ahead"] == 0

    # P3 is second waiting: position 2, ahead 1
    res_v3 = client.get(f"/api/queue/my-token?visit_id={v3['id']}").json()
    assert res_v3["queue_position"] == 2
    assert res_v3["patients_ahead"] == 1

    # Now complete Patient 1's consultation
    comp_res = client.post(f"/api/queue/{v1['id']}/complete")
    assert comp_res.status_code == 200
    v1_completed = comp_res.json()
    assert v1_completed["status"] == "completed"
    assert v1_completed["queue_position"] == 0
    assert v1_completed["patients_ahead"] == 0
    assert v1_completed["estimated_wait_time"] == 0

    # Remaining active visits maintain accurate positions
    res_v2_after = client.get(f"/api/queue/my-token?visit_id={v2['id']}").json()
    assert res_v2_after["queue_position"] == 1
    assert res_v2_after["patients_ahead"] == 0

    res_v3_after = client.get(f"/api/queue/my-token?visit_id={v3['id']}").json()
    assert res_v3_after["queue_position"] == 2
    assert res_v3_after["patients_ahead"] == 1

# =========================================================================
# TEST E: Cross-Dashboard Consistency
# =========================================================================
def test_e_cross_dashboard_consistency():
    """
    Test E:
    - Register a patient from receptionist/admin interface.
    - Verify the visit appears in the Live Queue (/api/queue).
    - Verify the Patient Dashboard shows the same visit and token.
    - Verify the Doctor assignment is reflected in doctor details.
    """
    res = client.post("/api/queue/register", json={
        "full_name": "Cross Check Patient",
        "phone": "5555555555",
        "department_id": 2, # Orthopedics -> Dr. Priya Sharma
        "priority": "normal"
    })
    assert res.status_code == 200
    created = res.json()
    entry_id = created["id"]
    token_num = created["token_number"]

    # 1. Live Queue check
    live_res = client.get("/api/queue?department_id=2")
    assert live_res.status_code == 200
    live_tokens = [e["token_number"] for e in live_res.json()]
    assert token_num in live_tokens

    # 2. Patient Dashboard token query check
    patient_res = client.get(f"/api/queue/my-token?visit_id={entry_id}")
    assert patient_res.status_code == 200
    p_data = patient_res.json()
    assert p_data["token_number"] == token_num
    assert p_data["doctor_name"] == "Dr. Priya Sharma"
    assert p_data["department_name"] == "Orthopedics"

    # 3. Doctor Dashboard / Doctor list check
    doc_res = client.get("/api/doctors")
    assert doc_res.status_code == 200
    sharma = next((d for d in doc_res.json() if d["id"] == 2), None)
    assert sharma is not None
    assert sharma["user"]["full_name"] == "Dr. Priya Sharma"

# =========================================================================
# TEST F: Failure Handling and Unassigned Doctor Graceful Degradation
# =========================================================================
def test_f_failure_handling_and_unassigned_doctor():
    """
    Test F:
    - Register a patient for a department with no available doctors (Department 3: Dermatology).
    - Verify it shows 'Pending Doctor Assignment' and 'Triage Desk', not a fake Dr. Kumar.
    - Verify waiting time fallback logic does not crash and provides a valid estimate.
    - Verify queue position is computed accurately.
    """
    res = client.post("/api/queue/register", json={
        "full_name": "Dermatology Patient",
        "phone": "4444444444",
        "department_id": 3, # Dermatology has NO doctors
        "priority": "normal"
    })
    assert res.status_code == 200
    entry = res.json()

    assert entry["doctor_id"] is None
    assert entry["doctor_name"] == "Pending Doctor Assignment"
    assert entry["room_number"] == "Triage Desk"
    assert entry["queue_position"] == 1
    assert entry["patients_ahead"] == 0
    assert entry["estimated_wait_time"] > 0
    assert entry["status"] == "waiting"
