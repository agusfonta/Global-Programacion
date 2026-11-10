import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.modules.health import service

logger = logging.getLogger("app")

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> dict[str, str]:
    return {"estado": "vivo"}


@router.get("/ready")
async def ready(request: Request) -> JSONResponse:
    try:
        await service.check_database(request)
    except (SQLAlchemyError, OSError, TimeoutError):
        logger.exception("La base de datos no contesta")
        return JSONResponse(status_code=503, content={"estado": "no disponible"})
    return JSONResponse(status_code=200, content={"estado": "ok"})
