from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.editoriales.models import Editorial
from app.modules.editoriales.schemas import EditorialCreate, EditorialUpdate

UNIQUE_VIOLATION = "23505"


def _conflicto(exc: IntegrityError) -> HTTPException:
    """Traduce el rechazo de la base a un 409 con mensaje propio (RN-12)."""
    if getattr(exc.orig, "sqlstate", None) == UNIQUE_VIOLATION:
        detalle = "Ya existe una editorial con ese nombre"
    else:
        detalle = "Los datos de la editorial violan una restricción"
    return HTTPException(status.HTTP_409_CONFLICT, detalle)


async def _guardar(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise _conflicto(exc) from exc


async def crear(session: AsyncSession, datos: EditorialCreate) -> Editorial:
    editorial = Editorial(**datos.model_dump())
    session.add(editorial)
    await _guardar(session)
    return editorial


async def listar(session: AsyncSession, limit: int, offset: int) -> list[Editorial]:
    stmt = select(Editorial).order_by(Editorial.id).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def obtener(session: AsyncSession, editorial_id: int) -> Editorial:
    editorial = await session.get(Editorial, editorial_id)
    if editorial is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Editorial no encontrada")
    return editorial


async def actualizar(
    session: AsyncSession, editorial_id: int, datos: EditorialUpdate
) -> Editorial:
    editorial = await obtener(session, editorial_id)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(editorial, campo, valor)
    await _guardar(session)
    return editorial
