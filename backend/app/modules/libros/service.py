from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.modules.libros.models import Libro, LibroAutor
from app.modules.libros.schemas import LibroCreate, LibroUpdate

UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"


def _conflicto(exc: IntegrityError) -> HTTPException:
    """Traduce el rechazo de la base a un 409 con mensaje propio (RN-12)."""
    sqlstate = getattr(exc.orig, "sqlstate", None)
    if sqlstate == UNIQUE_VIOLATION:
        detalle = "Ya existe un libro con ese ISBN"
    elif sqlstate == FOREIGN_KEY_VIOLATION:
        detalle = "La editorial, el género o algún autor indicado no existe"
    else:
        detalle = "Los datos del libro violan una restricción"
    return HTTPException(status.HTTP_409_CONFLICT, detalle)


async def _leer_detalle(session: AsyncSession, libro_id: int) -> Libro | None:
    # to-one -> joinedload, colección -> selectinload (cantidad fija de consultas)
    stmt = (
        select(Libro)
        .where(Libro.id == libro_id)
        .options(
            joinedload(Libro.editorial),
            joinedload(Libro.genero),
            selectinload(Libro.autorias).joinedload(LibroAutor.autor),
        )
        .execution_options(populate_existing=True)
    )
    return (await session.execute(stmt)).unique().scalar_one_or_none()


async def crear(session: AsyncSession, datos: LibroCreate) -> Libro:
    libro = Libro(**datos.model_dump(exclude={"autores"}))
    libro.autorias = [LibroAutor(**a.model_dump()) for a in datos.autores]
    session.add(libro)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise _conflicto(exc) from exc
    return await _leer_detalle(session, libro.id)


async def listar(
    session: AsyncSession,
    limit: int,
    offset: int,
    titulo: str | None = None,
    genero_id: int | None = None,
    editorial_id: int | None = None,
) -> list[Libro]:
    stmt = select(Libro).options(joinedload(Libro.editorial), joinedload(Libro.genero))
    if genero_id is not None:
        stmt = stmt.where(Libro.genero_id == genero_id)
    if editorial_id is not None:
        stmt = stmt.where(Libro.editorial_id == editorial_id)
    if titulo:
        stmt = stmt.where(Libro.titulo.ilike(f"%{titulo}%"))  # parametrizado
    stmt = stmt.order_by(Libro.id).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def obtener(session: AsyncSession, libro_id: int) -> Libro:
    libro = await _leer_detalle(session, libro_id)
    if libro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Libro no encontrado")
    return libro


async def actualizar(session: AsyncSession, libro_id: int, datos: LibroUpdate) -> Libro:
    libro = await session.get(Libro, libro_id)
    if libro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Libro no encontrado")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(libro, campo, valor)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise _conflicto(exc) from exc
    return await _leer_detalle(session, libro_id)
