from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import app.models as models
from app.database import engine, get_db

# 1. Construir las tablas en la base de datos (Si no existen)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="TaskNode Enterprise API", version="0.1.0")

# 2. Configuración CORS (Vital para que el frontend HTML pueda hablar con esta API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Esquemas Pydantic (Los guardias de seguridad de la puerta)
class ReporteCreate(BaseModel):
    empresa_id: int
    tecnico_id: int
    faena_nombre: str
    estado: str
    motivo_bloqueo: Optional[str] = None
    notas: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    # No pedimos foto_url aún, ni fecha, porque eso lo maneja el backend o Azure.

# 4. Endpoints (Las puertas de acceso)

@app.post("/api/reportes", status_code=201)
def crear_reporte(reporte: ReporteCreate, db: Session = Depends(get_db)):
    """Recibe un reporte del celular del técnico y lo guarda en Postgres."""
    # Convertimos el esquema Pydantic a un modelo SQLAlchemy
    nuevo_reporte = models.ReporteTerreno(**reporte.model_dump())
    
    db.add(nuevo_reporte)
    db.commit()
    db.refresh(nuevo_reporte) # Refresca para obtener el ID autogenerado
    
    return {"status": "ok", "mensaje": "Reporte sincronizado con éxito", "id": nuevo_reporte.id}

@app.get("/api/reportes")
def listar_reportes(db: Session = Depends(get_db)):
    """Entrega los reportes al dashboard del coordinador."""
    # En la Fase 3, aquí agregaremos el filtro por empresa_id para el Multi-Tenant
    reportes = db.query(models.ReporteTerreno).order_by(models.ReporteTerreno.id.desc()).all()
    return reportes