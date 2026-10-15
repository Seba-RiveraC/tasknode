from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.models import operational as models
from app.schemas import operational as schemas

router = APIRouter()

@router.get("/", response_model=List[schemas.OrdenTrabajoOut])
def listar_ordenes(db: Session = Depends(get_db)):
    ordenes = db.query(models.OrdenTrabajo).order_by(models.OrdenTrabajo.id.desc()).all()
    
    for o in ordenes:
        if o.transiciones:
            # Obtener la transición más reciente por ID para poblar el visor forense
            ultima = max(o.transiciones, key=lambda t: t.id)
            o.hash_cadena = ultima.hash_cadena
            o.evidencia_url = ultima.evidencia_url
            o.laplacian_score = ultima.laplacian_score
            
    return ordenes

@router.post("/", response_model=schemas.OrdenTrabajoOut, status_code=status.HTTP_201_CREATED)
def crear_orden(payload: schemas.OrdenTrabajoCreate, db: Session = Depends(get_db)):
    existente = db.query(models.OrdenTrabajo).filter(
        models.OrdenTrabajo.codigo_ot == payload.codigo_ot.strip()
    ).first()
    if existente:
        raise HTTPException(
            status_code=400,
            detail=f"El folio '{payload.codigo_ot}' ya se encuentra registrado en el sistema."
        )

    activo = db.query(models.ActivoIndustrial).filter(
        models.ActivoIndustrial.id == payload.activo_id
    ).first()
    if not activo:
        raise HTTPException(
            status_code=404,
            detail="El activo físico especificado no existe en el catálogo ISO 55000."
        )

    nueva_ot = models.OrdenTrabajo(
        codigo_ot=payload.codigo_ot.strip(),
        activo_id=payload.activo_id,
        tipo_mantenimiento=payload.tipo_mantenimiento,
        prioridad=payload.prioridad,
        estado_actual="EMITIDA",
        operario_responsable=payload.operario_responsable.strip(),
        rut_responsable=payload.rut_responsable.strip(),
        descripcion=payload.descripcion.strip(),
        created_at=datetime.utcnow()
    )

    db.add(nueva_ot)
    db.commit()
    db.refresh(nueva_ot)
    return nueva_ot