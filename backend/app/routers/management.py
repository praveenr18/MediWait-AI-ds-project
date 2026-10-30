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
from app.utils.auth import hash_password, get_current_user_optional

from sqlalchemy import func
from app.services.queue_service import (
    WAITING_STATUSES, CONSULTING_STATUSES, ACTIVE_STATUSES, get_queue_statistics
)

router = APIRouter(prefix="/api", tags=["Management & Administration"])

# Doctors
class DoctorCreate(BaseModel):
    name: str
    email: str
    department_id: int
    specialization: Optional[str] = None
    room_number: str = "Room 101"
    avg_consult_time: float = 12.0
    phone: Optional[str] = None
    status: str = "available"

class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[int] = None
    specialization: Optional[str] = None
    status: Optional[str] = None
    room_number: Optional[str] = None
    avg_consult_time: Optional[float] = None
    current_patients_count: Optional[int] = None

@router.get("/doctors")
def get_doctors(department_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Doctor)
    if department_id:
        query = query.filter(Doctor.department_id == department_id)
    doctors = query.all()
    res = []
    for d in doctors:
        name = d.user.full_name if d.user else "Dr. Unknown"
        email = d.user.email if d.user else ""
        phone = d.user.phone if d.user else ""
        dept_name = d.department.name if d.department else "General"
        
        # Real-time assigned active queue entries
        waiting_entries = db.query(QueueEntry).filter(
            QueueEntry.doctor_id == d.id,
            QueueEntry.status.in_(WAITING_STATUSES)
        ).all()
        waiting_count = len(waiting_entries)
        
        consulting_entry = db.query(QueueEntry).filter(
            QueueEntry.doctor_id == d.id,
            QueueEntry.status.in_(CONSULTING_STATUSES)
        ).first()
        consulting_count = 1 if consulting_entry else 0
        active_patient_count = waiting_count + consulting_count
        
        # Average wait time: if doctor has waiting patients, compute avg; otherwise use department's avg wait
        if waiting_count > 0:
            avg_wait = int(round(sum(w.estimated_wait_minutes or 0 for w in waiting_entries) / waiting_count))
        else:
            dept_stats = get_queue_statistics(db, department_id=d.department_id)
            avg_wait = dept_stats.get("avg_wait_minutes", 0)
            
        # Workload indicator
        if active_patient_count >= 5 or d.current_patients_count > 30:
            workload = "High"
        elif active_patient_count >= 2 or d.current_patients_count > 15:
            workload = "Moderate"
        else:
            workload = "Optimal"
            
        res.append({
            "id": d.id,
            "name": name,
            "email": email,
            "phone": phone,
            "department_id": d.department_id,
            "department": dept_name,
            "specialization": d.specialization or f"{dept_name} Specialist",
            "room_number": d.room_number,
            "status": d.status,
            "avg_consult_time": d.avg_consult_time,
            "current_patients_count": d.current_patients_count,
            "active_patient_count": active_patient_count,
            "waiting_count": waiting_count,
            "consulting_count": consulting_count,
            "avg_wait_minutes": avg_wait,
            "workload": workload,
            "currently_consulting": {
                "token_number": consulting_entry.token_number,
                "patient_name": consulting_entry.patient.user.full_name if consulting_entry.patient and consulting_entry.patient.user else "Patient"
            } if consulting_entry else None
        })
    return res

