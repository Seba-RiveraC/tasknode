from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.auth import router
from app.core.database import Base, get_db
from app.core.security import hashear_password
from app.core.config import settings
from app.models.operational import Usuario


def test_ingreso_panel_por_correo_y_rol():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sesiones = sessionmaker(bind=engine, autoflush=False)
    with sesiones() as db:
        db.add_all([
            Usuario(nombre_completo="Supervisor", rut="1", email="supervisor@example.com",
                    password_hash=hashear_password("clave"), rol="SUPERVISOR"),
            Usuario(nombre_completo="Cliente", rut="2", email="cliente@example.com",
                    password_hash=hashear_password("clave"), rol="CLIENTE"),
            Usuario(nombre_completo="Trabajador", rut="3", email="trabajador@example.com",
                    password_hash=hashear_password("clave"), rol="TRABAJADOR"),
        ])
        db.commit()

    def override_db():
        with sesiones() as db:
            yield db

    app = FastAPI()
    app.include_router(router, prefix="/auth")
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        def login(identificador, password="clave"):
            return client.post("/auth/login/panel", json={"identificador": identificador, "password": password})

        assert login(" SUPERVISOR@example.com ").status_code == 200
        assert login("cliente@example.com").status_code == 200
        assert login("trabajador@example.com").status_code == 401
        assert login("1").status_code == 401
        assert login("supervisor@example.com", "incorrecta").status_code == 401
        assert client.post("/auth/login", json={"identificador": "trabajador@example.com", "password": "clave"}).status_code == 200
    engine.dispose()


def test_autocompletar_solo_en_entorno_habilitado(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sesiones = sessionmaker(bind=engine, autoflush=False)
    with sesiones() as db:
        db.add_all([
            Usuario(nombre_completo="Supervisor", rut="1", email="supervisor@example.com",
                    password_hash="hash", rol="SUPERVISOR"),
            Usuario(nombre_completo="Trabajador", rut="2", email="trabajador@example.com",
                    password_hash="hash", rol="TRABAJADOR"),
        ])
        db.commit()

    def override_db():
        with sesiones() as db:
            yield db

    app = FastAPI()
    app.include_router(router, prefix="/auth")
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        monkeypatch.setattr(settings, "PERMITIR_AUTOCOMPLETADO_DEMO", False)
        assert client.get("/auth/demo/configuracion").json() == {"habilitado": False}
        assert client.post("/auth/demo/autocompletar", json={"email": "supervisor@example.com"}).status_code == 404
        monkeypatch.setattr(settings, "PERMITIR_AUTOCOMPLETADO_DEMO", True)
        monkeypatch.setattr(settings, "DEMO_CREDENCIALES_JSON", '{"supervisor@example.com":"clave", "trabajador@example.com":"clave"}')
        respuesta = client.post("/auth/demo/autocompletar", json={"email": "supervisor@example.com"})
        assert respuesta.json() == {"email": "supervisor@example.com", "password": "clave"}
        assert respuesta.headers["cache-control"] == "no-store"
        assert client.post("/auth/demo/autocompletar", json={"email": "trabajador@example.com"}).status_code == 404
        monkeypatch.setattr(settings, "DEMO_CREDENCIALES_JSON", "{")
        assert client.post("/auth/demo/autocompletar", json={"email": "supervisor@example.com"}).status_code == 503
    engine.dispose()
