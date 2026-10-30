import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database.connection import Base, get_db
from app.models.all_models import User, Department, Doctor, Patient, QueueEntry
from app.services.queue_service import (
    WAITING_STATUSES, CONSULTING_STATUSES, ACTIVE_STATUSES,
    STATUS_WAITING, STATUS_CONSULTING, STATUS_COMPLETED, STATUS_CANCELLED,
    get_queue_statistics, get_active_queue_entries
)
from app.main import app

from sqlalchemy.pool import StaticPool

# Setup test in-memory SQLite database
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

def setup_test_data(db):
    """Sets up base departments, doctors, and patient profile."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # 1. Departments
    dept_card = Department(id=1, name="Cardiology", code="CARD", avg_consult_time=14.0, is_active=True)
    dept_ortho = Department(id=2, name="Orthopedics", code="ORTHO", avg_consult_time=13.0, is_active=True)
    dept_gen = Department(id=3, name="General Medicine", code="GEN", avg_consult_time=10.0, is_active=True)
    db.add_all([dept_card, dept_ortho, dept_gen])
    db.commit()

    # 2. Doctors
    u1 = User(id=1, email="doc1@mediwait.ai", hashed_password="password123", full_name="Dr. Kumar", role="doctor")
    u2 = User(id=2, email="doc2@mediwait.ai", hashed_password="password123", full_name="Dr. Sharma", role="doctor")
    db.add_all([u1, u2])
    db.commit()

    d1 = Doctor(id=1, user_id=1, department_id=1, specialization="Cardiology", status="available")
    d2 = Doctor(id=2, user_id=2, department_id=2, specialization="Orthopedics", status="available")
    db.add_all([d1, d2])
    db.commit()

    # 3. Patient
    p_user = User(id=10, email="john@example.com", hashed_password="password123", full_name="John Doe", role="patient")
    db.add(p_user)
    db.commit()
    patient = Patient(id=1, user_id=10, mrn="MRN-1010")
    db.add(patient)
    db.commit()

def test_scenario_no_waiting_patients():
    """Scenario: No waiting patients -> Both pages/endpoints show 0"""
    db = TestingSessionLocal()
    setup_test_data(db)

    # All records in DB are completed
    q_comp = QueueEntry(
        id=1,
        token_number="A-101",
        patient_id=1,
        department_id=1,
        doctor_id=1,
        status="completed",
        priority="normal",
        queue_position=0,
        estimated_wait_minutes=0
    )
    db.add(q_comp)
    db.commit()

    # 1. Test shared statistics service
    stats = get_queue_statistics(db)
    assert stats["waiting_count"] == 0, f"Expected 0 waiting, got {stats['waiting_count']}"
    assert stats["consulting_count"] == 0
    assert stats["avg_wait_minutes"] == 0

    # 2. Test Dashboard KPI endpoint
    kpi_res = client.get("/api/analytics/kpis")
    assert kpi_res.status_code == 200
    kpi_data = kpi_res.json()
    assert kpi_data["waiting_patients_now"] == 0, f"Dashboard should show 0 waiting, got {kpi_data['waiting_patients_now']}"
    assert kpi_data["emergency_cases_now"] == 0

    # 3. Test Live Queue endpoint
    queue_res = client.get("/api/queue")
    assert queue_res.status_code == 200
    active_queue = queue_res.json()
    assert len(active_queue) == 0, f"Live queue should show 0 active entries, got {len(active_queue)}"

    # 4. Test Queue Stats endpoint
    q_stats_res = client.get("/api/queue/stats")
    assert q_stats_res.status_code == 200
    assert q_stats_res.json()["waiting_count"] == 0
    db.close()

def test_scenario_42_waiting_patients():
    """Scenario: 42 waiting patients -> Dashboard and Live Queue both show 42"""
    db = TestingSessionLocal()
    setup_test_data(db)

    # Create 42 waiting patients
    for i in range(1, 43):
        entry = QueueEntry(
            id=i,
            token_number=f"A-{100+i}",
            patient_id=1,
            department_id=1 if i <= 25 else 2,
            doctor_id=1 if i <= 25 else 2,
            status="waiting",
            priority="emergency" if i == 1 else "normal",
            queue_position=i,
            estimated_wait_minutes=15 + i
        )
        db.add(entry)
    db.commit()

    # 1. Verify shared service
    stats = get_queue_statistics(db)
    assert stats["waiting_count"] == 42, f"Expected 42 waiting, got {stats['waiting_count']}"
    assert stats["consulting_count"] == 0
    assert stats["emergency_count"] == 1

    # 2. Verify Dashboard KPI endpoint
    kpi_res = client.get("/api/analytics/kpis")
    assert kpi_res.status_code == 200
    assert kpi_res.json()["waiting_patients_now"] == 42, f"Dashboard KPI must show 42, got {kpi_res.json()['waiting_patients_now']}"

    # 3. Verify Live Queue endpoint
    queue_res = client.get("/api/queue")
    assert queue_res.status_code == 200
    active_entries = queue_res.json()
    assert len(active_entries) == 42, f"Live Queue must show 42 records, got {len(active_entries)}"

    # 4. Verify Live Queue Stats
    stats_res = client.get("/api/queue/stats")
    assert stats_res.status_code == 200
    assert stats_res.json()["waiting_count"] == 42
    db.close()

def test_scenario_42_waiting_and_3_consulting():
    """Scenario: 42 waiting, 3 consulting -> Waiting = 42; consulting = 3"""
    db = TestingSessionLocal()
    setup_test_data(db)

    # 3 consulting patients
    for i in range(1, 4):
        c_entry = QueueEntry(
            id=i,
            token_number=f"C-{100+i}",
            patient_id=1,
            department_id=1,
            doctor_id=1,
            status="consulting",
            priority="normal",
            queue_position=0,
            estimated_wait_minutes=0
        )
        db.add(c_entry)

    # 42 waiting patients
    for i in range(4, 46):
        w_entry = QueueEntry(
            id=i,
            token_number=f"A-{100+i}",
            patient_id=1,
            department_id=1 if i <= 25 else 2,
            doctor_id=1 if i <= 25 else 2,
            status="waiting",
            priority="normal",
            queue_position=i - 3,
            estimated_wait_minutes=20
        )
        db.add(w_entry)
    db.commit()

    # 1. Verify shared stats
    stats = get_queue_statistics(db)
    assert stats["waiting_count"] == 42
    assert stats["consulting_count"] == 3
    assert stats["active_total"] == 45

    # 2. Verify Dashboard endpoint
    kpi_res = client.get("/api/analytics/kpis")
    assert kpi_res.status_code == 200
    data = kpi_res.json()
    assert data["waiting_patients_now"] == 42
    assert data["consulting_patients_now"] == 3

    # 3. Verify Live Queue endpoint returns all 45 active records (3 consulting + 42 waiting)
    queue_res = client.get("/api/queue")
    active_entries = queue_res.json()
    assert len(active_entries) == 45
    waiting_in_list = [q for q in active_entries if q["status"] == "waiting"]
    consulting_in_list = [q for q in active_entries if q["status"] == "consulting"]
    assert len(waiting_in_list) == 42
    assert len(consulting_in_list) == 3
    db.close()

def test_scenario_call_next_starts_consultation():
    """Scenario: One waiting patient starts consultation -> Waiting decreases by 1; consulting increases by 1"""
    db = TestingSessionLocal()
    setup_test_data(db)

    # Initially 5 waiting, 1 consulting
    c_entry = QueueEntry(id=1, token_number="C-1", patient_id=1, department_id=1, doctor_id=1, status="consulting", queue_position=0, estimated_wait_minutes=0)
    db.add(c_entry)
    for i in range(2, 7):
        w_entry = QueueEntry(id=i, token_number=f"W-{i}", patient_id=1, department_id=1, doctor_id=1, status="waiting", queue_position=i-1, estimated_wait_minutes=15)
        db.add(w_entry)
    db.commit()

    before_stats = get_queue_statistics(db)
    assert before_stats["waiting_count"] == 5
    assert before_stats["consulting_count"] == 1

    # Call next patient (id=2)
    call_res = client.post("/api/queue/2/call-next")
    assert call_res.status_code == 200
    assert call_res.json()["status"] == "consulting"

    after_stats = get_queue_statistics(db)
    assert after_stats["waiting_count"] == 4, f"Waiting should decrease by 1, got {after_stats['waiting_count']}"
    assert after_stats["consulting_count"] == 2, f"Consulting should increase by 1, got {after_stats['consulting_count']}"

    # Verify Dashboard and Live Queue endpoints
    kpi_res = client.get("/api/analytics/kpis")
    assert kpi_res.json()["waiting_patients_now"] == 4
    assert kpi_res.json()["consulting_patients_now"] == 2

    # Verify remaining waiting patients have updated contiguous queue positions
    q_entries = client.get("/api/queue?status=waiting").json()
    assert len(q_entries) == 4
    for idx, e in enumerate(q_entries, start=1):
        assert e["queue_position"] == idx
    db.close()

def test_scenario_complete_consultation_removes_from_queue():
    """Scenario: One consultation is completed -> Completed patient is excluded from waiting and active queue"""
    db = TestingSessionLocal()
    setup_test_data(db)

    c_entry = QueueEntry(id=1, token_number="C-1", patient_id=1, department_id=1, doctor_id=1, status="consulting", queue_position=0, estimated_wait_minutes=0)
    w_entry = QueueEntry(id=2, token_number="W-1", patient_id=1, department_id=1, doctor_id=1, status="waiting", queue_position=1, estimated_wait_minutes=10)
    db.add_all([c_entry, w_entry])
    db.commit()

    # Complete consultation for C-1
    comp_res = client.post("/api/queue/1/complete")
    assert comp_res.status_code == 200
    assert comp_res.json()["status"] == "completed"

    # Completed patient must not be in active queue
    queue_res = client.get("/api/queue")
    active_entries = queue_res.json()
    assert len(active_entries) == 1
    assert active_entries[0]["token_number"] == "W-1"

    stats = get_queue_statistics(db)
    assert stats["consulting_count"] == 0
    assert stats["waiting_count"] == 1
    db.close()

def test_scenario_department_filter():
    """Scenario: Department filter is selected -> Filtered queue count matches displayed records without altering hospital totals"""
    db = TestingSessionLocal()
    setup_test_data(db)

    # 10 waiting in Cardiology (dept 1), 5 waiting in Orthopedics (dept 2)
    for i in range(1, 11):
        db.add(QueueEntry(id=i, token_number=f"CARD-{i}", patient_id=1, department_id=1, doctor_id=1, status="waiting", queue_position=i, estimated_wait_minutes=10))
    for i in range(11, 16):
        db.add(QueueEntry(id=i, token_number=f"ORTHO-{i}", patient_id=1, department_id=2, doctor_id=2, status="waiting", queue_position=i-10, estimated_wait_minutes=12))
    db.commit()

    # Hospital wide totals
    hosp_stats = get_queue_statistics(db)
    assert hosp_stats["waiting_count"] == 15

    # Filter Cardiology
    card_stats = get_queue_statistics(db, department_id=1)
    assert card_stats["waiting_count"] == 10
    card_queue = client.get("/api/queue?department_id=1").json()
    assert len(card_queue) == 10

    # Filter Orthopedics
    ortho_stats = get_queue_statistics(db, department_id=2)
    assert ortho_stats["waiting_count"] == 5
    ortho_queue = client.get("/api/queue?department_id=2").json()
    assert len(ortho_queue) == 5

    # Hospital KPI remains 15 (unaffected by department filter query)
    kpi_res = client.get("/api/analytics/kpis")
    assert kpi_res.json()["waiting_patients_now"] == 15
    db.close()

def test_scenario_emergency_prioritization_and_cancellation():
    """Scenario: Emergency prioritization and cancellation update counts accurately without duplicate records"""
    db = TestingSessionLocal()
    setup_test_data(db)

    w1 = QueueEntry(id=1, token_number="W-1", patient_id=1, department_id=1, doctor_id=1, status="waiting", priority="normal", queue_position=1, estimated_wait_minutes=10)
    w2 = QueueEntry(id=2, token_number="W-2", patient_id=1, department_id=1, doctor_id=1, status="waiting", priority="normal", queue_position=2, estimated_wait_minutes=20)
    db.add_all([w1, w2])
    db.commit()

    # Prioritize w2 as emergency
    emerg_res = client.post("/api/queue/2/emergency")
    assert emerg_res.status_code == 200
    assert emerg_res.json()["priority"] == "emergency"
    assert emerg_res.json()["status"] == "waiting" # Must remain waiting, not completed

    # No duplicate records created
    all_queue = client.get("/api/queue").json()
    assert len(all_queue) == 2

    # Cancel w1
    cancel_res = client.post("/api/queue/1/cancel")
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"

    # Cancelled entry removed from active count
    stats = get_queue_statistics(db)
    assert stats["waiting_count"] == 1
    assert stats["emergency_count"] == 1
    db.close()

def test_case_completed_patient_portal_values_and_emergency_cases_ahead_zero():
    """Cases 3 & 4: Completed patient has queue_position=0, patients_ahead=0, emergency_cases_ahead=0, wait_time=0"""
    db = TestingSessionLocal()
    setup_test_data(db)

    # Emergency waiting patient and completed patient
    w_emerg = QueueEntry(
        id=1,
        token_number="A-126",
        patient_id=1,
        department_id=1,
        doctor_id=1,
        status="waiting",
        priority="emergency",
        queue_position=1,
        estimated_wait_minutes=12
    )
    q_completed = QueueEntry(
        id=2,
        token_number="A-127",
        patient_id=1,
        department_id=1,
        doctor_id=1,
        status="completed",
        priority="normal",
        queue_position=0,
        estimated_wait_minutes=0,
        completed_at=datetime.utcnow() - timedelta(minutes=15)
    )
    db.add_all([w_emerg, q_completed])
    db.commit()

    # Query token endpoint for completed token A-127
    res = client.get("/api/queue/my-token?token_number=A-127")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    assert data["queue_position"] == 0
    assert data["patients_ahead"] == 0
    assert data["emergency_cases_ahead"] == 0
    assert data["estimated_wait_minutes"] == 0
    assert data["doctor_name"] == "Dr. Kumar"
    assert data["doctor_room"] == "Room 101"

    # Explain endpoint for completed visit
    exp_res = client.get("/api/predict/explain/A-127")
    assert exp_res.status_code == 200
    exp_data = exp_res.json()
    assert exp_data["predicted_wait_minutes"] == 0
    assert "completed" in exp_data["summary"].lower()
    db.close()

def test_case_new_visit_preserves_historical_visit():
    """Case 6: New visit for the same patient receives valid waiting state without altering completed visit"""
    db = TestingSessionLocal()
    setup_test_data(db)

    # Historical completed visit
    q_old = QueueEntry(
        id=1,
        token_number="CARD-101",
        patient_id=1,
        department_id=1,
        doctor_id=1,
        status="completed",
        priority="normal",
        queue_position=0,
        estimated_wait_minutes=0
    )
    db.add(q_old)
    db.commit()

    # Register new visit
    reg_payload = {
        "patient_name": "John Doe",
        "phone": "+1 (555) 019-1010",
        "department_id": 1,
        "priority": "normal"
    }
    reg_res = client.post("/api/queue/register", json=reg_payload)
    assert reg_res.status_code == 200
    new_entry = reg_res.json()

    # New entry is waiting with positive position and wait time
    assert new_entry["status"] == "waiting"
    assert new_entry["queue_position"] == 1
    assert new_entry["estimated_wait_minutes"] > 0
    assert new_entry["token_number"] != "CARD-101"

    # Historical entry remains completed
    old_db = db.query(QueueEntry).filter(QueueEntry.id == 1).first()
    assert old_db.status == "completed"
    assert old_db.queue_position == 0
    db.close()

def test_case_doctor_availability_independent_of_patient_status():
    """Case 9: Completing a patient consultation does not alter the doctor's global availability"""
    db = TestingSessionLocal()
    setup_test_data(db)

    doc = db.query(Doctor).filter(Doctor.id == 1).first()
    assert doc.status == "available"

    entry = QueueEntry(
        id=1,
        token_number="C-1",
        patient_id=1,
        department_id=1,
        doctor_id=1,
        status="consulting",
        queue_position=0,
        estimated_wait_minutes=0
    )
    db.add(entry)
    db.commit()

    comp_res = client.post("/api/queue/1/complete")
    assert comp_res.status_code == 200

    # Refresh doctor
    db.expire_all()
    doc_after = db.query(Doctor).filter(Doctor.id == 1).first()
    assert doc_after.status == "available", "Doctor must remain available after consultation completes"
    db.close()

