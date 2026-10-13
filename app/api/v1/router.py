from fastapi import APIRouter
from app.api.v1.endpoints import assets, work_orders, transitions, metrics

api_router = APIRouter()
api_router.include_router(assets.router, prefix="/activos", tags=["Activos Industriales (ISO 55000)"])
api_router.include_router(work_orders.router, prefix="/ordenes", tags=["Órdenes de Trabajo (EN 13306)"])
api_router.include_router(transitions.router, prefix="/estados", tags=["Transiciones & Auditoría FSM"])
api_router.include_router(metrics.router, prefix="/metricas", tags=["Métricas Confiabilidad (UNE-EN 15341)"])