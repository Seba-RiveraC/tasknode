import os
import sqlite3
import subprocess
import sys


def arrancar_con_base(db_path):
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    return subprocess.run(
        [sys.executable, "-c", "import app.main"],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )


def test_arranque_no_rellena_ni_borra_base_incompleta(tmp_path):
    db_path = tmp_path / "demo.sqlite"
    primero = arrancar_con_base(db_path)
    assert "No se cargarán datos automáticamente" in primero.stderr

    with sqlite3.connect(db_path) as db:
        assert db.execute("SELECT COUNT(*) FROM usuario").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM orden_trabajo").fetchone()[0] == 0
        db.execute(
            "INSERT INTO empresa_mandante "
            "(rut_empresa, razon_social, sla_objetivo_pct, activa, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("1", "Empresa que debe conservarse", 98, 1, "2026-01-01"),
        )

    segundo = arrancar_con_base(db_path)
    assert "No se cargarán datos automáticamente" in segundo.stderr
    with sqlite3.connect(db_path) as db:
        assert db.execute(
            "SELECT razon_social FROM empresa_mandante"
        ).fetchone() == ("Empresa que debe conservarse",)
        assert db.execute("SELECT COUNT(*) FROM usuario").fetchone()[0] == 0
