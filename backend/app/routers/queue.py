from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database.connection import get_db
from app.models.all_models import (
    QueueEntry, QueueEvent, Patient, Doctor, Department,
    User, PredictionLog, Notification, Alert
)
from app.schemas.schemas import (
    PatientRegistration, QueueEntryOut, QueueStatusUpdate,
    DepartmentWaitSummary
)
from app.ml.prediction_engine import prediction_engine
from app.utils.auth import get_current_user_optional

router = APIRouter(prefix="/api/queue", tags=["Queue Management"])

def format_queue_entry(entry: QueueEntry, db: Session) -> QueueEntryOut:
    p_name = entry.patient.user.full_name if entry.patient and entry.patient.user else "Patient"
    p_phone = entry.patient.user.phone if entry.patient and entry.patient.user else None
    p_mrn = entry.patient.mrn if entry.patient else None
    d_name = entry.department.name if entry.department else "General"
    doc_name = entry.doctor.user.full_name if entry.doctor and entry.doctor.user else "Attending Doctor"
    
    # Calculate how many patients are ahead in this department
    patients_ahead = 0
    if entry.status == "waiting":
        patients_ahead = db.query(QueueEntry).filter(
            QueueEntry.department_id == entry.department_id,
            QueueEntry.status == "waiting",
            QueueEntry.id < entry.id
        ).count()
        
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
        status=entry.status,
        priority=entry.priority,
        queue_position=entry.queue_position,
        patients_ahead=patients_ahead,
        estimated_wait_minutes=entry.estimated_wait_minutes,
        prediction_confidence=entry.prediction_confidence,
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
    query = db.query(QueueEntry)
    
    if department_id:
        query = query.filter(QueueEntry.department_id == department_id)
    if doctor_id:
        query = query.filter(QueueEntry.doctor_id == doctor_id)
    if status and status != "all":
        query = query.filter(QueueEntry.status == status)
        
    entries = query.order_by(
        QueueEntry.status.desc(), # consulting first, then waiting
        QueueEntry.priority.desc(), # emergency first
        QueueEntry.id.asc()
    ).all()
    
    result = []
    for e in entries:
        out = format_queue_entry(e, db)
        if search:
            s_lower = search.lower()
            if s_lower not in out.token_number.lower() and s_lower not in out.patient_name.lower():
                continue
        result.append(out)
    return result

