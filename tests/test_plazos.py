import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.v1.endpoints.work_orders import hidratar_orden
from app.models.operational import OrdenTrabajo


def ejecutar(db_path, args, entrada=None):
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    return subprocess.run(
        [sys.executable, *args], env=env, input=entrada, capture_output=True, text=True
    )


@pytest.fixture
def base_legacy(tmp_path):
    path = tmp_path / "copia.sqlite"
    assert ejecutar(path, ["-c", "import app.main"]).returncode == 0
    with sqlite3.connect(path) as db:
        db.execute("ALTER TABLE orden_trabajo DROP COLUMN fecha_limite")
        db.execute(
            "INSERT INTO empresa_mandante (id, rut_empresa, razon_social, sla_objetivo_pct, activa, created_at) "
            "VALUES (1, '1', 'Empresa', 98, 1, '2026-01-01')"
        )
        db.execute(
            "INSERT INTO usuario (id, empresa_id, nombre_completo, rut, email, password_hash, rol, cargo, activo, created_at) "
            "VALUES (1, 1, 'Operario', '1', 'test@example.com', 'x', 'TRABAJADOR', 'Técnico', 1, '2026-01-01')"
        )
        db.execute(
            "INSERT INTO activo_industrial (id, empresa_id, codigo_activo, nombre, ubicacion_tecnica, criticidad, "
            "latitud_referencia, longitud_referencia) VALUES (1, 1, 'A', 'Activo', 'Sitio', 'MEDIA', 0, 0)"
        )
        for numero, codigo, estado, prioridad in [
            (1, "OT-A", "EMITIDA", "ALTA"),
            (2, "OT-B", "EN EJECUCIÓN", "MEDIA"),
            (3, "OT-C", "EMITIDA", "BAJA"),
            (4, "OT-D", "OT COMPLETADA", "MEDIA"),
            (5, "OT-E", "ORDEN FINALIZADA", "MEDIA"),
            (6, "OT-2026-PRUEBA-DUOC", "EMITIDA", "MEDIA"),
            (7, "OT-F", "EMITIDA", "OTRA"),
        ]:
            db.execute(
                "INSERT INTO orden_trabajo (id, codigo_ot, empresa_id, activo_id, operario_id, tipo_mantenimiento, "
                "prioridad, estado_actual, descripcion, created_at) VALUES (?, ?, 1, 1, 1, 'PREVENTIVO', ?, ?, 'x', ?)",
                (numero, codigo, prioridad, estado, "2026-01-01 10:00:00"),
            )
    return path


def test_migracion_y_respuesta(base_legacy):
    for _ in range(2):
        resultado = ejecutar(base_legacy, ["-c", "import app.main"])
        assert resultado.returncode == 0, resultado.stderr
    engine = create_engine(f"sqlite:///{base_legacy.as_posix()}")
    with Session(engine) as db:
        ordenes = db.query(OrdenTrabajo).order_by(OrdenTrabajo.id).all()
        assert len(ordenes) == 7
        assert [hidratar_orden(o).fecha_limite for o in ordenes[:3]] == [
            datetime(2026, 1, 2, 10), datetime(2026, 1, 4, 10), datetime(2026, 1, 8, 10)
        ]
        assert hidratar_orden(ordenes[-1]).fecha_limite == datetime(2026, 1, 4, 10)
        ordenes[0].fecha_limite = datetime(2026, 11, 23, 12)
        db.commit()
        assert hidratar_orden(ordenes[0]).fecha_limite == datetime(2026, 11, 23, 12)
    engine.dispose()


def test_script_vista_previa_confirmacion_y_repeticion(base_legacy):
    assert ejecutar(base_legacy, ["-c", "import app.main"]).returncode == 0
    with sqlite3.connect(base_legacy) as db:
        db.execute("UPDATE orden_trabajo SET fecha_limite = '2027-01-01 00:00:00' WHERE codigo_ot = 'OT-F'")
        antes = db.execute("SELECT codigo_ot, estado_actual, created_at, fecha_limite FROM orden_trabajo ORDER BY id").fetchall()
    args = ["-m", "app.extender_plazos", "--dias", "14"]
    vista = ejecutar(base_legacy, args)
    assert vista.returncode == 0, vista.stderr
    assert "Total: 3." in vista.stdout
    assert "OT-A | EMITIDA" in vista.stdout
    assert "OT-2026-PRUEBA-DUOC |" not in vista.stdout
    with sqlite3.connect(base_legacy) as db:
        assert db.execute("SELECT codigo_ot, estado_actual, created_at, fecha_limite FROM orden_trabajo ORDER BY id").fetchall() == antes
    cancelado = ejecutar(base_legacy, args + ["--aplicar"], "NO\n")
    assert cancelado.returncode != 0
    with sqlite3.connect(base_legacy) as db:
        assert db.execute("SELECT codigo_ot, estado_actual, created_at, fecha_limite FROM orden_trabajo ORDER BY id").fetchall() == antes
    inicio = datetime.now(ZoneInfo("America/Santiago")).replace(tzinfo=None) + timedelta(days=14)
    aplicado = ejecutar(base_legacy, args + ["--aplicar"], "APLICAR\n")
    fin = datetime.now(ZoneInfo("America/Santiago")).replace(tzinfo=None) + timedelta(days=14)
    assert aplicado.returncode == 0, aplicado.stderr
    assert "Actualizadas: 3" in aplicado.stdout
    with sqlite3.connect(base_legacy) as db:
        despues = db.execute("SELECT codigo_ot, estado_actual, created_at, fecha_limite FROM orden_trabajo ORDER BY id").fetchall()
    assert [r[:3] for r in despues] == [r[:3] for r in antes]
    assert len({r[3] for r in despues[:3]}) == 1
    assert inicio <= datetime.fromisoformat(despues[0][3]) <= fin
    assert despues[3:] == antes[3:]
    repetido = ejecutar(base_legacy, args + ["--aplicar"])
    assert repetido.returncode == 0, repetido.stderr
    assert "Total: 0." in repetido.stdout
    with sqlite3.connect(base_legacy) as db:
        assert db.execute("SELECT codigo_ot, estado_actual, created_at, fecha_limite FROM orden_trabajo ORDER BY id").fetchall() == despues


def test_script_solo_codigos_autorizados(base_legacy):
    assert ejecutar(base_legacy, ["-c", "import app.main"]).returncode == 0
    args = ["-m", "app.extender_plazos", "--dias", "7", "--aplicar"]
    rechazado = ejecutar(base_legacy, args + ["--codigo", "OT-A", "--codigo", "OT-D"], "APLICAR\n")
    assert rechazado.returncode != 0
    with sqlite3.connect(base_legacy) as db:
        assert db.execute("SELECT count(*) FROM orden_trabajo WHERE fecha_limite IS NOT NULL").fetchone()[0] == 0
    aplicado = ejecutar(base_legacy, args + ["--codigo", "OT-A", "--codigo", "OT-B"], "APLICAR\n")
    assert aplicado.returncode == 0, aplicado.stderr
    assert "Actualizadas: 2" in aplicado.stdout
    with sqlite3.connect(base_legacy) as db:
        assert db.execute(
            "SELECT codigo_ot FROM orden_trabajo WHERE fecha_limite IS NOT NULL ORDER BY codigo_ot"
        ).fetchall() == [("OT-A",), ("OT-B",)]
