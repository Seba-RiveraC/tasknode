from app.core.database import get_db, SessionLocal
from datetime import datetime
import hashlib
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from app.models.operational import SesionPanel, Usuario


def supervisor_actual(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> Usuario:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Inicia sesión como supervisor.")
    token = authorization[7:]
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    sesion = db.query(SesionPanel).filter_by(token_hash=token_hash).first()
    if not sesion or sesion.expira_en <= datetime.utcnow():
        raise HTTPException(status_code=401, detail="La sesión expiró o no es válida. Inicia sesión nuevamente.")
    usuario = db.query(Usuario).filter_by(id=sesion.usuario_id, activo=True, rol="SUPERVISOR").first()
    if not usuario:
        raise HTTPException(status_code=403, detail="Esta acción requiere una cuenta de supervisor activa.")
    return usuario

__all__ = ["get_db", "SessionLocal"]