from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from app.database.connection import get_db
from app.models.all_models import (
    QueueEntry, QueueEvent, Patient, Doctor, Department,
    User, PredictionLog, Notification, Alert
)
from app.schemas.schemas import (
    PatientRegistration, QueueEntryOut, QueueStatusUpdate,
    DepartmentWaitSummary
)
from app.services.queue_service import (
    WAITING_STATUSES, CONSULTING_STATUSES, ACTIVE_STATUSES,
    STATUS_WAITING, STATUS_CONSULTING, STATUS_COMPLETED, STATUS_CANCELLED,
    get_queue_statistics, get_active_queue_entries, reindex_queue_positions,
    calculate_queue_state, recalculate_department_wait_times
)
from app.ml.prediction_engine import prediction_engine
from app.utils.auth import get_current_user_optional

router = APIRouter(prefix="/api/queue", tags=["Queue Management"])

def format_queue_entry(entry: QueueEntry, db: Session) -> QueueEntryOut:
    p_name = entry.patient.user.full_name if entry.patient and entry.patient.user else "Patient"
    p_phone = entry.patient.user.phone if entry.patient and entry.patient.user else None
    p_mrn = entry.patient.mrn if entry.patient else None
    d_name = entry.department.name if entry.department else "General"
    
    if entry.doctor and entry.doctor.user:
        doc_name = entry.doctor.user.full_name
        doc_room = entry.doctor.room_number or "Room 101"
    else:
        doc_name = "Pending Doctor Assignment"
        doc_room = "Triage Desk"
        
    state = calculate_queue_state(entry, db)
        
    return QueueEntryOut(
        id=entry.id,
        token_number=entry.token_number,
        patient_id=entry.patient_id,
        patient_name=p_name,
        patient_phone=p_phone,
        patient_mrn=p_mrn,
        department_id=entry.department_id,
        department_name=d_name,
        doctor_id=entry.doctor_id,
        doctor_name=doc_name,
        doctor_room=doc_room,
        status=entry.status,
        priority=entry.priority,
        queue_position=state["queue_position"],
        patients_ahead=state["patients_ahead"],
        emergency_cases_ahead=state["emergency_cases_ahead"],
        estimated_wait_minutes=state["estimated_wait_minutes"],
        prediction_confidence=state["prediction_confidence"],
        registered_at=entry.registered_at,
        consultation_started_at=entry.consultation_started_at,
        completed_at=entry.completed_at
    )

