from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.api.deps import get_db
from app import models, schemas

router = APIRouter()

@router.get("/", response_model=list[schemas.OrdenTrabajoResponse])
def listar_ordenes(db: Session = Depends(get_db)):
    """Lista las OTs ordenadas desde la más reciente."""
    return db.query(models.OrdenTrabajo).order_by(desc(models.OrdenTrabajo.id)).all()

@router.post("/", response_model=schemas.OrdenTrabajoResponse, status_code=status.HTTP_201_CREATED)
def emitir_orden_trabajo(orden_in: schemas.OrdenTrabajoCreate, db: Session = Depends(get_db)):
    """Emisión formal de OT vinculada a un activo físico."""
    activo = db.query(models.ActivoIndustrial).filter(models.ActivoIndustrial.id == orden_in.activo_id).first()
    if not activo:
        raise HTTPException(status_code=404, detail="El Activo Industrial indicado no existe en el catálogo.")

    if db.query(models.OrdenTrabajo).filter(models.OrdenTrabajo.codigo_ot == orden_in.codigo_ot).first():
        raise HTTPException(status_code=400, detail=f"El código {orden_in.codigo_ot} ya está registrado.")

    nueva_ot = models.OrdenTrabajo(
        codigo_ot=orden_in.codigo_ot,
        descripcion=orden_in.descripcion,
        tipo_mantenimiento=orden_in.tipo_mantenimiento,
        prioridad=orden_in.prioridad,
        operario_responsable=orden_in.operario_responsable,
        rut_responsable=orden_in.rut_responsable,
        activo_id=orden_in.activo_id,
        estado_actual="EMITIDA"
    )
    db.add(nueva_ot)
    db.commit()
    db.refresh(nueva_ot)
    return nueva_ot