from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database.connection import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="patient") # patient, staff, doctor, admin
    phone = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    patient_profile = relationship("Patient", back_populates="user", uselist=False)
    doctor_profile = relationship("Doctor", back_populates="user", uselist=False)
    notifications = relationship("Notification", back_populates="user")

class Department(Base):
    __tablename__ = "departments"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    code = Column(String, unique=True, nullable=False) # CARD, ORTHO, GEN, ENT, DERM
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    avg_consult_time = Column(Float, default=12.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    doctors = relationship("Doctor", back_populates="department")
    queue_entries = relationship("QueueEntry", back_populates="department")

class Doctor(Base):
    __tablename__ = "doctors"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    specialization = Column(String, nullable=True)
    room_number = Column(String, default="Room 101")
    status = Column(String, default="available") # available, busy, off_duty
    avg_consult_time = Column(Float, default=12.0)
    current_patients_count = Column(Integer, default=0)
    
    user = relationship("User", back_populates="doctor_profile")
    department = relationship("Department", back_populates="doctors")
    queue_entries = relationship("QueueEntry", back_populates="doctor")

class Patient(Base):
    __tablename__ = "patients"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mrn = Column(String, unique=True, index=True, nullable=False) # Medical Record Number e.g. MRN-9021
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    
    user = relationship("User", back_populates="patient_profile")
    queue_entries = relationship("QueueEntry", back_populates="patient")
    feedbacks = relationship("Feedback", back_populates="patient")

class QueueEntry(Base):
    __tablename__ = "queue"
    
    id = Column(Integer, primary_key=True, index=True)
    token_number = Column(String, index=True, nullable=False) # e.g. A-127, C-104
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=True)
    status = Column(String, default="waiting") # registered, waiting, consulting, completed, cancelled
    priority = Column(String, default="normal") # normal, emergency
    queue_position = Column(Integer, default=1)
    estimated_wait_minutes = Column(Integer, default=20)
    prediction_confidence = Column(Integer, default=94)
    registered_at = Column(DateTime, default=datetime.utcnow)
    consultation_started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    patient = relationship("Patient", back_populates="queue_entries")
    department = relationship("Department", back_populates="queue_entries")
    doctor = relationship("Doctor", back_populates="queue_entries")
    events = relationship("QueueEvent", back_populates="queue_entry")
    prediction_logs = relationship("PredictionLog", back_populates="queue_entry")
    feedback = relationship("Feedback", back_populates="queue_entry", uselist=False)

class QueueEvent(Base):
    __tablename__ = "queue_events"
    
    id = Column(Integer, primary_key=True, index=True)
    queue_id = Column(Integer, ForeignKey("queue.id"), nullable=False)
    event_type = Column(String, nullable=False) # registered, called, consulting, completed, emergency_bump
    notes = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    queue_entry = relationship("QueueEntry", back_populates="events")

class PredictionLog(Base):
    __tablename__ = "predictions"
    
    id = Column(Integer, primary_key=True, index=True)
    queue_id = Column(Integer, ForeignKey("queue.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    predicted_wait_minutes = Column(Integer, nullable=False)
    confidence_pct = Column(Integer, nullable=False)
    model_name = Column(String, nullable=False)
    inputs_json = Column(Text, nullable=True)
    explanation_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    queue_entry = relationship("QueueEntry", back_populates="prediction_logs")

class Notification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    category = Column(String, default="queue") # queue, doctor, emergency, general
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="notifications")

class Feedback(Base):
    __tablename__ = "feedback"
    
    id = Column(Integer, primary_key=True, index=True)
    queue_id = Column(Integer, ForeignKey("queue.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=True)
    rating = Column(Integer, nullable=False) # 1 to 5
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    queue_entry = relationship("QueueEntry", back_populates="feedback")
    patient = relationship("Patient", back_populates="feedbacks")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    severity = Column(String, default="warning") # critical, warning, info, success
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    department_name = Column(String, nullable=True)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Appointment(Base):
    __tablename__ = "appointments"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=True)
    appointment_time = Column(DateTime, nullable=False)
    reason = Column(String, nullable=True)
    status = Column(String, default="scheduled") # scheduled, checked_in, cancelled
    created_at = Column(DateTime, default=datetime.utcnow)

class HospitalSetting(Base):
    __tablename__ = "hospital_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String, unique=True, nullable=False)
    setting_value = Column(String, nullable=False)
    description = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
