from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# En SQLite, check_same_thread=False permite que FastAPI use la misma conexión en distintos hilos
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args
)

# ESTUDIO MECÁNICO: Por defecto SQLite desactiva las llaves foráneas y bloquea todo el archivo al escribir.
# Con este evento activamos el modo WAL (permite leer y escribir al mismo tiempo) y forzamos integridad referencial.
if "sqlite" in settings.DATABASE_URL:
    @event.listens_for(engine, "connect")
    def configurar_sqlite_produccion(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Generador de dependencia: abre una sesión por petición HTTP y garantiza su cierre."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()