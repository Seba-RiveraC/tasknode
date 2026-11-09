import io
import numpy as np
from PIL import Image
import pytest
from fastapi import HTTPException

from app.services import fsm_service, vision_service
from app.core.security import construir_payload_canonico, sha256_cadena

def test_compuerta_1_vision_rechaza_imagen_borrosa():
    """Una imagen plana debe seguir siendo rechazada."""
    img_plana = Image.fromarray(np.full((200, 200), 128, dtype=np.uint8))
    buf = io.BytesIO()
    img_plana.save(buf, format="JPEG")
    
    score, es_nitida = vision_service.calcular_nitidez_laplaciana(buf.getvalue())
    assert es_nitida is False
    assert score < 25.0

def test_compuerta_1_vision_aprueba_imagen_nitida():
    """Una imagen con bordes marcados debe ser aceptada."""
    matriz = np.zeros((200, 200), dtype=np.uint8)
    matriz[::2, ::2] = 255  # Patrón de alto contraste
    img_nitida = Image.fromarray(matriz)
    buf = io.BytesIO()
    img_nitida.save(buf, format="PNG")
    
    score, es_nitida = vision_service.calcular_nitidez_laplaciana(buf.getvalue())
    assert es_nitida is True
    assert score >= 25.0

def test_compuerta_3a_fsm_bloquea_salto_ilegal():
    """Compuerta 3A: No se puede pasar de EMITIDA directo a OT COMPLETADA sin pasar por EN EJECUCIÓN."""
    with pytest.raises(HTTPException) as exc_info:
        fsm_service.validar_transicion("EMITIDA", "OT COMPLETADA")
    assert exc_info.value.status_code == 422

def test_compuerta_3b_geocerca_haversine():
    """Rechaza fuera de 1 km y aprueba en la planta."""
    lat_planta, lon_planta = -41.4870, -72.9550
    
    # Caso válido: a 10 metros de la torre
    dist_ok = fsm_service.validar_geocerca_wgs84("-41.4870, -72.9551", lat_planta, lon_planta)
    assert dist_ok <= 500.0

    # Caso inválido: operario a varios kilómetros de distancia
    with pytest.raises(HTTPException) as exc_info:
        fsm_service.validar_geocerca_wgs84("-41.5500, -73.0500", lat_planta, lon_planta)
    assert exc_info.value.status_code == 422

def test_compuerta_4_efecto_avalancha_sha256():
    """Compuerta 4: Cambiar un solo carácter en la bitácora altera completamente el hash SHA-256."""
    p1 = construir_payload_canonico("GENESIS", "OT-1001", "EMITIDA", "EN EJECUCIÓN", "14.285.631-8", "-41.48, -72.95", "2026-10-26T10:00:00")
    p2 = construir_payload_canonico("GENESIS", "OT-1001", "EMITIDA", "OT COMPLETADA", "14.285.631-8", "-41.48, -72.95", "2026-10-26T10:00:00")
    
    assert sha256_cadena(p1) != sha256_cadena(p2)
    assert len(sha256_cadena(p1)) == 64