def test_case_notifications_filter_and_no_duplication():
    """Case 10: Notification counts reflect user records without duplication on repeated complete"""
    db = TestingSessionLocal()
    setup_test_data(db)

    entry = QueueEntry(
        id=1,
        token_number="T-1",
        patient_id=1,
        department_id=1,
        doctor_id=1,
        status="consulting",
        queue_position=0,
        estimated_wait_minutes=0
    )
    db.add(entry)
    db.commit()

    # Complete once
    client.post("/api/queue/1/complete")
    # Complete again (simulating repeated call)
    client.post("/api/queue/1/complete")

    # Patient user has id=10
    notifs_res = client.get("/api/notifications?user_id=10")
    assert notifs_res.status_code == 200
    notifs = notifs_res.json()
    comp_notifs = [n for n in notifs if n["title"] == "Consultation Completed"]
    assert len(comp_notifs) == 1, f"Expected 1 completed notification, got {len(comp_notifs)}"
    db.close()


def test_doctors_rich_data_and_stats():
    """Verify GET /api/doctors returns rich statistics, specialization, active patients, and workload."""
    db = TestingSessionLocal()
    setup_test_data(db)

    # Assign waiting patient to Dr. Kumar (id=1)
    q1 = QueueEntry(id=1, token_number="CARD-01", patient_id=1, department_id=1, doctor_id=1, status="waiting", estimated_wait_minutes=15)
    db.add(q1)
    db.commit()

    res = client.get("/api/doctors")
    assert res.status_code == 200
    docs = res.json()
    assert len(docs) >= 2

    doc1 = next(d for d in docs if d["id"] == 1)
    assert doc1["name"] == "Dr. Kumar"
    assert doc1["department"] == "Cardiology"
    assert doc1["active_patient_count"] == 1
    assert doc1["waiting_count"] == 1
    assert doc1["avg_wait_minutes"] == 15
    assert "specialization" in doc1
    assert "status" in doc1
    db.close()


