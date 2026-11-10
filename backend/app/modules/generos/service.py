from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.generos.models import Genero
from app.modules.generos.schemas import GeneroCreate, GeneroUpdate

UNIQUE_VIOLATION = "23505"


def _conflicto(exc: IntegrityError) -> HTTPException:
    """Traduce el rechazo de la base a un 409 con mensaje propio (RN-12)."""
    if getattr(exc.orig, "sqlstate", None) == UNIQUE_VIOLATION:
        detalle = "Ya existe un género con ese nombre"
    else:
        detalle = "Los datos del género violan una restricción"
    return HTTPException(status.HTTP_409_CONFLICT, detalle)


async def _guardar(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise _conflicto(exc) from exc


async def crear(session: AsyncSession, datos: GeneroCreate) -> Genero:
    genero = Genero(**datos.model_dump())
    session.add(genero)
    await _guardar(session)
    return genero


async def listar(session: AsyncSession, limit: int, offset: int) -> list[Genero]:
    stmt = select(Genero).order_by(Genero.id).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def obtener(session: AsyncSession, genero_id: int) -> Genero:
    genero = await session.get(Genero, genero_id)
    if genero is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Género no encontrado")
    return genero


async def actualizar(session: AsyncSession, genero_id: int, datos: GeneroUpdate) -> Genero:
    genero = await obtener(session, genero_id)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(genero, campo, valor)
    await _guardar(session)
    return genero
