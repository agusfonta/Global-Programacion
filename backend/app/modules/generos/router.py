from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.modules.generos import service
from app.modules.libros import service as libros_service
from app.modules.libros.schemas import LibroRead
from app.modules.generos.schemas import GeneroCreate, GeneroRead, GeneroUpdate

router = APIRouter(prefix="/generos", tags=["generos"])


@router.post("/", response_model=GeneroRead, status_code=status.HTTP_201_CREATED)
async def crear_genero(
    datos: GeneroCreate, session: AsyncSession = Depends(get_session)
) -> GeneroRead:
    return await service.crear(session, datos)


@router.get("/", response_model=list[GeneroRead])
async def listar_generos(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[GeneroRead]:
    return await service.listar(session, limit, offset)


@router.get("/{genero_id}", response_model=GeneroRead)
async def obtener_genero(
    genero_id: int, session: AsyncSession = Depends(get_session)
) -> GeneroRead:
    return await service.obtener(session, genero_id)


@router.patch("/{genero_id}", response_model=GeneroRead)
async def actualizar_genero(
    genero_id: int, datos: GeneroUpdate, session: AsyncSession = Depends(get_session)
) -> GeneroRead:
    return await service.actualizar(session, genero_id, datos)


@router.get("/{genero_id}/libros", response_model=list[LibroRead])
async def listar_libros_de_genero(
    genero_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[LibroRead]:
    await service.obtener(session, genero_id)  # 404 si no existe
    return await libros_service.listar(session, limit, offset, genero_id=genero_id)