def test_add_doctor_and_duplicate_prevention():
    """Verify adding a doctor persists to DB, and duplicate email is rejected."""
    db = TestingSessionLocal()
    setup_test_data(db)

    payload = {
        "name": "Dr. Sarah Connor",
        "email": "dr.connor@mediwait.ai",
        "department_id": 1,
        "specialization": "Cardiac Electrophysiology",
        "room_number": "Room 105",
        "avg_consult_time": 15.0,
        "phone": "+1-555-0100",
        "status": "available"
    }
    res = client.post("/api/doctors", json=payload)
    assert res.status_code == 200
    assert res.json()["name"] == "Dr. Sarah Connor"

    # Duplicate email should be rejected with 400
    res_dup = client.post("/api/doctors", json=payload)
    assert res_dup.status_code == 400
    assert "already exists" in res_dup.json()["detail"].lower()
    db.close()


def test_update_doctor_and_reassignment():
    """Verify editing doctor details and reassigning department persists correctly."""
    db = TestingSessionLocal()
    setup_test_data(db)

    update_payload = {
        "name": "Dr. Kumar Senior",
        "specialization": "Chief Cardiologist",
        "department_id": 2, # Reassign to Orthopedics
        "room_number": "Room 205",
        "status": "busy"
    }
    res = client.put("/api/doctors/1", json=update_payload)
    assert res.status_code == 200

    get_res = client.get("/api/doctors")
    doc1 = next(d for d in get_res.json() if d["id"] == 1)
    assert doc1["name"] == "Dr. Kumar Senior"
    assert doc1["specialization"] == "Chief Cardiologist"
    assert doc1["department_id"] == 2
    assert doc1["room_number"] == "Room 205"
    assert doc1["status"] == "busy"
    db.close()