@router.get("/my-token", response_model=QueueEntryOut)
def get_my_token(
    token_number: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Returns active token details. If specific token_number is requested, returns that;
    otherwise returns the logged in user's active token, or defaults to A-127 (John Doe).
    """
    if token_number:
        entry = db.query(QueueEntry).filter(QueueEntry.token_number == token_number).first()
        if entry:
            return format_queue_entry(entry, db)
            
    if current_user and current_user.patient_profile:
        entry = db.query(QueueEntry).filter(
            QueueEntry.patient_id == current_user.patient_profile.id,
            QueueEntry.status.in_(["registered", "waiting", "consulting"])
        ).order_by(QueueEntry.id.desc()).first()
        if entry:
            return format_queue_entry(entry, db)
            
    # Default to John Doe's token A-127
    entry = db.query(QueueEntry).filter(QueueEntry.token_number == "A-127").first()
    if not entry:
        entry = db.query(QueueEntry).first()
    if not entry:
        raise HTTPException(status_code=404, detail="No active token found")
    return format_queue_entry(entry, db)

@router.get("/departments", response_model=List[DepartmentWaitSummary])
def get_department_waiting_times(db: Session = Depends(get_db)):
    departments = db.query(Department).filter(Department.is_active == True).all()
    res = []
    
    for d in departments:
        waiting_count = db.query(QueueEntry).filter(
            QueueEntry.department_id == d.id,
            QueueEntry.status == "waiting"
        ).count()
        
        consulting_count = db.query(QueueEntry).filter(
            QueueEntry.department_id == d.id,
            QueueEntry.status == "consulting"
        ).count()
        
        active_doctors = db.query(Doctor).filter(
            Doctor.department_id == d.id,
            Doctor.status.in_(["available", "busy"])
        ).count() or 1
        
        # Calculate avg wait from active waiting entries or department default
        avg_wait_row = db.query(func.avg(QueueEntry.estimated_wait_minutes)).filter(
            QueueEntry.department_id == d.id,
            QueueEntry.status == "waiting"
        ).scalar()
        
        if avg_wait_row is not None:
            avg_wait = int(round(avg_wait_row))
        else:
            avg_wait = int(round(d.avg_consult_time * 1.5))
            
        status_badge = "High" if avg_wait > 30 else ("Moderate" if avg_wait > 15 else "Normal")
        
        res.append(DepartmentWaitSummary(
            id=d.id,
            name=d.name,
            code=d.code,
            waiting_count=waiting_count,
            consulting_count=consulting_count,
            doctors_on_duty=active_doctors,
            avg_wait_minutes=avg_wait,
            status_badge=status_badge
        ))
    return res

@router.post("/register", response_model=QueueEntryOut)
def register_patient(payload: PatientRegistration, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    # Check or create user/patient
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
        # Update user name if new one provided
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
        
    # Generate Token: prefix based on dept code e.g. A-129, B-202
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
    
    # Calculate queue stats for ML model
    waiting_count = db.query(QueueEntry).filter(
        QueueEntry.department_id == dept.id,
        QueueEntry.status == "waiting"
    ).count()
    
    doctors_available = db.query(Doctor).filter(
        Doctor.department_id == dept.id,
        Doctor.status == "available"
    ).count() or 1
    
    emergency_cases = db.query(QueueEntry).filter(
        QueueEntry.department_id == dept.id,
        QueueEntry.priority == "emergency",
        QueueEntry.status == "waiting"
    ).count()
    
    if payload.priority == "emergency":
        emergency_cases += 1
        
    # Run ML prediction engine
    ml_result = prediction_engine.predict(
        department=dept.name,
        queue_length=waiting_count + 1,
        doctor_available=doctors_available,
        emergency_cases=emergency_cases,
        avg_consultation_time=dept.avg_consult_time,
        patient_count=max(20, waiting_count * 2)
    )
    
    assigned_doc = None
    if payload.doctor_id:
        assigned_doc = db.query(Doctor).filter(Doctor.id == payload.doctor_id).first()
    if not assigned_doc:
        assigned_doc = db.query(Doctor).filter(
            Doctor.department_id == dept.id,
            Doctor.status == "available"
        ).first()
        
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
    db.commit()
    db.refresh(queue_entry)
    
    # Log prediction & event
    pred_log = PredictionLog(
        queue_id=queue_entry.id,
        department_id=dept.id,
        predicted_wait_minutes=ml_result["predicted_wait_minutes"],
        confidence_pct=ml_result["confidence_pct"],
        model_name=ml_result["model_used"],
        inputs_json=str(ml_result["inputs"]),
        explanation_json=str(ml_result["explanation"])
    )
    db.add(pred_log)
    
    ev = QueueEvent(
        queue_id=queue_entry.id,
        event_type="registered",
        notes=f"Generated token {token_number} with estimated wait {ml_result['predicted_wait_minutes']}m"
    )
    db.add(ev)
    
    # Add patient notification
    notif = Notification(
        user_id=user.id,
        title="Token Generated",
        message=f"Your token {token_number} for {dept.name} is confirmed. Estimated wait: {ml_result['predicted_wait_minutes']} mins.",
        category="queue"
    )
    db.add(notif)
    db.commit()
    
    return format_queue_entry(queue_entry, db)

@router.post("/{entry_id}/call-next", response_model=QueueEntryOut)
def call_next_patient(entry_id: int, doctor_id: Optional[int] = None, db: Session = Depends(get_db)):
    entry = db.query(QueueEntry).filter(QueueEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
        
    entry.status = "consulting"
    entry.consultation_started_at = datetime.utcnow()
    if doctor_id:
        entry.doctor_id = doctor_id
    entry.estimated_wait_minutes = 0
    
    ev = QueueEvent(queue_id=entry.id, event_type="called", notes="Patient called into consultation room")
    db.add(ev)
    
    if entry.patient and entry.patient.user:
        notif = Notification(
            user_id=entry.patient.user.id,
            title="Consultation Started",
            message=f"Please proceed to Room. Consultation for token {entry.token_number} has begun.",
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
    
    ev = QueueEvent(queue_id=entry.id, event_type="completed", notes="Consultation completed")
    db.add(ev)
    
    if entry.patient and entry.patient.user:
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
    db.commit()
    db.refresh(entry)
    return format_queue_entry(entry, db)

@router.post("/recalculate")
def recalculate_queue(db: Session = Depends(get_db)):
    """Recalculates ML wait times across all waiting patients"""
    waiting_entries = db.query(QueueEntry).filter(QueueEntry.status == "waiting").all()
    count = 0
    for e in waiting_entries:
        dept = e.department
        waiting_ahead = db.query(QueueEntry).filter(
            QueueEntry.department_id == e.department_id,
            QueueEntry.status == "waiting",
            QueueEntry.id <= e.id
        ).count()
        
        docs = db.query(Doctor).filter(
            Doctor.department_id == e.department_id,
            Doctor.status.in_(["available", "busy"])
        ).count() or 1
        
        emerg = db.query(QueueEntry).filter(
            QueueEntry.department_id == e.department_id,
            QueueEntry.priority == "emergency",
            QueueEntry.status == "waiting"
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
    return {"message": f"Successfully recalculated predictions for {count} active queue entries."}
