from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.modules.autores import service
from app.modules.autores.schemas import AutorCreate, AutorLibroRead, AutorRead, AutorUpdate

router = APIRouter(prefix="/autores", tags=["autores"])


@router.post("/", response_model=AutorRead, status_code=status.HTTP_201_CREATED)
async def crear_autor(
    datos: AutorCreate, session: AsyncSession = Depends(get_session)
) -> AutorRead:
    return await service.crear(session, datos)


@router.get("/", response_model=list[AutorRead])
async def listar_autores(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[AutorRead]:
    return await service.listar(session, limit, offset)


@router.get("/{autor_id}", response_model=AutorRead)
async def obtener_autor(
    autor_id: int, session: AsyncSession = Depends(get_session)
) -> AutorRead:
    return await service.obtener(session, autor_id)


@router.patch("/{autor_id}", response_model=AutorRead)
async def actualizar_autor(
    autor_id: int, datos: AutorUpdate, session: AsyncSession = Depends(get_session)
) -> AutorRead:
    return await service.actualizar(session, autor_id, datos)


@router.get("/{autor_id}/libros", response_model=list[AutorLibroRead])
async def listar_libros_de_autor(
    autor_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[AutorLibroRead]:
    return await service.listar_libros(session, autor_id, limit, offset)
