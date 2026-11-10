from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.modules.clientes.models import Cliente, PerfilCliente
from app.modules.clientes.schemas import ClienteCreate, ClienteUpdate, PerfilCreate

UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"


def _sqlstate(exc: IntegrityError) -> str | None:
    return getattr(exc.orig, "sqlstate", None)


async def _guardar(session: AsyncSession, detalle_unico: str) -> None:
    """Flush traduciendo el rechazo de la base a un error propio (RN-12)."""
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        sqlstate = _sqlstate(exc)
        if sqlstate == UNIQUE_VIOLATION:
            raise HTTPException(status.HTTP_409_CONFLICT, detalle_unico) from exc
        if sqlstate == FOREIGN_KEY_VIOLATION:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente no encontrado") from exc
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Los datos violan una restricción"
        ) from exc


async def _leer(session: AsyncSession, cliente_id: int) -> Cliente | None:
    # to-one -> joinedload
    stmt = (
        select(Cliente)
        .where(Cliente.id == cliente_id)
        .options(joinedload(Cliente.perfil))
        .execution_options(populate_existing=True)
    )
    return (await session.execute(stmt)).unique().scalar_one_or_none()


async def crear(session: AsyncSession, datos: ClienteCreate) -> Cliente:
    cliente = Cliente(**datos.model_dump())
    session.add(cliente)
    await _guardar(session, "Ya existe un cliente con ese email")
    return await _leer(session, cliente.id)


async def listar(session: AsyncSession, limit: int, offset: int) -> list[Cliente]:
    stmt = (
        select(Cliente)
        .options(joinedload(Cliente.perfil))
        .order_by(Cliente.id)
        .limit(limit)
        .offset(offset)
    )
    return list((await session.execute(stmt)).scalars().all())


async def obtener(session: AsyncSession, cliente_id: int) -> Cliente:
    cliente = await _leer(session, cliente_id)
    if cliente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente no encontrado")
    return cliente


async def actualizar(session: AsyncSession, cliente_id: int, datos: ClienteUpdate) -> Cliente:
    cliente = await obtener(session, cliente_id)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(cliente, campo, valor)
    await _guardar(session, "Ya existe un cliente con ese email")
    return cliente


async def crear_perfil(
    session: AsyncSession, cliente_id: int, datos: PerfilCreate
) -> PerfilCliente:
    # Sin chequeo previo: la UNIQUE sobre cliente_id rechaza el segundo perfil (RN-09)
    perfil = PerfilCliente(cliente_id=cliente_id, **datos.model_dump())
    session.add(perfil)
    await _guardar(session, "El cliente ya tiene un perfil")
    return perfil
