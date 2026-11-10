from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.modules.editoriales import service
from app.modules.libros import service as libros_service
from app.modules.libros.schemas import LibroRead
from app.modules.editoriales.schemas import (
    EditorialCreate,
    EditorialRead,
    EditorialUpdate,
)

router = APIRouter(prefix="/editoriales", tags=["editoriales"])


@router.post("/", response_model=EditorialRead, status_code=status.HTTP_201_CREATED)
async def crear_editorial(
    datos: EditorialCreate, session: AsyncSession = Depends(get_session)
) -> EditorialRead:
    return await service.crear(session, datos)


@router.get("/", response_model=list[EditorialRead])
async def listar_editoriales(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[EditorialRead]:
    return await service.listar(session, limit, offset)


@router.get("/{editorial_id}", response_model=EditorialRead)
async def obtener_editorial(
    editorial_id: int, session: AsyncSession = Depends(get_session)
) -> EditorialRead:
    return await service.obtener(session, editorial_id)


@router.patch("/{editorial_id}", response_model=EditorialRead)
async def actualizar_editorial(
    editorial_id: int, datos: EditorialUpdate, session: AsyncSession = Depends(get_session)
) -> EditorialRead:
    return await service.actualizar(session, editorial_id, datos)


@router.get("/{editorial_id}/libros", response_model=list[LibroRead])
async def listar_libros_de_editorial(
    editorial_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[LibroRead]:
    await service.obtener(session, editorial_id)  # 404 si no existe
    return await libros_service.listar(session, limit, offset, editorial_id=editorial_id)
