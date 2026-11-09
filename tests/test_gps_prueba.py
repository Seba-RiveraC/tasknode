import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.transitions import GPS_PRUEBA, router
from app.core.config import Settings, settings
from app.core.database import Base, get_db
from app.models.operational import ActivoIndustrial, EmpresaMandante, OrdenTrabajo, Usuario


@pytest.fixture
def client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False)
    with session_factory() as db:
        empresa = EmpresaMandante(rut_empresa="1", razon_social="Cliente")
        usuario = Usuario(nombre_completo="Operario", rut="2", email="test@example.com", password_hash="hash")
        db.add_all([empresa, usuario])
        db.flush()
        activo = ActivoIndustrial(
            empresa_id=empresa.id, codigo_activo="A", nombre="Activo",
            ubicacion_tecnica="Lugar", latitud_referencia=-41.0, longitud_referencia=-72.0,
        )
        db.add(activo)
        db.flush()
        db.add(OrdenTrabajo(
            codigo_ot="OT-TEST", empresa_id=empresa.id, activo_id=activo.id,
            operario_id=usuario.id, tipo_mantenimiento="PREVENTIVO",
            estado_actual="EMITIDA", descripcion="Prueba",
        ))
        db.commit()

    def override_db():
        with session_factory() as db:
            yield db

    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GPS", False)
    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GEOCERCA", False)
    monkeypatch.setattr(settings, "TERMINAL_TRABAJADOR_PRUEBA_EMAIL", None)
    app = FastAPI()
    app.include_router(router, prefix="/estados")
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    engine.dispose()


def datos(gps=GPS_PRUEBA, prueba=True):
    return {
        "codigo_ot": "OT-TEST",
        "operario_id": "1",
        "estado_nuevo": "EN EJECUCIÓN",
        "coordenadas_gps": gps,
        "sin_gps_prueba": str(prueba).lower(),
    }


def test_modo_desactivado_por_defecto(client):
    assert Settings(_env_file=None, PERMITIR_PRUEBA_SIN_GPS=False).PERMITIR_PRUEBA_SIN_GPS is False
    config = client.get("/estados/configuracion").json()
    assert config["permitir_prueba_sin_gps"] is False
    assert config["permitir_prueba_sin_geocerca"] is False
    assert config["radio_geocerca_metros"] == 1000
    assert config["trabajador_prueba"] is None
    assert client.post("/estados/", data=datos()).status_code == 403
    assert client.get("/estados/").json() == []


def test_prueba_habilitada_queda_en_bitacora_y_hash(client, monkeypatch):
    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GPS", True)
    assert client.get("/estados/configuracion").json()["permitir_prueba_sin_gps"] is True
    response = client.post("/estados/", data=datos())
    assert response.status_code == 200, response.text
    assert response.json()["coordenadas_gps"] == GPS_PRUEBA
    assert client.get("/estados/").json()[0]["coordenadas_gps"] == GPS_PRUEBA
    assert client.get("/estados/verificar").json()["integro"] is True


@pytest.mark.parametrize(
    "gps,prueba",
    [(GPS_PRUEBA, False), ("-41.0, -72.0", True)],
)
def test_marca_requiere_solicitud_explicita_y_exacta(client, monkeypatch, gps, prueba):
    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GPS", True)
    assert client.post("/estados/", data=datos(gps, prueba)).status_code == 422
    assert client.get("/estados/").json() == []


def test_geocerca_normal_sigue_activa(client, monkeypatch):
    monkeypatch.setattr(settings, "PERMITIR_PRUEBA_SIN_GPS", True)
    assert client.post("/estados/", data=datos("-42.0, -72.0", False)).status_code == 422
    response = client.post("/estados/", data=datos("-41.0, -72.0", False))
    assert response.status_code == 200, response.text


def test_trabajador_de_prueba_debe_ser_activo_y_existir(client, monkeypatch):
    monkeypatch.setattr(settings, "TERMINAL_TRABAJADOR_PRUEBA_EMAIL", "TEST@example.com")
    assert client.get("/estados/configuracion").json()["trabajador_prueba"] == {"id": 1, "nombre": "Operario"}
    monkeypatch.setattr(settings, "TERMINAL_TRABAJADOR_PRUEBA_EMAIL", "no-existe@example.com")
    assert client.get("/estados/configuracion").status_code == 503
