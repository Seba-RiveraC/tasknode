import math
from fastapi import HTTPException

# Matriz determinista de transiciones válidas bajo norma UNE-EN 13306
TRANSICIONES_VALIDAS = {
    "BORRADOR": ["EMITIDA"],
    "EMITIDA": ["ASIGNADA", "EN EJECUCIÓN"],
    "ASIGNADA": ["EN EJECUCIÓN"],
    "EN EJECUCIÓN": ["DETENIDA POR ANOMALÍA", "EN VALIDACIÓN", "OT COMPLETADA"],
    "DETENIDA POR ANOMALÍA": ["EN EJECUCIÓN"],
    "EN VALIDACIÓN": ["OT COMPLETADA", "EN EJECUCIÓN"],
    "OT COMPLETADA": []  # Estado terminal absorbente
}

RADIO_GEOCERCA_MAX_METROS = 500.0  # Tolerancia espacial en planta industrial (WGS84)

def validar_transicion(estado_actual: str, estado_nuevo: str) -> bool:
    estado_actual = (estado_actual or "EMITIDA").strip().upper()
    estado_nuevo = estado_nuevo.strip().upper()

    permitidos = TRANSICIONES_VALIDAS.get(estado_actual, [])
    if estado_nuevo not in permitidos:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Violación FSM (UNE-EN 13306): Transición ilegal desde '{estado_actual}' "
                f"hacia '{estado_nuevo}'. Transiciones permitidas: {permitidos or 'Ninguna (Estado Terminal)'}."
            )
        )
    return True

def calcular_distancia_haversine_metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcula la distancia ortodrómica sobre el elipsoide WGS84 usando la Fórmula de Haversine.
    Retorna la distancia en metros.
    """
    R = 6371000.0  # Radio medio terrestre en metros
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def validar_geocerca_wgs84(coordenadas_str: str, lat_activo: float, lon_activo: float) -> float:
    """
    Verifica matemáticamente ST_DWithin: el operario debe encontrarse dentro del radio
    admisible respecto a la ubicación técnica del activo físico.
    """
    try:
        partes = [ float(x.strip()) for x in coordenadas_str.split(",") ]
        if len(partes) != 2:
            raise ValueError("Formato inválido")
        lat_op, lon_op = partes[0], partes[1]
    except Exception:
        raise HTTPException(
            status_code=422,
            detail=f"Coordenadas GPS inválidas ('{coordenadas_str}'). Formato WGS84 requerido: 'latitud, longitud'."
        )

    distancia_m = calcular_distancia_haversine_metros(lat_op, lon_op, lat_activo, lon_activo)
    if distancia_m > RADIO_GEOCERCA_MAX_METROS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Violación de Geocerca (WGS84): Operario a {distancia_m:.1f} m del activo "
                f"(Máximo permitido: {RADIO_GEOCERCA_MAX_METROS:.0f} m)."
            )
        )
    return round(distancia_m, 2)