@router.post("/doctors")
def add_doctor(payload: DoctorCreate, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    clean_email = payload.email.strip().lower()
    existing_user = db.query(User).filter(User.email == clean_email).first()
    if existing_user:
        if existing_user.doctor_profile:
            raise HTTPException(status_code=400, detail="A doctor with this email address already exists.")
        user = existing_user
        user.role = "doctor"
        user.full_name = payload.name.strip()
        if payload.phone:
            user.phone = payload.phone.strip()
    else:
        user = User(
            email=clean_email,
            hashed_password=hash_password("doctor123"),
            full_name=payload.name.strip(),
            role="doctor",
            phone=payload.phone.strip() if payload.phone else None
        )
        db.add(user)
        db.flush()
        
    spec = payload.specialization.strip() if payload.specialization else f"{dept.name} Specialist"
    doc = Doctor(
        user_id=user.id,
        department_id=dept.id,
        specialization=spec,
        room_number=payload.room_number.strip() if payload.room_number else "Room 101",
        avg_consult_time=payload.avg_consult_time if payload.avg_consult_time > 0 else 12.0,
        status=payload.status if payload.status in ["available", "busy", "off_duty"] else "available",
        current_patients_count=0
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {
        "message": "Doctor added successfully",
        "id": doc.id,
        "name": user.full_name,
        "department": dept.name,
        "room_number": doc.room_number,
        "status": doc.status
    }

@router.put("/doctors/{doctor_id}")
def update_doctor(doctor_id: int, payload: DoctorUpdate, db: Session = Depends(get_db)):
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
        
    if payload.department_id is not None:
        dept = db.query(Department).filter(Department.id == payload.department_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found")
        doc.department_id = payload.department_id
        
    if payload.specialization is not None:
        doc.specialization = payload.specialization.strip()
    if payload.status is not None:
        doc.status = payload.status
    if payload.room_number is not None:
        doc.room_number = payload.room_number.strip()
    if payload.avg_consult_time is not None:
        doc.avg_consult_time = payload.avg_consult_time
    if payload.current_patients_count is not None:
        doc.current_patients_count = payload.current_patients_count
        
    if doc.user:
        if payload.name is not None:
            doc.user.full_name = payload.name.strip()
        if payload.phone is not None:
            doc.user.phone = payload.phone.strip()
        if payload.email is not None:
            clean_email = payload.email.strip().lower()
            if clean_email != doc.user.email:
                other = db.query(User).filter(User.email == clean_email, User.id != doc.user.id).first()
                if other:
                    raise HTTPException(status_code=400, detail="Email is already in use by another user.")
                doc.user.email = clean_email
                
    db.commit()
    db.refresh(doc)
    return {
        "message": "Doctor updated successfully",
        "id": doc.id,
        "name": doc.user.full_name if doc.user else "",
        "department_id": doc.department_id,
        "status": doc.status
    }

@router.delete("/doctors/{doctor_id}")
def delete_or_deactivate_doctor(doctor_id: int, db: Session = Depends(get_db)):
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
        
    has_history = db.query(QueueEntry).filter(QueueEntry.doctor_id == doctor_id).first() is not None
    
    if has_history:
        doc.status = "off_duty"
        db.commit()
        return {
            "message": f"Doctor {doc.user.full_name if doc.user else doctor_id} has existing patient visit records and was safely marked Off Duty to preserve clinical history.",
            "action": "deactivated",
            "id": doctor_id
        }
    else:
        user = doc.user
        db.delete(doc)
        if user and user.role == "doctor":
            db.delete(user)
        db.commit()
        return {
            "message": "Doctor record deleted successfully.",
            "action": "deleted",
            "id": doctor_id
        }

# Departments
class DepartmentCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    avg_consult_time: float = 12.0

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    avg_consult_time: Optional[float] = None
    is_active: Optional[bool] = None

class ReassignDoctorsPayload(BaseModel):
    doctor_ids: List[int]

@router.get("/departments")
def get_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).all()
    res = []
    for d in departments:
        stats = get_queue_statistics(db, department_id=d.id)
        
        docs_list = []
        for doc in d.doctors:
            docs_list.append({
                "id": doc.id,
                "name": doc.user.full_name if doc.user else "Dr. Unknown",
                "specialization": doc.specialization or f"{d.name} Specialist",
                "room_number": doc.room_number,
                "status": doc.status,
                "avg_consult_time": doc.avg_consult_time
            })
            
        active_docs = [doc for doc in d.doctors if doc.status != "off_duty"]
        avail_docs = [doc for doc in d.doctors if doc.status == "available"]
        
        op_status = stats.get("queue_status", "Normal")
        
        res.append({
            "id": d.id,
            "name": d.name,
            "code": d.code,
            "description": d.description or "",
            "is_active": d.is_active,
            "avg_consult_time": d.avg_consult_time,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "assigned_doctors_count": len(d.doctors),
            "active_doctors_count": len(active_docs),
            "available_doctors_count": len(avail_docs),
            "doctors_on_duty": len(active_docs) or len(d.doctors) or 1,
            "waiting_count": stats.get("waiting_count", 0),
            "consulting_count": stats.get("consulting_count", 0),
            "emergency_count": stats.get("emergency_count", 0),
            "active_total": stats.get("active_total", 0),
            "avg_wait_minutes": stats.get("avg_wait_minutes", 0),
            "operational_status": op_status,
            "status_badge": op_status,
            "doctors": docs_list
        })
    return res

@router.post("/departments")
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db)):
    clean_name = payload.name.strip()
    clean_code = payload.code.strip().upper()
    
    existing_name = db.query(Department).filter(func.lower(Department.name) == clean_name.lower()).first()
    if existing_name:
        raise HTTPException(status_code=400, detail="A department with this name already exists.")
        
    existing_code = db.query(Department).filter(Department.code == clean_code).first()
    if existing_code:
        raise HTTPException(status_code=400, detail="A department with this code already exists.")
        
    dept = Department(
        name=clean_name,
        code=clean_code,
        description=payload.description.strip() if payload.description else "",
        avg_consult_time=payload.avg_consult_time if payload.avg_consult_time > 0 else 12.0,
        is_active=True
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return {
        "id": dept.id,
        "name": dept.name,
        "code": dept.code,
        "description": dept.description,
        "avg_consult_time": dept.avg_consult_time,
        "is_active": dept.is_active,
        "message": "Department created successfully"
    }

@router.put("/departments/{dept_id}")
def update_department(dept_id: int, payload: DepartmentUpdate, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    if payload.name is not None:
        clean_name = payload.name.strip()
        other = db.query(Department).filter(func.lower(Department.name) == clean_name.lower(), Department.id != dept_id).first()
        if other:
            raise HTTPException(status_code=400, detail="Another department with this name already exists.")
        dept.name = clean_name
        
    if payload.code is not None:
        clean_code = payload.code.strip().upper()
        other = db.query(Department).filter(Department.code == clean_code, Department.id != dept_id).first()
        if other:
            raise HTTPException(status_code=400, detail="Another department with this code already exists.")
        dept.code = clean_code
        
    if payload.description is not None:
        dept.description = payload.description.strip()
    if payload.avg_consult_time is not None:
        dept.avg_consult_time = payload.avg_consult_time
    if payload.is_active is not None:
        dept.is_active = payload.is_active
        
    db.commit()
    db.refresh(dept)
    return {
        "id": dept.id,
        "name": dept.name,
        "code": dept.code,
        "description": dept.description,
        "avg_consult_time": dept.avg_consult_time,
        "is_active": dept.is_active,
        "message": "Department updated successfully"
    }

@router.delete("/departments/{dept_id}")
def delete_or_deactivate_department(dept_id: int, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    has_history = db.query(QueueEntry).filter(QueueEntry.department_id == dept_id).first() is not None
    has_doctors = len(dept.doctors) > 0
    
    if has_history or has_doctors:
        dept.is_active = False
        db.commit()
        return {
            "message": f"Department '{dept.name}' has historical patient visits or assigned doctors and was safely deactivated to preserve data integrity.",
            "action": "deactivated",
            "id": dept_id
        }
    else:
        db.delete(dept)
        db.commit()
        return {
            "message": "Department deleted successfully.",
            "action": "deleted",
            "id": dept_id
        }

@router.post("/departments/{dept_id}/reassign-doctors")
def reassign_doctors_to_department(dept_id: int, payload: ReassignDoctorsPayload, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
        
    for doc_id in payload.doctor_ids:
        doc = db.query(Doctor).filter(Doctor.id == doc_id).first()
        if doc:
            doc.department_id = dept.id
    db.commit()
    return {"message": f"Doctors successfully reassigned to {dept.name}", "department_id": dept.id}

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
def get_notifications(
    user_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Notification)
    if user_id:
        query = query.filter(Notification.user_id == user_id)
    elif current_user and current_user.role == "patient":
        query = query.filter(Notification.user_id == current_user.id)
    return query.order_by(Notification.created_at.desc()).all()

@router.post("/notifications/read-all")
def mark_all_notifications_read(
    user_id: Optional[int] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Notification)
    target_id = user_id or (current_user.id if current_user and current_user.role == "patient" else None)
    if target_id:
        query = query.filter(Notification.user_id == target_id)
    query.update({"is_read": True}, synchronize_session="fetch")
    db.commit()
    return {"message": "Notifications marked as read"}

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
