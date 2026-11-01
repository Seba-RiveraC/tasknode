import hashlib
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.models import operational as models
from app.schemas import operational as schemas

router = APIRouter()

SALT_SISTEMA = "TASKNODE_RELATIONAL_AUTH_2026"


def hashear_password(password_plano: str) -> str:
    texto = f"{SALT_SISTEMA}:{password_plano.strip()}"
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


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
    ident = payload.identificador.strip().lower()
    pwd_hash = hashear_password(payload.password)

    usuario = db.query(models.Usuario).filter(
        or_(
            models.Usuario.email.ilike(ident),
            models.Usuario.rut.ilike(ident)
        )
    ).first()

    if not usuario or usuario.password_hash != pwd_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas. Verifique su correo o RUT y contraseña."
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo en el sistema."
        )

    rol_upper = usuario.rol.upper()
    redirect_url = "/app/terminal.html" if rol_upper == "TRABAJADOR" else "/app/monitor.html"
    token = f"tn_{rol_upper.lower()}_{secrets.token_hex(12)}"

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