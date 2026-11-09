from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.api.deps import get_db

router = APIRouter()


@router.get("/", response_model=schemas.MetricasResponse)
def obtener_metricas_operativas(db: Session = Depends(get_db)):
    ordenes = db.query(models.OrdenTrabajo).options(
        selectinload(models.OrdenTrabajo.empresa),
        selectinload(models.OrdenTrabajo.hitos),
    ).all()
    total = len(ordenes)
    en_ejecucion = sum(o.estado_actual == "EN EJECUCIÓN" for o in ordenes)
    detenidas = sum(o.estado_actual == "DETENIDA POR ANOMALÍA" for o in ordenes)
    completadas = sum(o.estado_actual in ("OT COMPLETADA", "ORDEN FINALIZADA") for o in ordenes)

    clientes = {}
    total_etapas = 0
    etapas_completadas = 0
    suma_avance = 0.0
    for orden in ordenes:
        nombre = orden.empresa.razon_social
        if nombre not in clientes:
            clientes[nombre] = {
                "cliente": nombre, "total_ots": 0, "completadas": 0,
                "detenidas": 0, "total_etapas": 0, "etapas_completadas": 0,
            }
        cliente = clientes[nombre]
        cliente["total_ots"] += 1
        cliente["completadas"] += orden.estado_actual in ("OT COMPLETADA", "ORDEN FINALIZADA")
        cliente["detenidas"] += orden.estado_actual == "DETENIDA POR ANOMALÍA"

        cantidad = len(orden.hitos)
        realizadas = sum(h.completado for h in orden.hitos)
        total_etapas += cantidad
        etapas_completadas += realizadas
        cliente["total_etapas"] += cantidad
        cliente["etapas_completadas"] += realizadas
        suma_avance += 100 * realizadas / cantidad if cantidad else 0

    return schemas.MetricasResponse(
        volumen_total=total,
        ejecucion_normal=en_ejecucion,
        detenciones_alertas=detenidas,
        completadas=completadas,
        tasa_resolucion_pct=round(100 * completadas / total, 1) if total else 0,
        avance_global_hitos_pct=round(suma_avance / total, 1) if total else 0,
        total_etapas=total_etapas,
        etapas_completadas=etapas_completadas,
        resumen_clientes=list(clientes.values()),
    )
