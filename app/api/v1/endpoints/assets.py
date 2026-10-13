from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app import models, schemas

router = APIRouter()

@router.get("/", response_model=list[schemas.ActivoResponse])
def listar_activos(db: Session = Depends(get_db)):
    """Retorna el inventario de activos industriales bajo taxonomía ISO 55000."""
    return db.query(models.ActivoIndustrial).all()