def test_safe_deletion_or_deactivation_doctor():
    """Verify safe deactivation preserves historical patient visits, while unused doctor is deleted."""
    db = TestingSessionLocal()
    setup_test_data(db)

    # doc1 has completed visit -> safe deactivation to off_duty
    q = QueueEntry(id=1, token_number="CARD-01", patient_id=1, department_id=1, doctor_id=1, status="completed")
    db.add(q)
    db.commit()

    del_res = client.delete("/api/doctors/1")
    assert del_res.status_code == 200
    assert del_res.json()["action"] == "deactivated"

    doc1 = db.query(Doctor).filter(Doctor.id == 1).first()
    assert doc1.status == "off_duty"

    # doc2 has no visits -> should be safely deleted
    del_res2 = client.delete("/api/doctors/2")
    assert del_res2.status_code == 200
    assert del_res2.json()["action"] == "deleted"
    assert db.query(Doctor).filter(Doctor.id == 2).first() is None
    db.close()


def test_departments_rich_stats_crud_and_reassignment():
    """Verify department stats, creation, editing, reassignment, and safe deactivation."""
    db = TestingSessionLocal()
    setup_test_data(db)

    # 1. Get departments with rich stats
    get_res = client.get("/api/departments")
    assert get_res.status_code == 200
    depts = get_res.json()
    assert len(depts) >= 3
    card = next(d for d in depts if d["code"] == "CARD")
    assert card["assigned_doctors_count"] == 1
    assert "operational_status" in card

    # 2. Add department
    create_payload = {
        "name": "Neurology",
        "code": "NEURO",
        "description": "Neurological Sciences",
        "avg_consult_time": 16.0
    }
    create_res = client.post("/api/departments", json=create_payload)
    assert create_res.status_code == 200
    neuro_id = create_res.json()["id"]

    # 3. Reassign doctor 1 to Neurology
    reassign_res = client.post(f"/api/departments/{neuro_id}/reassign-doctors", json={"doctor_ids": [1]})
    assert reassign_res.status_code == 200

    # 4. Verify reassignment
    depts_after = client.get("/api/departments").json()
    neuro = next(d for d in depts_after if d["id"] == neuro_id)
    assert neuro["assigned_doctors_count"] == 1
    assert neuro["doctors"][0]["id"] == 1

    # 5. Update department
    update_res = client.put(f"/api/departments/{neuro_id}", json={"avg_consult_time": 18.0, "description": "Updated neuro unit"})
    assert update_res.status_code == 200
    assert update_res.json()["avg_consult_time"] == 18.0

    # 6. Delete empty department
    empty_dept = client.post("/api/departments", json={"name": "Temporary", "code": "TEMP"}).json()
    del_res = client.delete(f"/api/departments/{empty_dept['id']}")
    assert del_res.status_code == 200
    assert del_res.json()["action"] == "deleted"
    db.close()


