from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from .database import engine, Base, get_db
from . import models, schemas

# Le dice a SQLAlchemy que cree las tablas al iniciar si no existen
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TaskNode API", version="0.1.0")

# Configuración CORS: El escudo de seguridad abierto para que tu HTML pueda entrar
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "El motor de TaskNode está encendido y listo."}

# El endpoint (Ruta) que recibe los datos desde tu página web HTML
@app.post("/api/v1/estados/")
def registrar_estado(estado: schemas.HistorialCreate, db: Session = Depends(get_db)):
    # Toma los datos, los convierte y los guarda en PostgreSQL
    nuevo_estado = models.HistorialEstado(**estado.dict())
    db.add(nuevo_estado)
    db.commit()
    db.refresh(nuevo_estado)
    return nuevo_estado