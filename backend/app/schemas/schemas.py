from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

# Auth
class UserLogin(BaseModel):
    phone_or_email: str
    password: str

class UserRegister(BaseModel):
    full_name: str
    email: str
    phone: str
    password: str
    role: str = "patient"
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    mrn: Optional[str] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

# Queue
class PatientRegistration(BaseModel):
    patient_name: str
    phone: str
    age: Optional[int] = 35
    gender: Optional[str] = "Other"
    department_id: int
    doctor_id: Optional[int] = None
    priority: str = "normal" # normal, emergency
    reason: Optional[str] = None

class QueueEntryOut(BaseModel):
    id: int
    token_number: str
    patient_id: int
    patient_name: str
    patient_phone: Optional[str] = None
    patient_mrn: Optional[str] = None
    department_id: int
    department_name: str
    doctor_id: Optional[int] = None
    doctor_name: Optional[str] = None
    status: str
    priority: str
    queue_position: int
    patients_ahead: int
    estimated_wait_minutes: int
    prediction_confidence: int
    registered_at: datetime
    consultation_started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class QueueStatusUpdate(BaseModel):
    status: str # waiting, consulting, completed, cancelled
    doctor_id: Optional[int] = None
    notes: Optional[str] = None

# AI Prediction & Explainability
class PredictWaitTimeRequest(BaseModel):
    department: str
    queue_length: int
    doctor_available: int
    emergency_cases: int = 0
    avg_consultation_time: float = 12.0
    patient_count: int = 25
    time_of_day: int = 11

class ExplainFactor(BaseModel):
    factor: str
    value: str
    level: str
    impact: str

class ExplanationOut(BaseModel):
    summary: str
    factors: List[ExplainFactor]

class PredictionResult(BaseModel):
    predicted_wait_minutes: int
    confidence_pct: int
    model_used: str
    inputs: Dict[str, Any]
    explanation: ExplanationOut
    status_level: str

# Simulation
class SimulationRequest(BaseModel):
    department: str
    current_wait_minutes: int
    current_doctors: int
    current_queue_length: int
    emergency_cases: int = 0
    doctor_adjustments: List[int] = [1, 2, -1] # what if +1 doc, +2 docs, -1 doc

class SimulationScenario(BaseModel):
    label: str
    doctors: int
    predicted_wait_minutes: int
    wait_time_delta_minutes: int
    impact_pct: float

class SimulationResponse(BaseModel):
    department: str
    base_wait_minutes: int
    scenarios: List[SimulationScenario]
    recommendation: str

# Analytics & KPIs
class AdminKPIs(BaseModel):
    total_patients_today: int
    waiting_patients_now: int
    doctors_available_ratio: str # e.g. "12 / 18"
    emergency_cases_now: int
    avg_waiting_time_minutes: int
    queue_status: str # Normal, High, Critical
    prediction_accuracy_pct: float
    patient_satisfaction: float # e.g. 4.7

class DepartmentWaitSummary(BaseModel):
    id: int
    name: str
    code: str
    waiting_count: int
    consulting_count: int
    doctors_on_duty: int
    avg_wait_minutes: int
    status_badge: str # Normal, Moderate, High

# Feedback
class FeedbackCreate(BaseModel):
    queue_id: int
    rating: int
    comments: Optional[str] = None

# Alerts
class AlertOut(BaseModel):
    id: int
    severity: str
    title: str
    message: str
    department_name: Optional[str] = None
    is_resolved: bool
    created_at: datetime

    class Config:
        from_attributes = True
