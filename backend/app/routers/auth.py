from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.all_models import User, Patient, Doctor
from app.schemas.schemas import UserLogin, UserRegister, UserOut, TokenResponse
from app.utils.auth import verify_password, hash_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def format_user_out(user: User) -> UserOut:
    patient_id = user.patient_profile.id if user.patient_profile else None
    mrn = user.patient_profile.mrn if user.patient_profile else None
    doctor_id = user.doctor_profile.id if user.doctor_profile else None
    
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone,
        avatar_url=user.avatar_url,
        patient_id=patient_id,
        doctor_id=doctor_id,
        mrn=mrn
    )

@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.email == payload.phone_or_email) | (User.phone == payload.phone_or_email)
    ).first()
    
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone/email or password"
        )
        
    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=format_user_out(user)
    )

@router.post("/register", response_model=TokenResponse)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(
        (User.email == payload.email) | (User.phone == payload.phone)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email or phone already exists")
        
    new_user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        phone=payload.phone
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    if payload.role == "patient":
        mrn = f"MRN-{new_user.id + 1000}"
        patient_profile = Patient(
            user_id=new_user.id,
            mrn=mrn,
            age=payload.age or 30,
            gender=payload.gender or "Other",
            blood_group=payload.blood_group or "Unknown"
        )
        db.add(patient_profile)
        db.commit()
        db.refresh(new_user)
        
    access_token = create_access_token({"sub": str(new_user.id), "role": new_user.role})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=format_user_out(new_user)
    )

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return format_user_out(current_user)

@router.get("/demo-users")
def get_demo_users(db: Session = Depends(get_db)):
    """Provides instant 1-click accounts for testing all roles"""
    roles = ["patient", "doctor", "staff", "admin"]
    users = db.query(User).filter(User.role.in_(roles)).all()
    
    demo_list = []
    for u in users:
        demo_list.append({
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "title": "Patient" if u.role == "patient" else ("Doctor" if u.role == "doctor" else ("Reception / Staff" if u.role == "staff" else "Hospital Administrator")),
            "description": "View token, wait time & AI explanation" if u.role == "patient" else ("Triage and consult patients" if u.role == "doctor" else ("Desk registration & token generation" if u.role == "staff" else "Full hospital management, AI & forecasting"))
        })
    return demo_list

@router.post("/switch-role/{user_id}", response_model=TokenResponse)
def switch_role_instant(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=format_user_out(user)
    )
