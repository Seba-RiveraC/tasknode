import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.api.v1.endpoints.metrics import router
from app.core.database import Base
from app.models.operational import ActivoIndustrial, EmpresaMandante, HitoOrden, OrdenTrabajo, Usuario


@pytest.fixture
def entorno():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sesiones = sessionmaker(bind=engine, autoflush=False)

    def override_db():
        with sesiones() as db:
            yield db

    app = FastAPI()
    app.include_router(router, prefix="/metricas")
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        yield client, sesiones
    engine.dispose()


def test_sin_ordenes(entorno):
    client, _ = entorno
    response = client.get("/metricas/")
    assert response.status_code == 200
    assert response.json() == {
        "volumen_total": 0, "ejecucion_normal": 0, "detenciones_alertas": 0,
        "completadas": 0, "tasa_resolucion_pct": 0.0, "avance_global_hitos_pct": 0.0,
        "total_etapas": 0, "etapas_completadas": 0, "resumen_clientes": [],
    }


def test_indicadores_cuentan_estados_y_etapas_reales(entorno):
    client, sesiones = entorno
    with sesiones() as db:
        cliente = EmpresaMandante(rut_empresa="1", razon_social="Cliente")
        tecnico = Usuario(nombre_completo="Técnico", rut="2", email="test@example.com", password_hash="hash")
        db.add_all([cliente, tecnico])
        db.flush()
        activo = ActivoIndustrial(
            empresa_id=cliente.id, codigo_activo="A", nombre="Activo",
            ubicacion_tecnica="Lugar", latitud_referencia=-41, longitud_referencia=-72,
        )
        db.add(activo)
        db.flush()
        estados = ["EMITIDA", "EN EJECUCIÓN", "DETENIDA POR ANOMALÍA", "EN VALIDACIÓN", "OT COMPLETADA"]
        ordenes = []
        for i, estado in enumerate(estados):
            orden = OrdenTrabajo(
                codigo_ot=f"OT-{i}", empresa_id=cliente.id, activo_id=activo.id,
                operario_id=tecnico.id, tipo_mantenimiento="PREVENTIVO",
                estado_actual=estado, descripcion="Prueba",
            )
            db.add(orden)
            ordenes.append(orden)
        db.flush()
        db.add_all([
            HitoOrden(orden_id=ordenes[1].id, orden_secuencia=1, dia="Etapa 1", titulo="Actividad", completado=True),
            HitoOrden(orden_id=ordenes[1].id, orden_secuencia=2, dia="Etapa 2", titulo="Actividad", completado=False),
            HitoOrden(orden_id=ordenes[4].id, orden_secuencia=1, dia="Etapa 1", titulo="Actividad", completado=False),
        ])
        db.commit()

    data = client.get("/metricas/").json()
    assert (data["volumen_total"], data["ejecucion_normal"], data["detenciones_alertas"], data["completadas"]) == (5, 1, 1, 1)
    assert data["tasa_resolucion_pct"] == 20
    assert data["avance_global_hitos_pct"] == 10
    assert (data["etapas_completadas"], data["total_etapas"]) == (1, 3)
    assert data["resumen_clientes"] == [{
        "cliente": "Cliente", "total_ots": 5, "completadas": 1,
        "detenidas": 1, "total_etapas": 3, "etapas_completadas": 1,
    }]
    assert "mttr_estimado_horas" not in data
    assert "disponibilidad_operacional_pct" not in data
