from datetime import datetime, timedelta
import hashlib

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.work_orders import router as ordenes_router
from app.core.database import get_db
from app.core.security import hashear_password
from app.models.operational import HitoOrden, SesionPanel, Usuario
from test_flujo_terreno import accion, enviar, foto
from test_gps_prueba import client


def test_finalizacion_exige_sesion_supervisor_y_registra_aprobacion(client, monkeypatch):
    monkeypatch.setattr("app.services.storage_service.almacenar_evidencia", lambda *_: "/foto.png")
    client.app.include_router(auth_router, prefix="/auth")
    client.app.include_router(ordenes_router, prefix="/ordenes")
    with next(client.app.dependency_overrides[get_db]()) as db:
        db.add(HitoOrden(orden_id=1, orden_secuencia=1, dia="Etapa 1", titulo="Actividad"))
        db.add_all([
            Usuario(nombre_completo="Supervisora", rut="3", email="super@example.com",
                    password_hash=hashear_password("clave"), rol="SUPERVISOR"),
            Usuario(nombre_completo="Cliente", rut="4", email="cliente@example.com",
                    password_hash=hashear_password("clave"), rol="CLIENTE"),
        ])
        db.commit()
    def login(email):
        return client.post("/auth/login/panel", json={"identificador": email, "password": "clave"}).json()["token"]

    supervisor = login("super@example.com")
    cliente = login("cliente@example.com")
    url = "/estados/OT-TEST/finalizar"
    headers = {"Authorization": f"Bearer {supervisor}"}
    assert client.post(url, headers=headers).status_code == 409
    assert enviar(client, "LLEGADA", "EN EJECUCIÓN").status_code == 200
    assert client.get("/ordenes/").json()[0]["constancia_tecnico"] is None
    assert enviar(client, "CIERRE", "OT COMPLETADA", operario_id="3",
                  hitos_json='[{"id":1,"completado":true}]').status_code == 403
    datos, archivos = accion("CIERRE", "OT COMPLETADA", hitos_json='[{"id":1,"completado":true}]')
    cierre = client.post("/estados/", data=datos, files=archivos)
    assert cierre.status_code == 200, cierre.text
    constancia = client.get("/ordenes/").json()[0]["constancia_tecnico"]
    assert constancia == {
        "usuario_id": 1,
        "nombre": "Operario",
        "fecha_dispositivo": datos["fecha_dispositivo"],
        "fecha_recepcion": cierre.json()["timestamp"],
    }
    repetido = client.post("/estados/", data=datos, files={"foto": foto()})
    assert repetido.status_code == 200
    assert repetido.json()["id"] == cierre.json()["id"]
    assert client.get("/ordenes/").json()[0]["constancia_tecnico"] == constancia
    assert client.post(url).status_code == 401
    assert client.post(url, headers={"Authorization": f"Bearer {cliente}"}).status_code == 403
    assert client.post("/estados/", data={"codigo_ot": "OT-TEST", "estado_nuevo": "ORDEN FINALIZADA",
                                       "coordenadas_gps": "-41.0, -72.0"}).status_code == 422
    resultado = client.post(url, headers=headers)
    assert resultado.status_code == 200, resultado.text
    assert resultado.json()["operario_responsable"] == "Supervisora"
    assert resultado.json()["estado_nuevo"] == "ORDEN FINALIZADA"
    assert client.get("/ordenes/").json()[0]["constancia_tecnico"] == constancia
    assert client.post(url, headers=headers).status_code == 409
    assert client.get("/estados/verificar").json()["integro"]
    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.post(url, headers=headers).status_code == 401


def test_sesion_expirada_rechazada(client):
    with next(client.app.dependency_overrides[get_db]()) as db:
        db.add(SesionPanel(token_hash=hashlib.sha256(b"expirada").hexdigest(),
                           usuario_id=1, expira_en=datetime.utcnow() - timedelta(seconds=1)))
        db.commit()
    assert client.post("/estados/OT-TEST/finalizar", headers={"Authorization": "Bearer expirada"}).status_code == 401
