import io
from uuid import uuid4

import numpy as np
from PIL import Image

from app.models.operational import HitoOrden
from test_gps_prueba import client


def foto():
    imagen = np.zeros((100, 100), dtype=np.uint8)
    imagen[::2, ::2] = 255
    archivo = io.BytesIO()
    Image.fromarray(imagen).save(archivo, format="PNG")
    return ("foto.png", archivo.getvalue(), "image/png")


def accion(tipo, estado, observacion="", identificador=None, incluir_foto=True, **extra):
    datos = {
        "codigo_ot": "OT-TEST",
        "operario_id": "1",
        "tipo_registro": tipo,
        "registro_id": identificador or str(uuid4()),
        "fecha_dispositivo": "2026-11-08T17:00:00.000Z",
        "estado_nuevo": estado,
        "coordenadas_gps": "-41.0, -72.0",
        "observacion": observacion,
        **extra,
    }
    return datos, {"foto": foto()} if incluir_foto else None


def enviar(client, tipo, estado, **kwargs):
    datos, archivos = accion(tipo, estado, **kwargs)
    return client.post("/estados/", data=datos, files=archivos)


def test_anomalia_desde_emitida_puente_y_reintento(client, monkeypatch):
    monkeypatch.setattr("app.services.storage_service.almacenar_evidencia", lambda *_: "/foto.png")
    datos, archivos = accion("ANOMALIA", "DETENIDA POR ANOMALÍA", observacion="Corte de energía")
    respuesta = client.post("/estados/", data=datos, files=archivos)
    assert respuesta.status_code == 200, respuesta.text
    repetida = client.post("/estados/", data=datos, files={"foto": foto()})
    assert repetida.status_code == 200, repetida.text
    assert repetida.json()["id"] == respuesta.json()["id"]
    historial = client.get("/estados/").json()
    assert len(historial) == 2
    assert historial[0]["tipo_registro"] == "ANOMALIA"
    assert historial[0]["fecha_dispositivo"] == datos["fecha_dispositivo"]
    assert historial[1]["estado_nuevo"] == "EN EJECUCIÓN"
    assert client.get("/estados/verificar").json()["integro"]


def test_llegada_jornada_y_reanudacion(client, monkeypatch):
    monkeypatch.setattr("app.services.storage_service.almacenar_evidencia", lambda *_: "/foto.png")
    llegada = enviar(client, "LLEGADA", "EN EJECUCIÓN")
    assert llegada.status_code == 200, llegada.text
    sin_descripcion = enviar(client, "FIN_JORNADA", "EN VALIDACIÓN")
    assert sin_descripcion.status_code == 422
    jornada = enviar(client, "FIN_JORNADA", "EN VALIDACIÓN", observacion="Trabajo del día")
    assert jornada.status_code == 200, jornada.text
    assert jornada.json()["tipo_registro"] == "FIN_JORNADA"
    reanudar = enviar(client, "REANUDACION", "EN EJECUCIÓN", incluir_foto=False)
    assert reanudar.status_code == 200, reanudar.text
    assert client.get("/estados/verificar").json()["integro"]


def test_foto_y_motivo_obligatorios(client):
    assert enviar(client, "LLEGADA", "EN EJECUCIÓN", incluir_foto=False).status_code == 422
    assert enviar(client, "ANOMALIA", "DETENIDA POR ANOMALÍA").status_code == 422
    assert client.get("/estados/").json() == []


def test_cierre_exige_foto_y_etapas(client, monkeypatch):
    monkeypatch.setattr("app.services.storage_service.almacenar_evidencia", lambda *_: "/foto.png")
    from app.core.database import get_db

    with next(client.app.dependency_overrides[get_db]()) as db:
        db.add(HitoOrden(orden_id=1, orden_secuencia=1, dia="Etapa 1", titulo="Actividad"))
        db.commit()
    assert enviar(client, "LLEGADA", "EN EJECUCIÓN").status_code == 200
    cierre = {"firma_data": "firma", "encargado_nombre": "Receptor", "encargado_rut": "1-9"}
    assert enviar(client, "CIERRE", "OT COMPLETADA", incluir_foto=False).status_code == 422
    assert enviar(client, "CIERRE", "OT COMPLETADA", **cierre).status_code == 422
    assert enviar(client, "CIERRE", "OT COMPLETADA").status_code == 422
    resultado = enviar(
        client, "CIERRE", "OT COMPLETADA",
        hitos_json='[{"id": 1, "completado": true}]',
    )
    assert resultado.status_code == 200, resultado.text
    assert resultado.json()["tipo_registro"] == "CIERRE"
    assert client.get("/estados/verificar").json()["integro"]


def test_jornada_desde_anomalia_y_cierre_desde_validacion(client, monkeypatch):
    monkeypatch.setattr("app.services.storage_service.almacenar_evidencia", lambda *_: "/foto.png")
    from app.core.database import get_db

    with next(client.app.dependency_overrides[get_db]()) as db:
        db.add(HitoOrden(orden_id=1, orden_secuencia=1, dia="Etapa 1", titulo="Actividad"))
        db.commit()
    assert enviar(client, "ANOMALIA", "DETENIDA POR ANOMALÍA", observacion="Falla").status_code == 200
    jornada = enviar(client, "FIN_JORNADA", "EN VALIDACIÓN", observacion="Pendiente de repuesto")
    assert jornada.status_code == 200, jornada.text
    cierre = enviar(
        client, "CIERRE", "OT COMPLETADA",
        hitos_json='[{"id": 1, "completado": true}]',
    )
    assert cierre.status_code == 200, cierre.text
    assert client.get("/estados/verificar").json()["integro"]
