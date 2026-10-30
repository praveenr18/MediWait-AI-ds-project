from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.all_models import QueueEntry, Department, Doctor
from app.schemas.schemas import (
    PredictWaitTimeRequest, PredictionResult,
    SimulationRequest, SimulationResponse, SimulationScenario
)
from app.ml.prediction_engine import prediction_engine
from app.services.queue_service import WAITING_STATUSES

router = APIRouter(prefix="/api/predict", tags=["AI Prediction & Explainability"])

@router.post("", response_model=PredictionResult)
def predict_waiting_time(payload: PredictWaitTimeRequest):
    result = prediction_engine.predict(
        department=payload.department,
        queue_length=payload.queue_length,
        doctor_available=payload.doctor_available,
        emergency_cases=payload.emergency_cases,
        avg_consultation_time=payload.avg_consultation_time,
        patient_count=payload.patient_count,
        time_of_day=payload.time_of_day
    )
    return result

@router.get("/metrics")
def get_model_metrics():
    """Returns genuine trained ML metrics, comparison leaderboard, and feature importances"""
    metrics = prediction_engine.get_metrics()
    if not metrics:
        raise HTTPException(status_code=500, detail="Model metrics not loaded")
    return metrics

@router.get("/explain/{token_or_id}")
def explain_token_wait(token_or_id: str, db: Session = Depends(get_db)):
    """Explains why a specific token's wait time was predicted ("Why is my waiting time X minutes?")"""
    entry = None
    if token_or_id.isdigit():
        entry = db.query(QueueEntry).filter(QueueEntry.id == int(token_or_id)).first()
    if not entry:
        entry = db.query(QueueEntry).filter(QueueEntry.token_number == token_or_id).first()
        
    if entry and entry.status == "completed":
        dept = entry.department.name if entry.department else "Cardiology"
        doc = entry.doctor.user.full_name if entry.doctor and entry.doctor.user else "Attending Doctor"
        return {
            "token_number": entry.token_number,
            "department": dept,
            "predicted_wait_minutes": 0,
            "confidence_pct": 0,
            "summary": f"Visit for token {entry.token_number} is completed. Consultation concluded with {doc}.",
            "factors": [
                {"factor": "Consultation Status", "impact": "Completed", "description": "Visit has been successfully concluded with attending physician."},
                {"factor": "Queue Position", "impact": "N/A", "description": "Patient is no longer waiting in the active queue."},
                {"factor": "Department", "impact": dept, "description": f"Consultation conducted in {dept} clinic."}
            ],
            "model_used": "Gradient Boosting Regressor"
        }

    if entry and entry.status in ["consulting", "in_consultation"]:
        dept = entry.department.name if entry.department else "Cardiology"
        doc = entry.doctor.user.full_name if entry.doctor and entry.doctor.user else "Attending Doctor"
        return {
            "token_number": entry.token_number,
            "department": dept,
            "predicted_wait_minutes": 0,
            "confidence_pct": entry.prediction_confidence or 94,
            "summary": f"Patient is currently in consultation with {doc}.",
            "factors": [
                {"factor": "Consultation Status", "impact": "In Progress", "description": "Doctor assessment currently underway in examination room."},
                {"factor": "Queue Position", "impact": "N/A", "description": "Active consultation in progress."}
            ],
            "model_used": "Gradient Boosting Regressor"
        }
        
    if not entry:
        # Fallback to demo explanation
        dept = "Cardiology"
        q_len = 1
        docs = 3
        emerg = 0
        wait = 15
    else:
        dept = entry.department.name if entry.department else "Cardiology"
        q_len = entry.queue_position or 1
        docs = db.query(Doctor).filter(
            Doctor.department_id == entry.department_id,
            Doctor.status.in_(["available", "busy"])
        ).count() or 1
        emerg = db.query(QueueEntry).filter(
            QueueEntry.department_id == entry.department_id,
            QueueEntry.priority == "emergency",
            QueueEntry.status.in_(WAITING_STATUSES)
        ).count()
        wait = entry.estimated_wait_minutes
        
    res = prediction_engine.predict(
        department=dept,
        queue_length=q_len,
        doctor_available=docs,
        emergency_cases=emerg,
        avg_consultation_time=14.0 if dept == "Cardiology" else 10.0
    )
    
    return {
        "token_number": entry.token_number if entry else token_or_id,
        "department": dept,
        "predicted_wait_minutes": wait,
        "confidence_pct": entry.prediction_confidence if entry else res["confidence_pct"],
        "summary": res["explanation"]["summary"],
        "factors": res["explanation"]["factors"],
        "model_used": res["model_used"]
    }

@router.post("/simulate", response_model=SimulationResponse)
def simulate_queue_scenario(payload: SimulationRequest):
    """
    What-If queue capacity simulator: tests operational adjustments
    (e.g., +1 doctor, +2 doctors, -1 doctor) using the trained ML model.
    """
    dept = payload.department
    q_len = payload.current_queue_length
    base_docs = payload.current_doctors
    emerg = payload.emergency_cases
    
    # Predict baseline
    base_res = prediction_engine.predict(
        department=dept,
        queue_length=q_len,
        doctor_available=base_docs,
        emergency_cases=emerg
    )
    base_wait = base_res["predicted_wait_minutes"]
    
    scenarios = []
    
    # 1. Base scenario
    scenarios.append(SimulationScenario(
        label="Current State",
        doctors=base_docs,
        predicted_wait_minutes=base_wait,
        wait_time_delta_minutes=0,
        impact_pct=0.0
    ))
    
    # 2. Adjusted scenarios
    for delta in payload.doctor_adjustments:
        adjusted_docs = max(1, base_docs + delta)
        sim_res = prediction_engine.predict(
            department=dept,
            queue_length=q_len,
            doctor_available=adjusted_docs,
            emergency_cases=emerg
        )
        sim_wait = sim_res["predicted_wait_minutes"]
        diff = sim_wait - base_wait
        pct = round((diff / max(1, base_wait)) * 100, 1)
        
        sign = "+" if delta > 0 else ""
        scenarios.append(SimulationScenario(
            label=f"If {sign}{delta} Doctor{'s' if abs(delta) > 1 else ''}",
            doctors=adjusted_docs,
            predicted_wait_minutes=sim_wait,
            wait_time_delta_minutes=diff,
            impact_pct=pct
        ))
        
    rec_text = f"Assigning 1 additional doctor to {dept} is estimated to reduce waiting times from {base_wait} min to {scenarios[1].predicted_wait_minutes} min (~{abs(scenarios[1].impact_pct)}% improvement)."
    
    return SimulationResponse(
        department=dept,
        base_wait_minutes=base_wait,
        scenarios=scenarios,
        recommendation=rec_text
    )
