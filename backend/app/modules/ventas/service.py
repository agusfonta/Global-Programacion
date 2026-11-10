import asyncio
import logging
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.modules.libros.models import Libro
from app.modules.ventas.models import RenglonVenta, Venta
from app.modules.ventas.schemas import VentaCreate

logger = logging.getLogger(__name__)


async def avisar_comprobante(venta_id: int) -> None:
    """Tarea en segundo plano: simula el envío del comprobante sin bloquear el loop."""
    await asyncio.sleep(0.5)
    logger.info("Comprobante de la venta %s enviado", venta_id)


async def _leer_detalle(session: AsyncSession, venta_id: int) -> Venta | None:
    # to-one -> joinedload, colección -> selectinload (cantidad fija de consultas)
    stmt = (
        select(Venta)
        .where(Venta.id == venta_id)
        .options(
            joinedload(Venta.cliente),
            selectinload(Venta.renglones).joinedload(RenglonVenta.libro),
        )
        .execution_options(populate_existing=True)
    )
    return (await session.execute(stmt)).unique().scalar_one_or_none()


async def crear(session: AsyncSession, datos: VentaCreate) -> Venta:
    ids = [r.libro_id for r in datos.renglones]
    libros = {
        libro.id: libro
        for libro in (await session.execute(select(Libro).where(Libro.id.in_(ids)))).scalars()
    }
    faltantes = sorted(set(ids) - libros.keys())
    if faltantes:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Los libros {faltantes} no existen",
        )

    # RN-06: el precio se copia del libro; RN-07: total = Σ cantidad × precio_unitario
    renglones = [
        RenglonVenta(
            libro_id=r.libro_id,
            cantidad=r.cantidad,
            precio_unitario=libros[r.libro_id].precio,
        )
        for r in datos.renglones
    ]
    total = sum((r.cantidad * r.precio_unitario for r in renglones), Decimal("0"))

    venta = Venta(cliente_id=datos.cliente_id, total=total)
    venta.renglones = renglones
    session.add(venta)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "El cliente indicado no existe") from exc
    # Se confirma acá para que la tarea en segundo plano y el cliente vean la venta ya guardada
    await session.commit()
    return await _leer_detalle(session, venta.id)


async def listar(
    session: AsyncSession, limit: int, offset: int, cliente_id: int | None = None
) -> list[Venta]:
    stmt = select(Venta).options(joinedload(Venta.cliente))
    if cliente_id is not None:
        stmt = stmt.where(Venta.cliente_id == cliente_id)
    stmt = stmt.order_by(Venta.id).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def obtener(session: AsyncSession, venta_id: int) -> Venta:
    venta = await _leer_detalle(session, venta_id)
    if venta is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venta no encontrada")
    return venta
