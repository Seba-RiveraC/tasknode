from app.core.database import SessionLocal

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from app.core.database import get_db, SessionLocal

__all__ = ["get_db", "SessionLocal"]