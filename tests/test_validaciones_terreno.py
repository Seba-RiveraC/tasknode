import io
from uuid import uuid4

import numpy as np
import pytest
from PIL import Image

from app.core.config import settings
from app.services import fsm_service, vision_service
from fastapi import HTTPException
from test_gps_prueba import client


@pytest.mark.parametrize("score,aprobada", [(24.99, False), (25.0, True), (25.01, True)])
def test_umbral_nitidez(score, aprobada, monkeypatch):
    imagen = io.BytesIO()
    Image.fromarray(np.zeros((4, 4), dtype=np.uint8)).save(imagen, format="PNG")
    monkeypatch.setattr(vision_service.np, "var", lambda _: score)
    resultado, aceptada = vision_service.calcular_nitidez_laplaciana(imagen.getvalue())
    assert resultado == score
    assert aceptada is aprobada


def test_limite_geocerca():
    assert 990 < fsm_service.validar_geocerca_wgs84("0.00895, 0", 0, 0) < 1000
    with pytest.raises(HTTPException) as exc:
        fsm_service.validar_geocerca_wgs84("0.00905, 0", 0, 0)
    assert exc.value.status_code == 422


def prueba_datos():
    return {
        "codigo_ot": "OT-TEST", "operario_id": "1", "estado_nuevo": "DETENIDA POR ANOMALÍA",
        "coordenadas_gps": "-42.0, -72.0", "sin_geocerca_prueba": "true",
        "tipo_registro": "ANOMALIA", "registro_id": str(uuid4()),
        "fecha_dispositivo": "2026-11-08T17:00:00Z", "observacion": "Prueba de anomalía",
    }


def imagen_nitida():
    imagen = np.zeros((100, 100), dtype=np.uint8)
    imagen[::2, ::2] = 255
    contenido = io.BytesIO()
    Image.fromarray(imagen).save(contenido, format="PNG")
    return {"foto": ("foto.png", contenido.getvalue(), "image/png")}


def test_excepcion_requiere_autorizacion_y_deja_marca(client, monkeypatch):
    monkeypatch.setattr("app.services.storage_service.almacenar_evidencia", lambda *_: "/foto.png")
    datos = prueba_datos()
    assert client.post("/estados/", data=datos, files=imagen_nitida()).status_code == 403
    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GEOCERCA", True)
    respuesta = client.post("/estados/", data=datos, files=imagen_nitida())
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["prueba_sin_geocerca"] is True
    assert respuesta.json()["coordenadas_gps"] == "-42.0, -72.0"
    historial = client.get("/estados/").json()
    assert len(historial) == 2
    assert all(t["prueba_sin_geocerca"] for t in historial)
    assert client.get("/estados/verificar").json()["integro"]
    repetida = client.post("/estados/", data=datos, files=imagen_nitida())
    assert repetida.json()["id"] == respuesta.json()["id"]


@pytest.mark.parametrize("gps", ["nan, 0", "91, 0", "x, 0", "PRUEBA_SIN_GPS"])
def test_excepcion_no_acepta_gps_invalido(client, monkeypatch, gps):
    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GEOCERCA", True)
    datos = prueba_datos()
    datos["coordenadas_gps"] = gps
    assert client.post("/estados/", data=datos, files=imagen_nitida()).status_code == 422
    assert client.get("/estados/").json() == []


def test_sin_excepcion_ubicacion_fuera_es_rechazada(client, monkeypatch):
    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GEOCERCA", True)
    datos = prueba_datos()
    datos.pop("sin_geocerca_prueba")
    assert client.post("/estados/", data=datos, files=imagen_nitida()).status_code == 422
    assert client.get("/estados/").json() == []
