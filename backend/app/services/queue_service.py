from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from app.models.all_models import QueueEntry, Doctor, Department

# Standardized Queue Status Constants
STATUS_WAITING = "waiting"
STATUS_REGISTERED = "registered"
STATUS_CONSULTING = "consulting"
STATUS_IN_CONSULTATION = "in_consultation"
STATUS_COMPLETED = "completed"
STATUS_CANCELLED = "cancelled"

# Status Categories
WAITING_STATUSES = [STATUS_WAITING, STATUS_REGISTERED]
CONSULTING_STATUSES = [STATUS_CONSULTING, STATUS_IN_CONSULTATION]
ACTIVE_STATUSES = WAITING_STATUSES + CONSULTING_STATUSES
INACTIVE_STATUSES = [STATUS_COMPLETED, STATUS_CANCELLED]

def is_waiting_status(status: Optional[str]) -> bool:
    """Returns True if the status represents a patient currently waiting in queue."""
    return status in WAITING_STATUSES if status else False

def is_consulting_status(status: Optional[str]) -> bool:
    """Returns True if the status represents a patient currently in consultation with a doctor."""
    return status in CONSULTING_STATUSES if status else False

def is_active_status(status: Optional[str]) -> bool:
    """Returns True if the patient is currently in the active hospital queue (waiting or consulting)."""
    return status in ACTIVE_STATUSES if status else False

