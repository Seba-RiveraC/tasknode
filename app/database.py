

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Base de datos local en un archivo para pruebas
SQLALCHEMY_DATABASE_URL = "sqlite:///./tasknode_test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



""" 
Mock de base de datos para el backend de FastAPI.
Se avanzara en fases posteriores a una base de datos real

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Esta es la URL de la base de datos PostgreSQL. 
# Si usas Supabase o Neon.tech, ellos te darán un link similar a este.
# Por ahora ponemos uno genérico local para que entiendas la estructura.
SQLALCHEMY_DATABASE_URL = "postgresql://usuario:contraseña@localhost/tasknode_db"

# El motor que se encarga de hablar con la base de datos
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# La "fábrica" de sesiones. Cada vez que llega un reporte, abre una sesión y luego la cierra.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Función generadora de dependencias para FastAPI (Muy importante para el backend)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""