import secrets
import json
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.config import settings
from app.core.security import SALT_SISTEMA, hashear_password
from app.models import operational as models
from app.schemas import operational as schemas

router = APIRouter()


@router.get("/demo/configuracion")
def configuracion_demo():
    return {"habilitado": settings.PERMITIR_AUTOCOMPLETADO_DEMO}


@router.post("/demo/autocompletar")
def autocompletar_demo(payload: schemas.DemoCuentaRequest, response: Response, db: Session = Depends(get_db)):
    if not settings.PERMITIR_AUTOCOMPLETADO_DEMO:
        raise HTTPException(status_code=404, detail="Autocompletado no disponible.")
    try:
        credenciales = json.loads(settings.DEMO_CREDENCIALES_JSON or "{}")
        if not isinstance(credenciales, dict) or not all(
            isinstance(correo, str) and isinstance(clave, str)
            for correo, clave in credenciales.items()
        ):
            raise ValueError("Formato de credenciales inválido")
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="Configuración de autocompletado inválida.") from exc
    correo = payload.email.strip().lower()
    usuario = db.query(models.Usuario).filter(models.Usuario.email.ilike(correo)).first()
    clave = credenciales.get(correo)
    if not usuario or not usuario.activo or usuario.rol.upper() not in ("SUPERVISOR", "CLIENTE") or not clave:
        raise HTTPException(status_code=404, detail="No hay credenciales configuradas para esta cuenta.")
    response.headers["Cache-Control"] = "no-store"
    return {"email": correo, "password": clave}

def serializar_usuario(u: models.Usuario) -> schemas.UsuarioOut:
    return schemas.UsuarioOut(
        id=u.id,
        empresa_id=u.empresa_id,
        empresa_nombre=u.empresa.razon_social if u.empresa else None,
        nombre_completo=u.nombre_completo,
        rut=u.rut,
        email=u.email,
        rol=u.rol,
        cargo=u.cargo,
        activo=u.activo
    )


@router.post("/login", response_model=schemas.LoginResponse)
def iniciar_sesion(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    return autenticar_usuario(payload, db)


@router.post("/login/panel", response_model=schemas.LoginResponse)
def iniciar_sesion_panel(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    return autenticar_usuario(payload, db, solo_panel=True)


@router.post("/logout", status_code=204)
def cerrar_sesion(authorization: str = Header(default=""), db: Session = Depends(get_db)):
    if authorization.startswith("Bearer "):
        token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
        db.query(models.SesionPanel).filter_by(token_hash=token_hash).delete()
        db.commit()
    return Response(status_code=204)


def autenticar_usuario(payload: schemas.LoginRequest, db: Session, solo_panel: bool = False):
    ident = payload.identificador.strip().lower()
    pwd_hash = hashear_password(payload.password)

    consulta = db.query(models.Usuario)
    if solo_panel:
        consulta = consulta.filter(models.Usuario.email.ilike(ident))
    else:
        consulta = consulta.filter(or_(models.Usuario.email.ilike(ident), models.Usuario.rut.ilike(ident)))
    usuario = consulta.first()

    if not usuario or usuario.password_hash != pwd_hash or (solo_panel and usuario.rol.upper() not in ("SUPERVISOR", "CLIENTE")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas."
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo en el sistema."
        )

    rol_upper = usuario.rol.upper()
    redirect_url = "/app/terminal.html" if rol_upper == "TRABAJADOR" else "/app/monitor.html"
    token = secrets.token_urlsafe(32)
    db.add(models.SesionPanel(
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        usuario_id=usuario.id,
        expira_en=datetime.utcnow() + timedelta(hours=8),
    ))
    db.commit()

    return schemas.LoginResponse(
        token=token,
        redirect_url=redirect_url,
        usuario=serializar_usuario(usuario)
    )


@router.get("/usuarios", response_model=List[schemas.UsuarioOut])
def listar_usuarios(rol: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Usuario).filter(models.Usuario.activo == True)
    if rol:
        q = q.filter(models.Usuario.rol == rol.upper())
    usuarios = q.order_by(models.Usuario.id.asc()).all()
    return [serializar_usuario(u) for u in usuarios]


@router.get("/empresas", response_model=List[schemas.EmpresaMandanteOut])
def listar_empresas_mandantes(db: Session = Depends(get_db)):
    return db.query(models.EmpresaMandante).order_by(models.EmpresaMandante.id.asc()).all()