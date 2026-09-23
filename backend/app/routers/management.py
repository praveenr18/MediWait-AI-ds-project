import io
import csv
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.all_models import (
    Doctor, Department, Alert, Feedback, Notification, User, QueueEntry
)
from app.schemas.schemas import FeedbackCreate, AlertOut
from app.utils.auth import hash_password

router = APIRouter(prefix="/api", tags=["Management & Administration"])

# Doctors
class DoctorCreate(BaseModel):
    name: str
    email: str
    department_id: int
    room_number: str = "Room 101"
    avg_consult_time: float = 12.0
    phone: Optional[str] = None

class DoctorUpdate(BaseModel):
    status: Optional[str] = None
    room_number: Optional[str] = None
    avg_consult_time: Optional[float] = None
    current_patients_count: Optional[int] = None

@router.get("/doctors")
def get_doctors(db: Session = Depends(get_db)):
    doctors = db.query(Doctor).all()
    res = []
    for d in doctors:
        name = d.user.full_name if d.user else "Dr. Unknown"
        email = d.user.email if d.user else ""
        dept_name = d.department.name if d.department else "General"
        res.append({
            "id": d.id,
            "name": name,
            "email": email,
            "department_id": d.department_id,
            "department": dept_name,
            "room_number": d.room_number,
            "status": d.status,
            "avg_consult_time": d.avg_consult_time,
            "current_patients_count": d.current_patients_count,
            "workload": "High" if d.current_patients_count > 30 else ("Moderate" if d.current_patients_count > 15 else "Optimal")
        })
    return res

@router.post("/doctors")
def add_doctor(payload: DoctorCreate, db: Session = Depends(get_db)):
    user = User(
        email=payload.email,
        hashed_password=hash_password("doctor123"),
        full_name=payload.name,
        role="doctor",
        phone=payload.phone
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    doc = Doctor(
        user_id=user.id,
        department_id=payload.department_id,
        room_number=payload.room_number,
        avg_consult_time=payload.avg_consult_time,
        status="available"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"message": "Doctor added successfully", "id": doc.id}

@router.put("/doctors/{doctor_id}")
def update_doctor(doctor_id: int, payload: DoctorUpdate, db: Session = Depends(get_db)):
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if payload.status:
        doc.status = payload.status
    if payload.room_number:
        doc.room_number = payload.room_number
    if payload.avg_consult_time is not None:
        doc.avg_consult_time = payload.avg_consult_time
    if payload.current_patients_count is not None:
        doc.current_patients_count = payload.current_patients_count
    db.commit()
    return {"message": "Doctor updated successfully"}

# Departments
class DepartmentCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    avg_consult_time: float = 10.0

@router.get("/departments")
def get_departments(db: Session = Depends(get_db)):
    return db.query(Department).all()

@router.post("/departments")
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db)):
    dept = Department(
        name=payload.name,
        code=payload.code.upper(),
        description=payload.description,
        avg_consult_time=payload.avg_consult_time,
        is_active=True
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept

# Alerts
@router.get("/alerts", response_model=List[AlertOut])
def get_alerts(db: Session = Depends(get_db)):
    return db.query(Alert).order_by(Alert.created_at.desc()).all()

@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    al = db.query(Alert).filter(Alert.id == alert_id).first()
    if not al:
        raise HTTPException(status_code=404, detail="Alert not found")
    al.is_resolved = True
    db.commit()
    return {"message": "Alert marked as resolved"}

# Feedback
@router.post("/feedback")
def submit_feedback(payload: FeedbackCreate, db: Session = Depends(get_db)):
    entry = db.query(QueueEntry).filter(QueueEntry.id == payload.queue_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
        
    fb = Feedback(
        queue_id=entry.id,
        patient_id=entry.patient_id,
        doctor_id=entry.doctor_id,
        rating=payload.rating,
        comments=payload.comments,
        created_at=datetime.utcnow()
    )
    db.add(fb)
    db.commit()
    return {"message": "Feedback submitted successfully. Thank you for helping us improve care delivery!"}

@router.get("/feedback")
def list_feedback(db: Session = Depends(get_db)):
    return db.query(Feedback).order_by(Feedback.created_at.desc()).limit(20).all()

# Notifications
@router.get("/notifications")
def get_notifications(user_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Notification)
    if user_id:
        query = query.filter(Notification.user_id == user_id)
    return query.order_by(Notification.created_at.desc()).all()

@router.post("/notifications/read-all")
def mark_all_notifications_read(db: Session = Depends(get_db)):
    db.query(Notification).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}

# Reports & CSV Export
@router.get("/reports")
def get_reports_summary():
    return {
        "daily_summary": {
            "total_visits": 245,
            "avg_wait_minutes": 21,
            "emergency_treated": 14,
            "on_time_consultations": "91.4%",
            "patient_satisfaction_score": "4.7 / 5"
        },
        "department_metrics": [
            {"department": "Cardiology", "patients": 68, "avg_wait": 34, "satisfaction": 4.6},
            {"department": "Orthopedics", "patients": 49, "avg_wait": 18, "satisfaction": 4.8},
            {"department": "General Medicine", "patients": 74, "avg_wait": 15, "satisfaction": 4.7},
            {"department": "ENT", "patients": 32, "avg_wait": 12, "satisfaction": 4.9},
            {"department": "Dermatology", "patients": 22, "avg_wait": 8, "satisfaction": 4.9}
        ]
    }

@router.get("/reports/export")
def export_reports_csv(report_type: str = "daily", db: Session = Depends(get_db)):
    entries = db.query(QueueEntry).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Token", "Patient Name", "Department", "Doctor", "Priority",
        "Status", "Estimated Wait (Min)", "Confidence (%)", "Registered At"
    ])
    
    for e in entries:
        p_name = e.patient.user.full_name if e.patient and e.patient.user else "Unknown"
        d_name = e.department.name if e.department else "General"
        doc_name = e.doctor.user.full_name if e.doctor and e.doctor.user else "Unassigned"
        reg_time = e.registered_at.strftime("%Y-%m-%d %H:%M") if e.registered_at else ""
        
        writer.writerow([
            e.token_number, p_name, d_name, doc_name, e.priority,
            e.status, e.estimated_wait_minutes, e.prediction_confidence, reg_time
        ])
        
    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mediwait_{report_type}_report.csv"}
    )
