import os
os.environ["DISABLE_SQLALCHEMY_CEXT"] = "1"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.router import api_router

# Inicializar tablas
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Plataforma SaaS B2B de Coordinación y Control Operativo para Faenas y Mantenimiento Industrial."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montar API
app.include_router(api_router, prefix=settings.API_V1_STR)

# Montar carpeta de subidas de archivos locales si no se usa Azure Blob
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Montar frontend para servir desde el mismo origen en Azure
if os.path.exists("frontend"):
    app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

@app.get("/")
def health_check():
    return {
        "status": "ONLINE",
        "system": settings.PROJECT_NAME,
        "docs_url": "/docs",
        "api_v1": settings.API_V1_STR
    }