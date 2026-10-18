import os
os.environ["DISABLE_SQLALCHEMY_CEXT"] = "1"

from pathlib import Path
from datetime import datetime, timedelta
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


def generar_evidencia_sintetica_local(nombre_archivo: str, codigo_ot: str, equipo: str, param_txt: str) -> tuple[str, float]:
    """
    Genera una fotografía técnica sintética de alta nitidez (placa de inspección / telemetría)
    en frontend/static/uploads/ para que la demostración local exhiba evidencia óptica válida
    (Score Laplaciano > 100.0) desde el primer arranque sin requerir nube.
    """
    upload_dir = Path("frontend/static/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ruta_destino = upload_dir / nombre_archivo

    # Lienzo base oscuro tipo cámara termográfica / boroscopio industrial (800x500)
    img = np.full((500, 800, 3), (24, 28, 34), dtype=np.uint8)

    # Retícula técnica de alta frecuencia espacial (garantiza varianza Laplaciana > 400)
    for x in range(0, 800, 20):
        color = (48, 55, 66) if x % 100 != 0 else (80, 92, 110)
        cv2.line(img, (x, 0), (x, 500), color, 1)
    for y in range(0, 500, 20):
        color = (48, 55, 66) if y % 100 != 0 else (80, 92, 110)
        cv2.line(img, (0, y), (800, y), color, 1)

    # Simulación de geometría mecánica (brida, eje y rodamiento SKF)
    cv2.circle(img, (400, 255), 130, (180, 185, 195), 3)
    cv2.circle(img, (400, 255), 95, (14, 165, 233), 2)
    cv2.circle(img, (400, 255), 45, (16, 185, 129), -1)
    cv2.circle(img, (400, 255), 20, (24, 28, 34), -1)

    # Pernos periféricos de la brida
    for ang in range(0, 360, 45):
        rad = np.deg2rad(ang)
        px = int(400 + 112 * np.cos(rad))
        py = int(255 + 112 * np.sin(rad))
        cv2.circle(img, (px, py), 8, (245, 158, 11), 2)

    # Mirilla óptica y bordes de alto contraste
    cv2.rectangle(img, (20, 20), (780, 480), (217, 119, 6), 2)
    cv2.line(img, (380, 255), (420, 255), (255, 255, 255), 1)
    cv2.line(img, (400, 235), (400, 275), (255, 255, 255), 1)

    # Encabezado y telemetría OSD (On-Screen Display)
    cv2.rectangle(img, (22, 22), (778, 85), (15, 18, 22), -1)
    cv2.putText(img, f"TASKNODE OPTICAL VERIFIER | {codigo_ot}", (35, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (245, 158, 11), 2)
    cv2.putText(img, f"ACTIVO: {equipo} | NORMA ISO 55001 / D.S. 594", (35, 74),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 210, 225), 1)

    # Pie de datos técnicos
    cv2.rectangle(img, (22, 420), (778, 478), (15, 18, 22), -1)
    cv2.putText(img, param_txt, (35, 445),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (16, 185, 129), 1)
    cv2.putText(img, "EXIF PURGED (LEY 21.719) | KERNEL LAPLACIANO 3x3 APROBADO", (35, 468),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1)

    exito, buffer = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    contenido_bytes = buffer.tobytes()
    with open(ruta_destino, "wb") as f:
        f.write(contenido_bytes)

    score, _ = calcular_nitidez_laplaciana(contenido_bytes)
    return f"/static/uploads/{nombre_archivo}", score


def poblar_sistema():
    print("-> [1/4] Regenerando esquema relacional e instalando Triggers ISO 55001 Append-Only...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("-> [2/4] Generando respaldos ópticos sintéticos de alta nitidez en disco local...")
    url_ev_0001, score_0001 = generar_evidencia_sintetica_local(
        "evidencia_ot_0001.jpg",
        "OT-2610-PMT-PRV-0001",
        "PMP-ISO-2610-01 (Bomba Multietapa)",
        "VIBRACION RMS: 1.42 mm/s | TEMP CARCASA: 48.3 C | TORQUE BRIDA: 85 Nm [OK]"
    )
    url_ev_0042, score_0042 = generar_evidencia_sintetica_local(
        "evidencia_ot_0042.jpg",
        "OT-2610-PMT-PRV-0042",
        "PMP-ISO-2610-01 (Acople Laser)",
        "DESALINEACION ANGULAR: 0.02 mm/100mm | PARALELA: 0.03 mm [EN RANGO]"
    )

    db = SessionLocal()
    try:
        print("-> [3/4] Poblando Catálogo de Activos Físicos bajo taxonomía ISO 55000...")
        bomba = ActivoIndustrial(
            codigo_activo="PMP-ISO-2610-01",
            nombre="Bomba Centrífuga Multietapa de Alimentación 110kW",
            ubicacion_tecnica="Planta Puerto Montt · Sala de Máquinas - Circuito Secundario",
            criticidad="ALTA",
            latitud_referencia=-41.4693,
            longitud_referencia=-72.9424
        )
        compresor = ActivoIndustrial(
            codigo_activo="CMP-ISO-2610-04",
            nombre="Compresor de Aire Tornillo Rotativo 75kW",
            ubicacion_tecnica="Planta Puerto Montt · Maestranza Central - Módulo B",
            criticidad="MEDIA",
            latitud_referencia=-41.4710,
            longitud_referencia=-72.9510
        )
        generador = ActivoIndustrial(
            codigo_activo="GEN-ISO-2610-09",
            nombre="Grupo Electrógeno Respaldo Crítico 500kVA",
            ubicacion_tecnica="Planta Puerto Montt · Subestación Eléctrica S/E-02",
            criticidad="ALTA",
            latitud_referencia=-41.4695,
            longitud_referencia=-72.9428
        )
        db.add_all([bomba, compresor, generador])
        db.flush()

        print("-> [4/4] Sembrando Órdenes de Trabajo (UNE-EN 13306) y Cadena SHA-256...")
        ahora = datetime.utcnow().replace(microsecond=0)

        # CASO 1: ORDEN 100% COMPLETADA Y AUDITADA (Para exhibición inmediata de rigor documental)
        ot_completada = OrdenTrabajo(
            codigo_ot="OT-2610-PMT-PRV-0001",
            activo_id=bomba.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="OT COMPLETADA",
            operario_responsable="Sebastián Rivera",
            rut_responsable="18.421.903-K",
            descripcion=(
                "PAUTA PM-500H: 1) Aplicar bloqueo LOTO en celda 400V (D.S. 594 Art. 53) y verificar energía cero. "
                "2) Sustituir rodamientos lado acople (SKF 6312-2Z/C3) y sello mecánico secundario. "
                "3) Reapretar espárragos de carcasa a torque nominal de 85 Nm con llave dinamométrica calibrada. "
                "4) Ejecutar prueba dinámica verificando vibración global <= 2.3 mm/s RMS (ISO 10816-3) y temperatura <= 65 °C."
            ),
            created_at=ahora - timedelta(hours=6)
        )

        # CASO 2: ORDEN EN EJECUCIÓN CON EVIDENCIA PRELIMINAR
        ot_ejecucion = OrdenTrabajo(
            codigo_ot="OT-2610-PMT-PRV-0042",
            activo_id=bomba.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="EN EJECUCIÓN",
            operario_responsable="Sebastián Rivera",
            rut_responsable="18.421.903-K",
            descripcion=(
                "PAUTA ALINEACIÓN LÁSER: 1) Aislamiento mecánico e instalación de candado personal LOTO. "
                "2) Montaje de cabezales ópticos en eje motor-bomba. "
                "3) Corrección de pie cojo y ajuste con lainas inoxidables calibradas hasta tolerancia <= 0.04 mm."
            ),
            created_at=ahora - timedelta(hours=2, minutes=30)
        )

        # CASO 3: ORDEN DETENIDA POR ANOMALÍA (Activa alertas SCADA y cálculo MTTR en UNE-EN 15341)
        ot_detenida = OrdenTrabajo(
            codigo_ot="OT-2610-SUR-COR-0015",
            activo_id=compresor.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="ALTA",
            estado_actual="DETENIDA POR ANOMALÍA",
            operario_responsable="Marcelo Soto",
            rut_responsable="16.892.110-3",
            descripcion=(
                "ATENCIÓN EMERGENCIA POR DISPARO TÉRMICO (108 °C): Inspección de válvula termostática, "
                "radiador de aceite y líneas de retorno. Verificar estanqueidad de brida secundaria."
            ),
            created_at=ahora - timedelta(hours=1, minutes=45)
        )

        # CASO 4: ORDEN RECIÉN EMITIDA (Lista para ser operada en vivo durante la defensa en pantalla dividida)
        ot_emitida = OrdenTrabajo(
            codigo_ot="OT-2610-PMT-PRV-0045",
            activo_id=bomba.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="EMITIDA",
            operario_responsable="Sebastián Rivera",
            rut_responsable="18.421.903-K",
            descripcion=(
                "PAUTA MAYOR 1000H (ISO 55001 / D.S. 594): 1) Bloqueo LOTO eléctrico/hidráulico y firma de PTS. "
                "2) Desmontaje de guarda y reemplazo de kit de sello mecánico doble cartucho Tungsteno/Viton. "
                "3) Purga de aire en cámara de sellado, presurización estática a 6.2 bar por 15 min sin caída. "
                "4) Captura fotográfica de manómetro patrón (Laplace >= 100) y cierre con firma electrónica."
            ),
            created_at=ahora - timedelta(minutes=25)
        )

        db.add_all([ot_completada, ot_ejecucion, ot_detenida, ot_emitida])
        db.flush()

        # =========================================================================
        # CONSTRUCCIÓN SECUENCIAL DEL LIBRO MAYOR CRIPTOGRÁFICO (SHA-256)
        # =========================================================================
        bloques_definicion = [
            # --- Historial completo de OT-2610-PMT-PRV-0001 (3 eslabones) ---
            {
                "orden": ot_completada,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.4693, -72.9424",
                "ts": ahora - timedelta(hours=5, minutes=40),
                "obs": (
                    "Apertura en terreno validada por geocerca Haversine (0.0 m). "
                    "Protocolo LOTO aplicado en Celda 04 (Candado #LOTO-409). Verificación de ausencia de tensión: 0.0 V. "
                    "EPP completo verificado según D.S. 594 Art. 53."
                ),
                "evidencia_url": None,
                "laplacian": None,
            },
            {
                "orden": ot_completada,
                "anterior": "EN EJECUCIÓN",
                "nuevo": "EN VALIDACIÓN",
                "gps": "-41.4693, -72.9424",
                "ts": ahora - timedelta(hours=4, minutes=10),
                "obs": (
                    "Sustitución de rodamientos SKF 6312-2Z/C3 y sello mecánico finalizada. "
                    "Torque aplicado en pernos de carcasa: 85 Nm. "
                    "Prueba en carga nominal: Vibración global 1.42 mm/s RMS (Conforme ISO 10816-3), Temperatura 48.3 °C. "
                    "Se adjunta captura óptica aprobada por filtro Laplaciano."
                ),
                "evidencia_url": url_ev_0001,
                "laplacian": score_0001,
            },
            {
                "orden": ot_completada,
                "anterior": "EN VALIDACIÓN",
                "nuevo": "OT COMPLETADA",
                "gps": "-41.4693, -72.9424",
                "ts": ahora - timedelta(hours=3, minutes=50),
                "obs": (
                    "Auditoría forense y recepción conforme por Supervisión de Confiabilidad. "
                    "Retiro de bloqueo LOTO documentado, entrega de equipo a Operaciones y cierre inmutable UNE-EN 13306."
                ),
                "evidencia_url": url_ev_0001,
                "laplacian": score_0001,
            },
            # --- Inicio de OT-2610-PMT-PRV-0042 ---
            {
                "orden": ot_ejecucion,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.4693, -72.9424",
                "ts": ahora - timedelta(hours=2, minutes=10),
                "obs": (
                    "Cuadrilla posicionada en Sala de Máquinas. Bloqueo LOTO ejecutado y cabezales láser instalados. "
                    "Medición inicial arroja +0.09 mm en plano vertical; se procede a corrección con lainas calibradas."
                ),
                "evidencia_url": url_ev_0042,
                "laplacian": score_0042,
            },
            # --- Inicio y Detención de OT-2610-SUR-COR-0015 ---
            {
                "orden": ot_detenida,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.4710, -72.9510",
                "ts": ahora - timedelta(hours=1, minutes=30),
                "obs": (
                    "Ingreso a Maestranza Central Módulo B. Despresurización de acumulador neumático a 0.0 bar "
                    "y bloqueo de seccionador principal."
                ),
                "evidencia_url": None,
                "laplacian": None,
            },
            {
                "orden": ot_detenida,
                "anterior": "EN EJECUCIÓN",
                "nuevo": "DETENIDA POR ANOMALÍA",
                "gps": "-41.4710, -72.9510",
                "ts": ahora - timedelta(minutes=45),
                "obs": (
                    "DETENCIÓN PREVENTIVA D.S. 594 ART. 53: Se detecta microfisura en brida secundaria del enfriador "
                    "de aceite con fuga activa de fluido sintético. Se suspende maniobra a la espera de repuesto "
                    "código CUM-4932-B desde bodega técnica."
                ),
                "evidencia_url": None,
                "laplacian": None,
            },
        ]

        hash_previo = GENESIS_HASH
        for item in bloques_definicion:
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
        print("=========================================================================")
        print("[OK] Base de datos inicializada con éxito para Hito 1 (Demo 100% Local).")
        print(f"     - Activos ISO 55000 creados : 3")
        print(f"     - Órdenes EN 13306 creadas  : 4 (1 Completada, 1 Emitida, 1 Ejecución, 1 Detenida)")
        print(f"     - Bloques SHA-256 firmados  : {len(bloques_definicion)} (Integridad 100% verificable)")
        print(f"     - Evidencia óptica local    : {url_ev_0001} (Laplace = {score_0001})")
        print("=========================================================================")
    except Exception as e:
        db.rollback()
        print(f"[ERROR CRÍTICO EN SEED]: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    poblar_sistema()