def get_queue_statistics(db: Session, department_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Computes single source-of-truth queue metrics from the database.
    Can compute hospital-wide metrics (department_id=None) or department-specific metrics.
    
    Guarantees:
    - Never hardcodes fallback numbers like 42 or 3.
    - Accurately counts waiting, consulting, and emergency patients.
    - Excludes completed and cancelled patients from active counts.
    - Correctly calculates average wait time across active waiting patients.
    """
    # 1. Active Waiting Patients
    waiting_query = db.query(QueueEntry).filter(QueueEntry.status.in_(WAITING_STATUSES))
    if department_id is not None:
        waiting_query = waiting_query.filter(QueueEntry.department_id == department_id)
    waiting_count = waiting_query.count()

    # 2. Active Consulting Patients (In Consultation)
    consulting_query = db.query(QueueEntry).filter(QueueEntry.status.in_(CONSULTING_STATUSES))
    if department_id is not None:
        consulting_query = consulting_query.filter(QueueEntry.department_id == department_id)
    consulting_count = consulting_query.count()

    # 3. Emergency Cases Currently Waiting in Queue
    emergency_query = waiting_query.filter(QueueEntry.priority == "emergency")
    emergency_count = emergency_query.count()

    # 4. Total Active Patients (Waiting + In Consultation)
    active_total = waiting_count + consulting_count

    # 5. Average Waiting Time for Active Waiting Patients
    avg_wait_row = waiting_query.with_entities(func.avg(QueueEntry.estimated_wait_minutes)).scalar()
    avg_wait_minutes = int(round(avg_wait_row)) if avg_wait_row is not None else 0

    # 6. Doctors Status
    doc_query = db.query(Doctor)
    if department_id is not None:
        doc_query = doc_query.filter(Doctor.department_id == department_id)
    total_docs = doc_query.count() or 0
    avail_docs = doc_query.filter(Doctor.status == "available").count()

    # 7. Queue Health Status
    if waiting_count == 0:
        queue_status = "Normal"
    elif avg_wait_minutes <= 25:
        queue_status = "Normal"
    elif avg_wait_minutes <= 35:
        queue_status = "Moderate"
    else:
        queue_status = "Elevated"

    return {
        "waiting_count": waiting_count,
        "consulting_count": consulting_count,
        "emergency_count": emergency_count,
        "active_total": active_total,
        "avg_wait_minutes": avg_wait_minutes,
        "queue_status": queue_status,
        "doctors_available": avail_docs,
        "doctors_total": total_docs,
        "doctors_ratio": f"{avail_docs} / {total_docs}" if total_docs > 0 else "0 / 0"
    }

def get_active_queue_entries(
    db: Session,
    department_id: Optional[int] = None,
    doctor_id: Optional[int] = None,
    status: Optional[str] = None
) -> List[QueueEntry]:
    """
    Retrieves queue entries with standardized filtering.
    Defaults to active entries (waiting and consulting) unless an explicit status like 'all', 'completed' is requested.
    """
    query = db.query(QueueEntry)

    if department_id:
        query = query.filter(QueueEntry.department_id == department_id)
    if doctor_id:
        query = query.filter(QueueEntry.doctor_id == doctor_id)

    if status and status != "all":
        if status == "waiting":
            query = query.filter(QueueEntry.status.in_(WAITING_STATUSES))
        elif status in ["consulting", "in_consultation"]:
            query = query.filter(QueueEntry.status.in_(CONSULTING_STATUSES))
        elif status == "active":
            query = query.filter(QueueEntry.status.in_(ACTIVE_STATUSES))
        elif status in ["completed", "cancelled"]:
            query = query.filter(QueueEntry.status == status)
        else:
            query = query.filter(QueueEntry.status == status)
    elif not status:
        # Default behavior for live queue: return only active patients!
        query = query.filter(QueueEntry.status.in_(ACTIVE_STATUSES))

    # Order: Consulting first, then Emergency Waiting, then Normal Waiting by position & ID
    order_clause = case(
        (QueueEntry.status.in_(CONSULTING_STATUSES), 1),
        (and_(QueueEntry.status.in_(WAITING_STATUSES), QueueEntry.priority == "emergency"), 2),
        (QueueEntry.status.in_(WAITING_STATUSES), 3),
        else_=4
    )

    return query.order_by(
        order_clause.asc(),
        QueueEntry.queue_position.asc(),
        QueueEntry.id.asc()
    ).all()

def reindex_queue_positions(db: Session, department_id: Optional[int] = None) -> None:
    """
    Recalculates contiguous 1-based queue positions for all active waiting patients in priority order:
    1. Emergency cases (sorted by registered_at / id)
    2. Normal cases (sorted by registered_at / id)
    Ensures consulting, completed, and cancelled patients have queue_position = 0.
    """
    if department_id is not None:
        dept_ids = [department_id]
    else:
        dept_ids = [d[0] for d in db.query(Department.id).all()]
        
    for d_id in dept_ids:
        # Clear positions for non-waiting entries
        non_waiting = db.query(QueueEntry).filter(
            QueueEntry.department_id == d_id,
            ~QueueEntry.status.in_(WAITING_STATUSES)
        ).all()
        for nw in non_waiting:
            nw.queue_position = 0

        # Get all waiting entries in priority order
        waiting_entries = db.query(QueueEntry).filter(
            QueueEntry.department_id == d_id,
            QueueEntry.status.in_(WAITING_STATUSES)
        ).order_by(
            case((QueueEntry.priority == "emergency", 0), else_=1),
            QueueEntry.registered_at.asc(),
            QueueEntry.id.asc()
        ).all()
        
        for idx, entry in enumerate(waiting_entries, start=1):
            entry.queue_position = idx

def calculate_queue_state(entry: QueueEntry, db: Session) -> Dict[str, Any]:
    """
    Authoritative single-source queue metrics calculation for a queue entry.
    Strictly enforces:
    - Active waiting patients have contiguous 1-based queue_position (1, 2, 3...)
    - Patients ahead = max(0, queue_position - 1)
    - Emergency cases ahead = count of emergency waiting patients before this position
    - Consulting, completed, and cancelled patients have queue_position=0, patients_ahead=0, est_wait=0
    """
    if entry.status in WAITING_STATUSES:
        queue_pos = entry.queue_position if (entry.queue_position and entry.queue_position > 0) else 1
        patients_ahead = max(0, queue_pos - 1)
        emergency_cases_ahead = db.query(QueueEntry).filter(
            QueueEntry.department_id == entry.department_id,
            QueueEntry.status.in_(WAITING_STATUSES),
            QueueEntry.priority == "emergency",
            QueueEntry.id != entry.id,
            QueueEntry.queue_position < queue_pos
        ).count()
        est_wait = entry.estimated_wait_minutes if entry.estimated_wait_minutes is not None else 0
        confidence = entry.prediction_confidence if entry.prediction_confidence is not None else 0
    else:
        queue_pos = 0
        patients_ahead = 0
        emergency_cases_ahead = 0
        est_wait = 0
        confidence = entry.prediction_confidence if entry.status in CONSULTING_STATUSES else 0
        
    return {
        "queue_position": queue_pos,
        "patients_ahead": patients_ahead,
        "emergency_cases_ahead": emergency_cases_ahead,
        "estimated_wait_minutes": est_wait,
        "prediction_confidence": confidence
    }

def recalculate_department_wait_times(db: Session, department_id: int) -> None:
    """
    Recalculates ML predicted waiting times for all active waiting patients in the department
    based on their updated queue position, available doctors, and emergency cases ahead.
    """
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        return
        
    waiting_entries = db.query(QueueEntry).filter(
        QueueEntry.department_id == department_id,
        QueueEntry.status.in_(WAITING_STATUSES)
    ).order_by(QueueEntry.queue_position.asc()).all()
    
    if not waiting_entries:
        return

    docs_available = db.query(Doctor).filter(
        Doctor.department_id == department_id,
        Doctor.status.in_(["available", "busy"])
    ).count() or 1
    
    from app.ml.prediction_engine import prediction_engine
    
    for entry in waiting_entries:
        pos = entry.queue_position or 1
        emerg_ahead = db.query(QueueEntry).filter(
            QueueEntry.department_id == department_id,
            QueueEntry.priority == "emergency",
            QueueEntry.status.in_(WAITING_STATUSES),
            QueueEntry.queue_position <= pos
        ).count()
        
        ml_res = prediction_engine.predict(
            department=dept.name,
            queue_length=pos,
            doctor_available=docs_available,
            emergency_cases=emerg_ahead,
            avg_consultation_time=dept.avg_consult_time
        )
        entry.estimated_wait_minutes = ml_res["predicted_wait_minutes"]
        entry.prediction_confidence = ml_res["confidence_pct"]

