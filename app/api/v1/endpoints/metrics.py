import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app import models, schemas

router = APIRouter()

@router.get("/", response_model=schemas.MetricasResponse)
def obtener_metricas_operativas(db: Session = Depends(get_db)):
    """
    Motor de Inteligencia de Negocios (BI), Minería de Datos y Confiabilidad UNE-EN 15341.
    Cruza desempeño por Cliente Mandante, avance de Hitos Multidía y cuellos de botella.
    """
    ordenes = db.query(models.OrdenTrabajo).all()
    total_ots = len(ordenes)
    en_ejecucion = sum(1 for o in ordenes if o.estado_actual == "EN EJECUCIÓN")
    detenidas = sum(1 for o in ordenes if o.estado_actual == "DETENIDA POR ANOMALÍA")
    completadas = sum(1 for o in ordenes if o.estado_actual == "OT COMPLETADA")

    tasa = round((completadas / total_ots * 100), 1) if total_ots > 0 else 0.0

    # 1. Minería de Datos: Agrupación por Cliente Mandante y Análisis de Hitos
    clientes_map = {}
    etapas_stats = {
        1: {"etapa": "Hito 1 · Acceso, PTS y Bloqueo LOTO", "total": 0, "completados": 0, "pendientes": 0},
        2: {"etapa": "Hito 2 · Montaje / Tendido Físico", "total": 0, "completados": 0, "pendientes": 0},
        3: {"etapa": "Hito 3 · Fusión FO / Alineación RF", "total": 0, "completados": 0, "pendientes": 0},
        4: {"etapa": "Hito 4 · Certificación OTDR y Firma", "total": 0, "completados": 0, "pendientes": 0},
    }

    suma_avance_global = 0
    for o in ordenes:
        cli = o.cliente_mandante or "SurTel Interno"
        if cli not in clientes_map:
            clientes_map[cli] = {
                "cliente": cli,
                "total_ots": 0,
                "completadas": 0,
                "detenidas": 0,
                "suma_avance": 0
            }
        clientes_map[cli]["total_ots"] += 1
        if o.estado_actual == "OT COMPLETADA":
            clientes_map[cli]["completadas"] += 1
        if o.estado_actual == "DETENIDA POR ANOMALÍA":
            clientes_map[cli]["detenidas"] += 1

        try:
            hitos = json.loads(o.hitos_json) if o.hitos_json else []
        except Exception:
            hitos = []

        if hitos:
            comp = sum(1 for h in hitos if h.get("completado"))
            pct_ot = 100 if o.estado_actual == "OT COMPLETADA" else int(round((comp / len(hitos)) * 100))
        else:
            pct_ot = 100 if o.estado_actual == "OT COMPLETADA" else 25

        clientes_map[cli]["suma_avance"] += pct_ot
        suma_avance_global += pct_ot

        for idx, h in enumerate(hitos, start=1):
            slot = idx if idx in etapas_stats else 4
            etapas_stats[slot]["total"] += 1
            if h.get("completado") or o.estado_actual == "OT COMPLETADA":
                etapas_stats[slot]["completados"] += 1
            else:
                etapas_stats[slot]["pendientes"] += 1

    avance_global_pct = round(suma_avance_global / total_ots, 1) if total_ots > 0 else 0.0

    resumen_clientes = []
    for cli, data in clientes_map.items():
        prom_avance = round(data["suma_avance"] / data["total_ots"], 1)
        estado_sla = "EN RIESGO (Anomalía)" if data["detenidas"] > 0 else ("ÓPTIMO (100%)" if prom_avance == 100 else "EN PLAZO")
        resumen_clientes.append({
            "cliente": cli,
            "total_ots": data["total_ots"],
            "completadas": data["completadas"],
            "detenidas": data["detenidas"],
            "avance_promedio_pct": prom_avance,
            "estado_sla": estado_sla
        })

    cuellos_botella = []
    for k, st in etapas_stats.items():
        tasa_hito = round((st["completados"] / st["total"]) * 100, 1) if st["total"] > 0 else 0.0
        cuellos_botella.append({
            "id_etapa": k,
            "etapa": st["etapa"],
            "total": st["total"],
            "completados": st["completados"],
            "pendientes": st["pendientes"],
            "tasa_avance_pct": tasa_hito
        })

    # Indicadores UNE-EN 15341
    mttr = round(1.85 * detenidas, 2) if detenidas > 0 else 1.40
    mtbf = 168.0
    disponibilidad = round((mtbf / (mtbf + mttr)) * 100, 2) if mttr > 0 else 100.0

    return schemas.MetricasResponse(
        volumen_total=total_ots,
        ejecucion_normal=en_ejecucion,
        detenciones_alertas=detenidas,
        completadas=completadas,
        tasa_resolucion_pct=tasa,
        avance_global_hitos_pct=avance_global_pct,
        mttr_estimado_horas=mttr,
        mtbf_estimado_horas=mtbf,
        disponibilidad_operacional_pct=disponibilidad,
        resumen_clientes=resumen_clientes,
        cuellos_botella_hitos=cuellos_botella
    )