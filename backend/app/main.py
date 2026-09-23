import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.connection import engine, Base
from app.database.seed import seed_database
from app.routers import auth, queue, prediction, analytics, management

# Ensure tables and initial seed data exist
Base.metadata.create_all(bind=engine)
try:
    seed_database()
except Exception as e:
    print(f"Seed note: {e}")

app = FastAPI(
    title="MediWait AI Backend API",
    description="Intelligent Hospital Waiting Time Prediction & Capacity Management Engine",
    version="2.0.0"
)

# Enable CORS for frontend development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

# Register routers
app.include_router(auth.router)
app.include_router(queue.router)
app.include_router(prediction.router)
app.include_router(analytics.router)
app.include_router(management.router)

@app.get("/")
def root():
    return {
        "name": "MediWait AI API",
        "status": "online",
        "tagline": "Your Time, Our Care",
        "documentation": "/docs"
    }

@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "mediwait-backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
