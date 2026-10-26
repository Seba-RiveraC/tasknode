import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.models import operational as models
from app.schemas import operational as schemas

router = APIRouter()

def generar_hitos_telecom_por_defecto(tipo: str) -> list:
    """Genera una estructura de hitos multidía realista si no se especifica una al crear la OT."""
    return [
        {"id": 1, "dia": "Día 1 · Inicio", "titulo": "Permiso de acceso a sitio, charla PTS y bloqueo LOTO (D.S. 594)", "completado": False},
        {"id": 2, "dia": "Día 1 · Terreno", "titulo": f"Inspección física de infraestructura y tendido/desmontaje ({tipo})", "completado": False},
        {"id": 3, "dia": "Día 2 · Ejecución", "titulo": "Empalme / alineación de enlace y calibración de parámetros RF/FO", "completado": False},
        {"id": 4, "dia": "Día 2 · Cierre", "titulo": "Pruebas de potencia (OTDR/VSWR), foto nítida y firma de recepción", "completado": False},
    ]

def calcular_porcentaje_hitos(lista_hitos: list, estado_actual: str) -> int:
    if estado_actual == "OT COMPLETADA":
        return 100
    if not lista_hitos:
        return 25 if estado_actual == "EMITIDA" else 50
    completados = sum(1 for h in lista_hitos if h.get("completado"))
    return int(round((completados / len(lista_hitos)) * 100))

def hidratar_orden(o: models.OrdenTrabajo):
    try:
        lista_hitos = json.loads(o.hitos_json) if o.hitos_json else []
    except Exception:
        lista_hitos = []
    
    o.hitos = lista_hitos
    o.avance_pct = calcular_porcentaje_hitos(lista_hitos, o.estado_actual)

    if o.transiciones:
        ultima = max(o.transiciones, key=lambda t: t.id)
        o.hash_cadena = ultima.hash_cadena
        
        con_foto = [t for t in o.transiciones if t.evidencia_url]
        if con_foto:
            ult_foto = max(con_foto, key=lambda t: t.id)
            o.evidencia_url = ult_foto.evidencia_url
            o.laplacian_score = ult_foto.laplacian_score

        con_firma = [t for t in o.transiciones if t.firma_data]
        if con_firma:
            ult_firma = max(con_firma, key=lambda t: t.id)
            o.firma_data = ult_firma.firma_data
            o.encargado_nombre = ult_firma.encargado_nombre
            o.encargado_rut = ult_firma.encargado_rut
    return o

@router.get("/", response_model=List[schemas.OrdenTrabajoOut])
def listar_ordenes(db: Session = Depends(get_db)):
    ordenes = db.query(models.OrdenTrabajo).order_by(models.OrdenTrabajo.id.desc()).all()
    return [hidratar_orden(o) for o in ordenes]

@router.post("/", response_model=schemas.OrdenTrabajoOut, status_code=status.HTTP_201_CREATED)
def crear_orden(payload: schemas.OrdenTrabajoCreate, db: Session = Depends(get_db)):
    existente = db.query(models.OrdenTrabajo).filter(
        models.OrdenTrabajo.codigo_ot == payload.codigo_ot.strip()
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail=f"El folio '{payload.codigo_ot}' ya existe.")

    activo = db.query(models.ActivoIndustrial).filter(models.ActivoIndustrial.id == payload.activo_id).first()
    if not activo:
        raise HTTPException(status_code=404, detail="El equipo especificado no existe en el catálogo.")

    hitos_iniciales = (
        [h.model_dump() for h in payload.hitos]
        if payload.hitos
        else generar_hitos_telecom_por_defecto(payload.tipo_mantenimiento)
    )

    nueva_ot = models.OrdenTrabajo(
        codigo_ot=payload.codigo_ot.strip(),
        cliente_mandante=(payload.cliente_mandante or "Entel Operaciones").strip(),
        activo_id=payload.activo_id,
        tipo_mantenimiento=payload.tipo_mantenimiento,
        prioridad=payload.prioridad,
        estado_actual="EMITIDA",
        operario_responsable=payload.operario_responsable.strip(),
        rut_responsable=payload.rut_responsable.strip(),
        descripcion=payload.descripcion.strip(),
        hitos_json=json.dumps(hitos_iniciales, ensure_ascii=False),
        avance_pct=0,
        created_at=datetime.utcnow()
    )

    db.add(nueva_ot)
    db.commit()
    db.refresh(nueva_ot)
    return hidratar_orden(nueva_ot)

@router.put("/{codigo_ot}/hitos", response_model=schemas.OrdenTrabajoOut)
def actualizar_hitos_orden(codigo_ot: str, payload: schemas.HitosUpdatePayload, db: Session = Depends(get_db)):
    """Permite marcar o desmarcar hitos multidía desde la consola o el terminal móvil."""
    orden = db.query(models.OrdenTrabajo).filter(models.OrdenTrabajo.codigo_ot == codigo_ot.strip()).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada.")

    lista_hitos = [h.model_dump() for h in payload.hitos]
    orden.hitos_json = json.dumps(lista_hitos, ensure_ascii=False)
    orden.avance_pct = calcular_porcentaje_hitos(lista_hitos, orden.estado_actual)
    
    db.add(orden)
    db.commit()
    db.refresh(orden)
    return hidratar_orden(orden)