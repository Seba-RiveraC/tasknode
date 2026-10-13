from fastapi import HTTPException

# Matriz determinista de transiciones según norma EN 13306
TRANSICIONES_VALIDAS = {
    "BORRADOR": ["EMITIDA"],
    "EMITIDA": ["ASIGNADA", "EN EJECUCIÓN"],
    "ASIGNADA": ["EN EJECUCIÓN"],
    "EN EJECUCIÓN": ["DETENIDA POR ANOMALÍA", "EN VALIDACIÓN"],
    "DETENIDA POR ANOMALÍA": ["EN EJECUCIÓN"],
    "EN VALIDACIÓN": ["OT COMPLETADA", "EN EJECUCIÓN"],
    "OT COMPLETADA": []
}

def validar_transicion(estado_actual: str, estado_nuevo: str) -> bool:
    estados_permitidos = TRANSICIONES_VALIDAS.get(estado_actual, [])
    if estado_nuevo not in estados_permitidos:
        raise HTTPException(
            status_code=422,
            detail=f"Transición no autorizada por norma EN 13306: No es posible pasar de '{estado_actual}' a '{estado_nuevo}'."
        )
    return True