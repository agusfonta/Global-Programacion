from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.autores.models import Autor
from sqlalchemy.orm import joinedload

from app.modules.libros.models import LibroAutor
from app.modules.autores.schemas import AutorCreate, AutorUpdate


async def _guardar(session: AsyncSession) -> None:
    """Flush traduciendo el rechazo de la base a un error propio (RN-12)."""
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Los datos del autor violan una restricción"
        ) from exc


async def crear(session: AsyncSession, datos: AutorCreate) -> Autor:
    autor = Autor(**datos.model_dump())
    session.add(autor)
    await _guardar(session)
    return autor


async def listar(session: AsyncSession, limit: int, offset: int) -> list[Autor]:
    stmt = select(Autor).order_by(Autor.id).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def obtener(session: AsyncSession, autor_id: int) -> Autor:
    autor = await session.get(Autor, autor_id)
    if autor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Autor no encontrado")
    return autor


async def actualizar(session: AsyncSession, autor_id: int, datos: AutorUpdate) -> Autor:
    autor = await obtener(session, autor_id)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(autor, campo, valor)
    await _guardar(session)
    return autor


async def listar_libros(
    session: AsyncSession, autor_id: int, limit: int, offset: int
) -> list[LibroAutor]:
    await obtener(session, autor_id)  # 404 si no existe
    stmt = (
        select(LibroAutor)
        .where(LibroAutor.autor_id == autor_id)
        .options(joinedload(LibroAutor.libro))  # to-one -> joinedload
        .order_by(LibroAutor.libro_id)
        .limit(limit)
        .offset(offset)
    )
    return list((await session.execute(stmt)).scalars().all())
