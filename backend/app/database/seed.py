import os
from datetime import datetime, timedelta
from app.database.connection import engine, SessionLocal, Base
from app.models.all_models import (
    User, Department, Doctor, Patient, QueueEntry,
    QueueEvent, PredictionLog, Notification, Feedback,
    Alert, HospitalSetting
)
from app.utils.auth import hash_password

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Check if already seeded
    if db.query(User).filter(User.email == "admin@mediwait.ai").first():
        print("Database already seeded. Skipping initial seeding.")
        db.close()
        return

    print("Seeding MediWait AI database with clinical operational data...")
    
    # 1. Departments
    departments_data = [
        {"name": "Cardiology", "code": "CARD", "avg_consult_time": 14.0, "desc": "Cardiovascular assessment & interventions"},
        {"name": "Orthopedics", "code": "ORTHO", "avg_consult_time": 13.0, "desc": "Bone, joint, & musculoskeletal trauma"},
        {"name": "General Medicine", "code": "GEN", "avg_consult_time": 10.0, "desc": "Primary diagnostic & general care"},
        {"name": "ENT", "code": "ENT", "avg_consult_time": 9.0, "desc": "Ear, nose, throat & allergy clinic"},
        {"name": "Dermatology", "code": "DERM", "avg_consult_time": 8.0, "desc": "Skin, hair, & wound clinic"}
    ]
    
    dept_objs = {}
    for d in departments_data:
        dept = Department(
            name=d["name"],
            code=d["code"],
            avg_consult_time=d["avg_consult_time"],
            description=d["desc"],
            is_active=True
        )
        db.add(dept)
        db.commit()
        db.refresh(dept)
        dept_objs[d["name"]] = dept
        
    # 2. Staff & Admin Users
    admin_user = User(
        email="admin@mediwait.ai",
        hashed_password=hash_password("admin123"),
        full_name="Dr. Alok Sharma",
        role="admin",
        phone="+1 (555) 019-2831",
        avatar_url="https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80"
    )
    staff_user = User(
        email="staff@mediwait.ai",
        hashed_password=hash_password("staff123"),
        full_name="Sarah Jenkins, RN",
        role="staff",
        phone="+1 (555) 019-2832",
        avatar_url="https://images.unsplash.com/photo-1594824813576-965d1d6cb582?w=150&auto=format&fit=crop&q=80"
    )
    db.add(admin_user)
    db.add(staff_user)
    db.commit()
    
    # 3. Doctors
    doctors_info = [
        {"name": "Dr. Kumar", "email": "dr.kumar@mediwait.ai", "dept": "Cardiology", "room": "Room 101", "status": "available", "patients": 38, "avg_time": 11.0},
        {"name": "Dr. Priya Sharma", "email": "dr.sharma@mediwait.ai", "dept": "Cardiology", "room": "Room 102", "status": "busy", "patients": 24, "avg_time": 14.0},
        {"name": "Dr. Mark Vance", "email": "dr.vance@mediwait.ai", "dept": "Cardiology", "room": "Room 103", "status": "available", "patients": 19, "avg_time": 12.0},
        {"name": "Dr. Rajesh Gupta", "email": "dr.gupta@mediwait.ai", "dept": "Orthopedics", "room": "Room 201", "status": "available", "patients": 22, "avg_time": 13.0},
        {"name": "Dr. Linda Zhao", "email": "dr.zhao@mediwait.ai", "dept": "Orthopedics", "room": "Room 202", "status": "available", "patients": 18, "avg_time": 12.5},
        {"name": "Dr. Anita Roy", "email": "dr.roy@mediwait.ai", "dept": "General Medicine", "room": "Room 301", "status": "available", "patients": 31, "avg_time": 10.0},
        {"name": "Dr. Samuel Green", "email": "dr.green@mediwait.ai", "dept": "General Medicine", "room": "Room 302", "status": "available", "patients": 29, "avg_time": 9.5},
        {"name": "Dr. Vikram Mehta", "email": "dr.mehta@mediwait.ai", "dept": "ENT", "room": "Room 401", "status": "available", "patients": 16, "avg_time": 9.0},
        {"name": "Dr. Sneha Patel", "email": "dr.patel@mediwait.ai", "dept": "Dermatology", "room": "Room 501", "status": "available", "patients": 14, "avg_time": 8.0}
    ]
    
    doctor_objs = {}
    for doc in doctors_info:
        u = User(
            email=doc["email"],
            hashed_password=hash_password("doctor123"),
            full_name=doc["name"],
            role="doctor",
            phone="+1 (555) 018-9900"
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        
        d_rec = Doctor(
            user_id=u.id,
            department_id=dept_objs[doc["dept"]].id,
            specialization=f"{doc['dept']} Specialist",
            room_number=doc["room"],
            status=doc["status"],
            avg_consult_time=doc["avg_time"],
            current_patients_count=doc["patients"]
        )
        db.add(d_rec)
        db.commit()
        db.refresh(d_rec)
        doctor_objs[doc["name"]] = d_rec
        
    # 4. Patients
    patients_data = [
        {"name": "John Doe", "email": "john@example.com", "phone": "9876543210", "mrn": "MRN-1049", "age": 42, "gender": "Male", "blood": "O+"},
        {"name": "Sarah Connor", "email": "patient1@example.com", "phone": "9876543211", "mrn": "MRN-1024", "age": 36, "gender": "Female", "blood": "A+"},
        {"name": "Michael Chang", "email": "patient2@example.com", "phone": "9876543212", "mrn": "MRN-1025", "age": 58, "gender": "Male", "blood": "B+"},
        {"name": "Elena Rostova", "email": "patient3@example.com", "phone": "9876543213", "mrn": "MRN-1026", "age": 29, "gender": "Female", "blood": "AB-"},
        {"name": "David Miller", "email": "patient5@example.com", "phone": "9876543215", "mrn": "MRN-1028", "age": 63, "gender": "Male", "blood": "O-"},
        {"name": "Grace Hopper", "email": "grace@example.com", "phone": "9876543216", "mrn": "MRN-2001", "age": 51, "gender": "Female", "blood": "A-"},
        {"name": "Arthur Dent", "email": "arthur@example.com", "phone": "9876543217", "mrn": "MRN-3001", "age": 39, "gender": "Male", "blood": "B-"},
        {"name": "Alice Wong", "email": "alice@example.com", "phone": "9876543218", "mrn": "MRN-4001", "age": 27, "gender": "Female", "blood": "O+"},
        {"name": "James Wilson", "email": "james@example.com", "phone": "9876543219", "mrn": "MRN-5001", "age": 47, "gender": "Male", "blood": "A+"}
    ]
    
    patient_objs = {}
    for p in patients_data:
        u = User(
            email=p["email"],
            hashed_password=hash_password("patient123"),
            full_name=p["name"],
            role="patient",
            phone=p["phone"]
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        
        p_rec = Patient(
            user_id=u.id,
            mrn=p["mrn"],
            age=p["age"],
            gender=p["gender"],
            blood_group=p["blood"],
            emergency_contact="+1 (555) 911-0000"
        )
        db.add(p_rec)
        db.commit()
        db.refresh(p_rec)
        patient_objs[p["name"]] = p_rec

    # 5. Cardiology Live Queue (Sections 6 & 9 of prompt)
    cardiology_queue = [
        {"token": "A-124", "patient": "Sarah Connor", "status": "consulting", "doc": "Dr. Kumar", "wait": 0, "pos": 0, "priority": "normal"},
        {"token": "A-125", "patient": "Michael Chang", "status": "consulting", "doc": "Dr. Priya Sharma", "wait": 0, "pos": 0, "priority": "emergency"},
        {"token": "A-126", "patient": "Elena Rostova", "status": "waiting", "doc": "Dr. Kumar", "wait": 12, "pos": 1, "priority": "emergency"},
        {"token": "A-127", "patient": "John Doe", "status": "waiting", "doc": "Dr. Kumar", "wait": 34, "pos": 8, "priority": "normal", "confidence": 94},
        {"token": "A-128", "patient": "David Miller", "status": "waiting", "doc": "Dr. Kumar", "wait": 42, "pos": 9, "priority": "normal"}
    ]
    
    card_dept = dept_objs["Cardiology"]
    for item in cardiology_queue:
        doc = doctor_objs[item["doc"]]
        p = patient_objs[item["patient"]]
        
        q = QueueEntry(
            token_number=item["token"],
            patient_id=p.id,
            department_id=card_dept.id,
            doctor_id=doc.id,
            status=item["status"],
            priority=item["priority"],
            queue_position=item["pos"],
            estimated_wait_minutes=item["wait"],
            prediction_confidence=item.get("confidence", 94),
            registered_at=datetime.utcnow() - timedelta(minutes=45 if item["status"] == "consulting" else 20),
            consultation_started_at=datetime.utcnow() - timedelta(minutes=10) if item["status"] == "consulting" else None
        )
        db.add(q)
        db.commit()
        db.refresh(q)
        
        # Add Queue Event
        ev = QueueEvent(
            queue_id=q.id,
            event_type="registered" if item["status"] == "waiting" else "consulting",
            notes=f"Token {item['token']} triage processed"
        )
        db.add(ev)
        
    # 6. Other Departments Queues (Orthopedics: 18 min, General Med: 15 min, ENT: 12 min, Derm: 8 min)
    other_queues = [
        {"token": "B-201", "patient": "Grace Hopper", "dept": "Orthopedics", "doc": "Dr. Rajesh Gupta", "status": "waiting", "wait": 18, "pos": 3},
        {"token": "C-301", "patient": "Arthur Dent", "dept": "General Medicine", "doc": "Dr. Anita Roy", "status": "waiting", "wait": 15, "pos": 2},
        {"token": "D-401", "patient": "Alice Wong", "dept": "ENT", "doc": "Dr. Vikram Mehta", "status": "waiting", "wait": 12, "pos": 1},
        {"token": "E-501", "patient": "James Wilson", "dept": "Dermatology", "doc": "Dr. Sneha Patel", "status": "waiting", "wait": 8, "pos": 1}
    ]
    
    for item in other_queues:
        doc = doctor_objs[item["doc"]]
        p = patient_objs[item["patient"]]
        dept = dept_objs[item["dept"]]
        
        q = QueueEntry(
            token_number=item["token"],
            patient_id=p.id,
            department_id=dept.id,
            doctor_id=doc.id,
            status=item["status"],
            priority="normal",
            queue_position=item["pos"],
            estimated_wait_minutes=item["wait"],
            prediction_confidence=93,
            registered_at=datetime.utcnow() - timedelta(minutes=15)
        )
        db.add(q)
        db.commit()
        
    # 7. Patient Notifications for John Doe (Section 11)
    john_user = db.query(User).filter(User.email == "john@example.com").first()
    if john_user:
        notifications_data = [
            ("Your token A-127 is now approaching.", "queue", timedelta(minutes=3)),
            ("Dr. Kumar has started consultation.", "doctor", timedelta(minutes=8)),
            ("Emergency case added to Cardiology.", "emergency", timedelta(minutes=12)),
            ("Waiting time has changed from 28 to 34 minutes.", "queue", timedelta(minutes=15)),
            ("Registration completed for Cardiology consultation.", "general", timedelta(minutes=25))
        ]
        for msg, cat, offset in notifications_data:
            notif = Notification(
                user_id=john_user.id,
                title="MediWait Live Queue Update",
                message=msg,
                category=cat,
                is_read=False,
                created_at=datetime.utcnow() - offset
            )
            db.add(notif)
            
    # 8. Admin Operational Alerts (Section 35)
    alerts_data = [
        {"severity": "critical", "title": "High waiting time in Cardiology", "msg": "Cardiology queue wait exceeds 30 minutes threshold (currently 34 min).", "dept": "Cardiology"},
        {"severity": "warning", "title": "Emergency case added", "msg": "2 emergency triage cases prioritized in Cardiology OPD.", "dept": "Cardiology"},
        {"severity": "info", "title": "Doctor unavailable notice", "msg": "Dr. Linda Zhao scheduled on-call duty starting 2:00 PM.", "dept": "Orthopedics"},
        {"severity": "success", "title": "System/data update completed", "msg": "ML waiting time inference pipeline re-synchronized successfully.", "dept": "General Medicine"}
    ]
    for a in alerts_data:
        al = Alert(
            severity=a["severity"],
            title=a["title"],
            message=a["msg"],
            department_name=a["dept"],
            is_resolved=False,
            created_at=datetime.utcnow() - timedelta(minutes=10)
        )
        db.add(al)
        
    # 9. Hospital Settings
    settings = [
        {"key": "hospital_name", "value": "MediWait Memorial Healthcare System", "desc": "Hospital title"},
        {"key": "waiting_time_threshold_alert", "value": "30", "desc": "Alert trigger threshold in minutes"},
        {"key": "active_model_name", "value": "Gradient Boosting Regressor", "desc": "Primary prediction model"},
        {"key": "confidence_threshold", "value": "85", "desc": "Minimum acceptable confidence level"}
    ]
    for s in settings:
        h = HospitalSetting(
            setting_key=s["key"],
            setting_value=s["value"],
            description=s["desc"]
        )
        db.add(h)
        
    db.commit()
    db.close()
    print("MediWait AI database seeded successfully!")

if __name__ == "__main__":
    seed_database()
