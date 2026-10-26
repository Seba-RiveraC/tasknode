import os
import json
os.environ["DISABLE_SQLALCHEMY_CEXT"] = "1"

from pathlib import Path
from datetime import datetime, timedelta
from urllib.parse import quote
import numpy as np
import cv2

from app.core.database import SessionLocal, engine, Base
from app.models.operational import (
    ActivoIndustrial,
    OrdenTrabajo,
    BitacoraTransicion,
    EvidenciaMultimedia,
)
from app.api.v1.endpoints.transitions import (
    construir_payload_canonico,
    sha256_cadena,
    GENESIS_HASH,
)
from app.services.vision_service import calcular_nitidez_laplaciana

FIRMA_SVG_PRECARGADA = "data:image/svg+xml;utf8," + quote("""<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M 25 65 Q 45 15 70 35 T 115 50 T 150 25 T 195 65 Q 220 75 270 45" fill="none" stroke="#c2410c" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M 85 45 Q 140 10 240 20" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>
  <text x="30" y="82" font-family="monospace" font-size="8.5" fill="#18181b" font-weight="bold">C. VALENZUELA · 14.285.631-8 (ENCARGADO TERRENO)</text>
</svg>""")


def generar_evidencia_sintetica_local(nombre_archivo: str, codigo_ot: str, equipo: str, param_txt: str) -> tuple[str, float]:
    upload_dir = Path("frontend/static/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ruta_destino = upload_dir / nombre_archivo

    img = np.full((500, 800, 3), (20, 24, 30), dtype=np.uint8)
    for x in range(0, 800, 20):
        color = (40, 48, 60) if x % 100 != 0 else (70, 85, 105)
        cv2.line(img, (x, 0), (x, 500), color, 1)
    for y in range(0, 500, 20):
        color = (40, 48, 60) if y % 100 != 0 else (70, 85, 105)
        cv2.line(img, (0, y), (800, y), color, 1)

    cv2.rectangle(img, (380, 120), (420, 380), (160, 175, 190), 2)
    cv2.line(img, (380, 120), (420, 380), (14, 165, 233), 1)
    cv2.line(img, (420, 120), (380, 380), (14, 165, 233), 1)
    cv2.circle(img, (400, 160), 45, (245, 158, 11), 2)
    cv2.circle(img, (400, 160), 10, (16, 185, 129), -1)

    cv2.rectangle(img, (20, 20), (780, 80), (12, 15, 20), -1)
    cv2.putText(img, f"SURTEL TELECOM VERIFIER | {codigo_ot}", (35, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (245, 158, 11), 2)
    cv2.putText(img, f"INFRAESTRUCTURA: {equipo} | ZONA SUR", (35, 72),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 210, 225), 1)

    cv2.rectangle(img, (20, 420), (780, 475), (12, 15, 20), -1)
    cv2.putText(img, param_txt, (35, 448),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (16, 185, 129), 1)

    exito, buffer = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    contenido_bytes = buffer.tobytes()
    with open(ruta_destino, "wb") as f:
        f.write(contenido_bytes)

    score, _ = calcular_nitidez_laplaciana(contenido_bytes)
    return f"/static/uploads/{nombre_archivo}", score


def poblar_sistema():
    print("-> [1/3] Regenerando base de datos SQLite con soporte de Hitos Multidía y BI...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("-> [2/3] Creando imágenes de evidencia sintética nítida...")
    url_ev_1001, score_1001 = generar_evidencia_sintetica_local(
        "evidencia_ot_1001.jpg", "OT-1001", "ANT-01 (Torre Tenglo)", "ENLACE MW REAJUSTADO | POTENCIA: -48 dBm | VSWR: 1.15 OK"
    )
    url_ev_1002, score_1002 = generar_evidencia_sintetica_local(
        "evidencia_ot_1002.jpg", "OT-1002", "NOD-02 (Nodo FO Coihuin)", "FUSION DE FIBRA HILO 04 EN PROCESO | ATENUACION: 0.02 dB"
    )

    db = SessionLocal()
    try:
        print("-> [3/3] Registrando activos, clientes mandantes y órdenes con checklists multidía...")
        torre_tenglo = ActivoIndustrial(
            codigo_activo="ANT-01",
            nombre="Torre Celular y Enlace MW Tenglo",
            ubicacion_tecnica="Isla Tenglo · Sector Antenas · Puerto Montt",
            criticidad="ALTA",
            latitud_referencia=-41.4870,
            longitud_referencia=-72.9550
        )
        nodo_coihuin = ActivoIndustrial(
            codigo_activo="NOD-02",
            nombre="Nodo Repetidor FO Coihuín",
            ubicacion_tecnica="Carretera Austral Km 7 · Puerto Montt",
            criticidad="MEDIA",
            latitud_referencia=-41.4812,
            longitud_referencia=-72.8715
        )
        datacenter_alerce = ActivoIndustrial(
            codigo_activo="DAT-03",
            nombre="Centro de Distribución y Servidores Alerce",
            ubicacion_tecnica="Av. Norte-Sur · Alerce Norte · Puerto Montt",
            criticidad="ALTA",
            latitud_referencia=-41.3920,
            longitud_referencia=-72.9150
        )
        db.add_all([torre_tenglo, nodo_coihuin, datacenter_alerce])
        db.flush()

        ahora = datetime.utcnow().replace(microsecond=0)

        hitos_1001 = [
            {"id": 1, "dia": "Día 1 · AM", "titulo": "Acreditación de cuadrilla, bloqueo LOTO y ascenso a Torre Tenglo", "completado": True},
            {"id": 2, "dia": "Día 1 · PM", "titulo": "Inspección de guía de onda, conectores RF y sello vulcanizado", "completado": True},
            {"id": 3, "dia": "Día 2 · AM", "titulo": "Reajuste de acimut en parábola MW hasta lograr -48 dBm", "completado": True},
            {"id": 4, "dia": "Día 2 · PM", "titulo": "Prueba de tráfico, fotografía nítida y firma de recepción", "completado": True},
        ]

        hitos_1002 = [
            {"id": 1, "dia": "Día 1 · AM", "titulo": "Señalización vial en Carretera Austral Km 7 y apertura de cámara", "completado": True},
            {"id": 2, "dia": "Día 1 · PM", "titulo": "Preparación de manguito y sangrado de fibra óptica de 48 hilos", "completado": True},
            {"id": 3, "dia": "Día 2 · AM", "titulo": "Fusión por arco de hilos 01 al 12 y sellado termocontraíble", "completado": False},
            {"id": 4, "dia": "Día 2 · PM", "titulo": "Certificación bidireccional con OTDR (< 0.05 dB) y cierre", "completado": False},
        ]

        hitos_1003 = [
            {"id": 1, "dia": "Día 1 · AM", "titulo": "Aislamiento eléctrico de gabinete UPS y verificación 0.0 V (LOTO)", "completado": True},
            {"id": 2, "dia": "Día 1 · PM", "titulo": "Extracción de módulo rectificador dañado y diagnóstico de bancos", "completado": False},
            {"id": 3, "dia": "Día 2 · AM", "titulo": "Instalación de nuevo módulo rectificador desde bodega central", "completado": False},
            {"id": 4, "dia": "Día 2 · PM", "titulo": "Prueba de transferencia en carga y firma de conformidad", "completado": False},
        ]

        hitos_1004 = [
            {"id": 1, "dia": "Día 1 · AM", "titulo": "Charla de seguridad en altura, revisión de arnés y bloqueo LOTO", "completado": False},
            {"id": 2, "dia": "Día 1 · PM", "titulo": "Medición con tensiómetro en riostras nivel 1, 2 y 3 post-temporal", "completado": False},
            {"id": 3, "dia": "Día 2 · AM", "titulo": "Reapriete de grilletes, engrase anticorrosivo y sellado de gabinete", "completado": False},
            {"id": 4, "dia": "Día 2 · PM", "titulo": "Evidencia óptica de verticalidad y recepción por Encargado", "completado": False},
        ]

        ot_completada = OrdenTrabajo(
            codigo_ot="OT-1001",
            cliente_mandante="Entel Operaciones",
            activo_id=torre_tenglo.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="OT COMPLETADA",
            operario_responsable="Carlos Valenzuela M.",
            rut_responsable="14.285.631-8",
            descripcion="Mantenimiento preventivo post-temporal: reajuste de parábola de enlace microondas, inspección de cable de bajada RF y sello contra humedad.",
            hitos_json=json.dumps(hitos_1001, ensure_ascii=False),
            avance_pct=100,
            created_at=ahora - timedelta(days=2)
        )

        ot_ejecucion = OrdenTrabajo(
            codigo_ot="OT-1002",
            cliente_mandante="Mundo Telecom",
            activo_id=nodo_coihuin.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="MEDIA",
            estado_actual="EN EJECUCIÓN",
            operario_responsable="Rodrigo Fuentes A.",
            rut_responsable="15.902.438-2",
            descripcion="Reparación de manguito de empalme e inspección OTDR por atenuación en tramo troncal de fibra óptica Carretera Austral.",
            hitos_json=json.dumps(hitos_1002, ensure_ascii=False),
            avance_pct=50,
            created_at=ahora - timedelta(days=1)
        )

        ot_detenida = OrdenTrabajo(
            codigo_ot="OT-1003",
            cliente_mandante="Salmones Austral (Enlace Planta)",
            activo_id=datacenter_alerce.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="ALTA",
            estado_actual="DETENIDA POR ANOMALÍA",
            operario_responsable="Marcelo Soto P.",
            rut_responsable="16.892.110-3",
            descripcion="Revisión de banco de baterías de respaldo (UPS). Faena pausada en Hito 2 a la espera de módulo rectificador desde bodega.",
            hitos_json=json.dumps(hitos_1003, ensure_ascii=False),
            avance_pct=25,
            created_at=ahora - timedelta(hours=18)
        )

        ot_emitida = OrdenTrabajo(
            codigo_ot="OT-1004",
            cliente_mandante="GTD Teleductos Sur",
            activo_id=torre_tenglo.id,
            tipo_mantenimiento="INSPECCION",
            prioridad="ALTA",
            estado_actual="EMITIDA",
            operario_responsable="Camila Morales T.",
            rut_responsable="17.341.890-5",
            descripcion="Inspección multidía post-viento: verificación de tensión de riostras (vientos de anclaje) y estado de gabinete de intemperie.",
            hitos_json=json.dumps(hitos_1004, ensure_ascii=False),
            avance_pct=0,
            created_at=ahora - timedelta(hours=2)
        )

        db.add_all([ot_completada, ot_ejecucion, ot_detenida, ot_emitida])
        db.flush()

        bloques = [
            {
                "orden": ot_completada,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.4870, -72.9550",
                "ts": ahora - timedelta(hours=28),
                "obs": "Día 1: Arribo a sitio de torre Tenglo. Hitos 1 y 2 completados.",
                "evidencia_url": None,
                "laplacian": None,
                "firma": FIRMA_SVG_PRECARGADA,
            },
            {
                "orden": ot_completada,
                "anterior": "EN EJECUCIÓN",
                "nuevo": "EN VALIDACIÓN",
                "gps": "-41.4870, -72.9550",
                "ts": ahora - timedelta(hours=5),
                "obs": "Día 2: Ajuste de acimut realizado. Potencia en -48 dBm. Hitos 3 y 4 completados.",
                "evidencia_url": url_ev_1001,
                "laplacian": score_1001,
                "firma": FIRMA_SVG_PRECARGADA,
            },
            {
                "orden": ot_completada,
                "anterior": "EN VALIDACIÓN",
                "nuevo": "OT COMPLETADA",
                "gps": "-41.4870, -72.9550",
                "ts": ahora - timedelta(hours=2),
                "obs": "Recepción conforme para cliente Entel Operaciones. Cierre de sitio.",
                "evidencia_url": url_ev_1001,
                "laplacian": score_1001,
                "firma": FIRMA_SVG_PRECARGADA,
            },
            {
                "orden": ot_ejecucion,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.4812, -72.8715",
                "ts": ahora - timedelta(hours=14),
                "obs": "Día 1 completado (Hitos 1 y 2). En preparación para fusión de fibra Día 2.",
                "evidencia_url": url_ev_1002,
                "laplacian": score_1002,
                "firma": None,
            },
            {
                "orden": ot_detenida,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.3920, -72.9150",
                "ts": ahora - timedelta(hours=10),
                "obs": "Hito 1 completado: Aislamiento LOTO en Datacenter Alerce.",
                "evidencia_url": None,
                "laplacian": None,
                "firma": None,
            },
            {
                "orden": ot_detenida,
                "anterior": "EN EJECUCIÓN",
                "nuevo": "DETENIDA POR ANOMALÍA",
                "gps": "-41.3920, -72.9150",
                "ts": ahora - timedelta(hours=6),
                "obs": "Bloqueo en Hito 2: Falla interna en módulo rectificador 2. En espera de repuesto.",
                "evidencia_url": None,
                "laplacian": None,
                "firma": None,
            },
        ]

        hash_previo = GENESIS_HASH
        for item in bloques:
            ot_obj = item["orden"]
            ts_iso = item["ts"].isoformat()
            payload = construir_payload_canonico(
                hash_previo=hash_previo,
                codigo_ot=ot_obj.codigo_ot,
                estado_anterior=item["anterior"],
                estado_nuevo=item["nuevo"],
                rut_responsable=ot_obj.rut_responsable,
                coordenadas_gps=item["gps"],
                timestamp_iso=ts_iso,
            )
            hash_actual = sha256_cadena(payload)

            transicion = BitacoraTransicion(
                orden_id=ot_obj.id,
                codigo_ot=ot_obj.codigo_ot,
                operario_responsable=ot_obj.operario_responsable,
                rut_responsable=ot_obj.rut_responsable,
                estado_anterior=item["anterior"],
                estado_nuevo=item["nuevo"],
                coordenadas_gps=item["gps"],
                observacion=item["obs"],
                hash_previo=hash_previo,
                hash_cadena=hash_actual,
                timestamp=item["ts"],
                evidencia_url=item["evidencia_url"],
                laplacian_score=item["laplacian"],
                encargado_nombre="Carlos Valenzuela M.",
                encargado_rut="14.285.631-8",
                firma_data=item["firma"]
            )
            db.add(transicion)
            db.flush()

            if item["evidencia_url"]:
                evidencia = EvidenciaMultimedia(
                    transicion_id=transicion.id,
                    url_almacenamiento=item["evidencia_url"],
                    laplacian_score=item["laplacian"],
                    aprobado_nitidez=True,
                    created_at=item["ts"],
                )
                db.add(evidencia)

            hash_previo = hash_actual

        db.commit()
        print("[OK] Base de datos poblada con Clientes Mandantes e Hitos Multidía (OT-1001 a OT-1004).")
    except Exception as e:
        db.rollback()
        print(f"[ERROR EN SEED]: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    poblar_sistema()