@router.get("", response_model=List[QueueEntryOut])
def get_queue(
    department_id: Optional[int] = None,
    doctor_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    entries = get_active_queue_entries(
        db=db,
        department_id=department_id,
        doctor_id=doctor_id,
        status=status
    )
    
    result = []
    for e in entries:
        out = format_queue_entry(e, db)
        if search:
            s_lower = search.lower()
            if s_lower not in out.token_number.lower() and s_lower not in out.patient_name.lower():
                continue
        result.append(out)
    return result

@router.get("/stats")
def get_queue_stats(
    department_id: Optional[int] = Query(None, description="Optional department filter"),
    db: Session = Depends(get_db)
):
    """Returns single-source-of-truth queue statistics matching Dashboard and Live Queue definitions."""
    return get_queue_statistics(db, department_id=department_id)

@router.get("/my-token", response_model=QueueEntryOut)
def get_my_token(
    visit_id: Optional[int] = Query(None, description="Specific visit ID"),
    token_number: Optional[str] = Query(None, description="Specific token number"),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Returns visit details based on priority:
    1. If specific visit_id is provided, returns that visit.
    2. If specific token_number is provided, returns that token.
    3. If patient user is logged in:
       - Prefers their latest active visit (waiting or consulting).
       - Falls back to their latest completed/historical visit if no active visit exists.
    4. Otherwise falls back to the latest active visit across the hospital.
    """
    if visit_id is not None:
        entry = db.query(QueueEntry).filter(QueueEntry.id == visit_id).first()
        if entry:
            return format_queue_entry(entry, db)
        raise HTTPException(status_code=404, detail=f"Visit ID {visit_id} not found")

    if token_number:
        entry = db.query(QueueEntry).filter(QueueEntry.token_number == token_number).first()
        if entry:
            return format_queue_entry(entry, db)
        raise HTTPException(status_code=404, detail=f"Token {token_number} not found")
            
    if current_user and current_user.patient_profile:
        # First check for an active visit (waiting or consulting)
        entry = db.query(QueueEntry).filter(
            QueueEntry.patient_id == current_user.patient_profile.id,
            QueueEntry.status.in_(ACTIVE_STATUSES)
        ).order_by(QueueEntry.id.desc()).first()
        if not entry:
            # Fallback to most recent visit for this patient
            entry = db.query(QueueEntry).filter(
                QueueEntry.patient_id == current_user.patient_profile.id
            ).order_by(QueueEntry.id.desc()).first()
        if entry:
            return format_queue_entry(entry, db)
        raise HTTPException(status_code=404, detail="No visits found for current patient")
            
    # Default: look for any active token in queue
    entry = db.query(QueueEntry).filter(
        QueueEntry.status.in_(ACTIVE_STATUSES)
    ).order_by(QueueEntry.id.desc()).first()
    if not entry:
        entry = db.query(QueueEntry).order_by(QueueEntry.id.desc()).first()
    if not entry:
        raise HTTPException(status_code=404, detail="No active token found")
    return format_queue_entry(entry, db)

@router.get("/my-visits", response_model=List[QueueEntryOut])
def get_my_visits(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Returns all visits (both active and completed) belonging to the authenticated patient,
    ordered by latest first.
    """
    if not current_user or not current_user.patient_profile:
        return []
    entries = db.query(QueueEntry).filter(
        QueueEntry.patient_id == current_user.patient_profile.id
    ).order_by(QueueEntry.id.desc()).all()
    return [format_queue_entry(e, db) for e in entries]

@router.get("/departments", response_model=List[DepartmentWaitSummary])
def get_department_waiting_times(db: Session = Depends(get_db)):
    departments = db.query(Department).filter(Department.is_active == True).all()
    res = []
    
    for d in departments:
        stats = get_queue_statistics(db, department_id=d.id)
        
        status_badge = "High" if stats["avg_wait_minutes"] > 30 else ("Moderate" if stats["avg_wait_minutes"] > 15 else "Normal")
        
        res.append(DepartmentWaitSummary(
            id=d.id,
            name=d.name,
            code=d.code,
            waiting_count=stats["waiting_count"],
            consulting_count=stats["consulting_count"],
            doctors_on_duty=stats["doctors_available"] or stats["doctors_total"] or 1,
            avg_wait_minutes=stats["avg_wait_minutes"],
            status_badge=status_badge
        ))
    return res

@router.post("/register", response_model=QueueEntryOut)
def register_patient(
    payload: PatientRegistration,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    # Check or link user/patient:
    # If the current user is authenticated as a patient, link registration directly to them!
    if current_user and (current_user.role == "patient" or current_user.patient_profile):
        user = current_user
        if payload.patient_name and user.full_name != payload.patient_name:
            user.full_name = payload.patient_name
        if payload.phone and user.phone != payload.phone:
            user.phone = payload.phone
        db.commit()
        
        patient = user.patient_profile
        if not patient:
            import uuid
            mrn = f"MRN-{1000 + user.id}"
            if db.query(Patient).filter(Patient.mrn == mrn).first():
                mrn = f"MRN-{1000 + user.id}-{uuid.uuid4().hex[:4].upper()}"
            patient = Patient(
                user_id=user.id,
                mrn=mrn,
                age=payload.age,
                gender=payload.gender
            )
            db.add(patient)
            db.commit()
            db.refresh(patient)
        else:
            if payload.age:
                patient.age = payload.age
            if payload.gender:
                patient.gender = payload.gender
            db.commit()
    else:
        # Check or create user/patient by phone
        user = db.query(User).filter(User.phone == payload.phone).first()
        if not user:
            clean_phone = "".join(c for c in payload.phone if c.isdigit()) or "user"
            import uuid
            email = f"patient_{clean_phone}_{uuid.uuid4().hex[:6]}@mediwait.ai"
            user = User(
                email=email,
                hashed_password="demo_password",
                full_name=payload.patient_name,
                role="patient",
                phone=payload.phone
            )
            db.add(user)
            try:
                db.commit()
                db.refresh(user)
            except Exception:
                db.rollback()
                email = f"patient_{clean_phone}_{uuid.uuid4().hex}@mediwait.ai"
                user = User(
                    email=email,
                    hashed_password="demo_password",
                    full_name=payload.patient_name,
                    role="patient",
                    phone=payload.phone
                )
                db.add(user)
                db.commit()
                db.refresh(user)
        else:
            if payload.patient_name and user.full_name != payload.patient_name:
                user.full_name = payload.patient_name
                db.commit()
            
        patient = db.query(Patient).filter(Patient.user_id == user.id).first()
        if not patient:
            import uuid
            mrn = f"MRN-{1000 + user.id}"
            if db.query(Patient).filter(Patient.mrn == mrn).first():
                mrn = f"MRN-{1000 + user.id}-{uuid.uuid4().hex[:4].upper()}"
            patient = Patient(
                user_id=user.id,
                mrn=mrn,
                age=payload.age,
                gender=payload.gender
            )
            db.add(patient)
            db.commit()
            db.refresh(patient)
        else:
            if payload.age:
                patient.age = payload.age
            if payload.gender:
                patient.gender = payload.gender
            db.commit()
        
    # Generate unique Token: prefix based on dept code e.g. A-129, B-202
    prefix = dept.code[0] if dept.code else "T"
    last_entry = db.query(QueueEntry).filter(
        QueueEntry.department_id == dept.id
    ).order_by(QueueEntry.id.desc()).first()
    
    if last_entry and "-" in last_entry.token_number:
        try:
            num = int(last_entry.token_number.split("-")[1]) + 1
        except Exception:
            num = 101
    else:
        num = 101
        
    token_number = f"{prefix}-{num}"
    while db.query(QueueEntry).filter(QueueEntry.token_number == token_number).first():
        num += 1
        token_number = f"{prefix}-{num}"
    
    # Doctor assignment:
    assigned_doc = None
    if payload.doctor_id:
        assigned_doc = db.query(Doctor).filter(
            Doctor.id == payload.doctor_id,
            Doctor.department_id == dept.id,
            Doctor.status != "off_duty"
        ).first()
    if not assigned_doc:
        # 1. Prefer available doctors in this department with least active waiting load
        avail_docs = db.query(Doctor).filter(
            Doctor.department_id == dept.id,
            Doctor.status == "available"
        ).all()
        if avail_docs:
            assigned_doc = min(
                avail_docs,
                key=lambda d: db.query(QueueEntry).filter(
                    QueueEntry.doctor_id == d.id,
                    QueueEntry.status.in_(WAITING_STATUSES)
                ).count()
            )
        else:
            # 2. Check for any on-duty doctor in this department
            on_duty_docs = db.query(Doctor).filter(
                Doctor.department_id == dept.id,
                Doctor.status != "off_duty"
            ).all()
            if on_duty_docs:
                assigned_doc = min(
                    on_duty_docs,
                    key=lambda d: db.query(QueueEntry).filter(
                        QueueEntry.doctor_id == d.id,
                        QueueEntry.status.in_(WAITING_STATUSES)
                    ).count()
                )

    # Initial rough waiting metrics
    waiting_count = db.query(QueueEntry).filter(
        QueueEntry.department_id == dept.id,
        QueueEntry.status.in_(WAITING_STATUSES)
    ).count()
    
    doctors_available = db.query(Doctor).filter(
        Doctor.department_id == dept.id,
        Doctor.status == "available"
    ).count() or 1
    
    emergency_cases = db.query(QueueEntry).filter(
        QueueEntry.department_id == dept.id,
        QueueEntry.priority == "emergency",
        QueueEntry.status.in_(WAITING_STATUSES)
    ).count()
    
    if payload.priority == "emergency":
        emergency_cases += 1
        
    # Run ML prediction engine for initial baseline estimate
    ml_result = prediction_engine.predict(
        department=dept.name,
        queue_length=waiting_count + 1,
        doctor_available=doctors_available,
        emergency_cases=emergency_cases,
        avg_consultation_time=dept.avg_consult_time,
        patient_count=max(20, waiting_count * 2)
    )
        
    queue_entry = QueueEntry(
        token_number=token_number,
        patient_id=patient.id,
        department_id=dept.id,
        doctor_id=assigned_doc.id if assigned_doc else None,
        status="waiting",
        priority=payload.priority,
        queue_position=waiting_count + 1,
        estimated_wait_minutes=ml_result["predicted_wait_minutes"],
        prediction_confidence=ml_result["confidence_pct"],
        registered_at=datetime.utcnow()
    )
    db.add(queue_entry)
    db.flush()
    
    # Reindex waiting queue for this department to maintain strict priority ordering
    reindex_queue_positions(db, dept.id)
    # Recalculate ML wait times across all waiting patients in this department
    recalculate_department_wait_times(db, dept.id)
    
    # Log prediction & event
    pred_log = PredictionLog(
        queue_id=queue_entry.id,
        department_id=dept.id,
        predicted_wait_minutes=queue_entry.estimated_wait_minutes,
        confidence_pct=queue_entry.prediction_confidence,
        model_name=ml_result["model_used"],
        inputs_json=str(ml_result["inputs"]),
        explanation_json=str(ml_result["explanation"])
    )
    db.add(pred_log)
    
    ev = QueueEvent(
        queue_id=queue_entry.id,
        event_type="registered",
        notes=f"Generated token {token_number} with estimated wait {queue_entry.estimated_wait_minutes}m"
    )
    db.add(ev)
    
    # Add patient notification if user exists
    notif = Notification(
        user_id=user.id,
        title="Token Generated",
        message=f"Your token {token_number} for {dept.name} is confirmed. Estimated wait: {queue_entry.estimated_wait_minutes} mins.",
        category="queue"
    )
    db.add(notif)
    db.commit()
    db.refresh(queue_entry)
    
    return format_queue_entry(queue_entry, db)

@router.post("/{entry_id}/call-next", response_model=QueueEntryOut)
def call_next_patient(entry_id: int, doctor_id: Optional[int] = None, db: Session = Depends(get_db)):
    entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
        
    entry.status = "consulting"
    entry.consultation_started_at = datetime.utcnow()
    entry.queue_position = 0
    entry.estimated_wait_minutes = 0
    if doctor_id:
        entry.doctor_id = doctor_id
    db.flush()
    
    # Re-index remaining waiting patients and recalculate wait times
    reindex_queue_positions(db, entry.department_id)
    recalculate_department_wait_times(db, entry.department_id)
    
    ev = QueueEvent(queue_id=entry.id, event_type="called", notes="Patient called into consultation room")
    db.add(ev)
    
    if entry.patient and entry.patient.user:
        existing_notif = db.query(Notification).filter(
            Notification.user_id == entry.patient.user.id,
            Notification.title == "Consultation Started",
            Notification.category == "doctor",
            Notification.created_at >= datetime.utcnow() - timedelta(minutes=5)
        ).first()
        if not existing_notif:
            room_label = entry.doctor.room_number if entry.doctor and entry.doctor.room_number else "Room 101"
            notif = Notification(
                user_id=entry.patient.user.id,
                title="Consultation Started",
                message=f"Please proceed to {room_label}. Consultation for token {entry.token_number} has begun.",
                category="doctor"
            )
            db.add(notif)
        
    db.commit()
    db.refresh(entry)
    return format_queue_entry(entry, db)

@router.post("/{entry_id}/complete", response_model=QueueEntryOut)
def complete_consultation(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
        
    entry.status = "completed"
    entry.completed_at = datetime.utcnow()
    entry.queue_position = 0
    entry.estimated_wait_minutes = 0
    db.flush()
    
    # Reindex remaining waiting queue for this department and recalculate wait times
    reindex_queue_positions(db, entry.department_id)
    recalculate_department_wait_times(db, entry.department_id)
    
    ev = QueueEvent(queue_id=entry.id, event_type="completed", notes="Consultation completed")
    db.add(ev)
    
    if entry.patient and entry.patient.user:
        existing_notif = db.query(Notification).filter(
            Notification.user_id == entry.patient.user.id,
            Notification.title == "Consultation Completed",
            Notification.category == "general",
            Notification.created_at >= datetime.utcnow() - timedelta(minutes=5)
        ).first()
        if not existing_notif:
            notif = Notification(
                user_id=entry.patient.user.id,
                title="Consultation Completed",
                message=f"Your visit with {entry.department.name} is complete. Please share your waiting experience!",
                category="general"
            )
            db.add(notif)
        
    db.commit()
    db.refresh(entry)
    return format_queue_entry(entry, db)

@router.post("/{entry_id}/emergency", response_model=QueueEntryOut)
def mark_emergency(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
        
    entry.priority = "emergency"
    db.flush()
    
    # Adjust queue positions and recalculate wait times
    reindex_queue_positions(db, entry.department_id)
    recalculate_department_wait_times(db, entry.department_id)
    
    al = Alert(
        severity="warning",
        title="Emergency Case Escalated",
        message=f"Token {entry.token_number} escalated to Emergency priority in {entry.department.name}.",
        department_name=entry.department.name
    )
    db.add(al)
    db.commit()
    db.refresh(entry)
    return format_queue_entry(entry, db)

@router.post("/{entry_id}/cancel", response_model=QueueEntryOut)
def cancel_queue_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
        
    entry.status = "cancelled"
    entry.queue_position = 0
    entry.estimated_wait_minutes = 0
    db.flush()
    
    # Re-index remaining waiting patients and recalculate wait times
    reindex_queue_positions(db, entry.department_id)
    recalculate_department_wait_times(db, entry.department_id)
        
    db.commit()
    db.refresh(entry)
    return format_queue_entry(entry, db)

@router.post("/recalculate")
def recalculate_queue(db: Session = Depends(get_db)):
    """Recalculates ML wait times and queue positions across all active waiting patients"""
    # 1. Reindex queue positions hospital-wide
    reindex_queue_positions(db)
    
    waiting_entries = db.query(QueueEntry).filter(QueueEntry.status.in_(WAITING_STATUSES)).all()
    count = 0
    for e in waiting_entries:
        dept = e.department
        waiting_ahead = db.query(QueueEntry).filter(
            QueueEntry.department_id == e.department_id,
            QueueEntry.status.in_(WAITING_STATUSES),
            QueueEntry.queue_position <= e.queue_position
        ).count()
        
        docs = db.query(Doctor).filter(
            Doctor.department_id == e.department_id,
            Doctor.status.in_(["available", "busy"])
        ).count() or 1
        
        emerg = db.query(QueueEntry).filter(
            QueueEntry.department_id == e.department_id,
            QueueEntry.priority == "emergency",
            QueueEntry.status.in_(WAITING_STATUSES),
            QueueEntry.queue_position <= e.queue_position
        ).count()
        
        res = prediction_engine.predict(
            department=dept.name,
            queue_length=waiting_ahead,
            doctor_available=docs,
            emergency_cases=emerg,
            avg_consultation_time=dept.avg_consult_time
        )
        e.estimated_wait_minutes = res["predicted_wait_minutes"]
        e.prediction_confidence = res["confidence_pct"]
        count += 1
        
    db.commit()
    return {"message": f"Successfully recalculated predictions and queue positions for {count} active queue entries."}
