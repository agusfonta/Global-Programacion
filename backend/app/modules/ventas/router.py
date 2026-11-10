from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.modules.ventas import service
from app.modules.ventas.schemas import VentaCreate, VentaDetalleRead, VentaRead

router = APIRouter(prefix="/ventas", tags=["ventas"])


@router.post("/", response_model=VentaDetalleRead, status_code=status.HTTP_201_CREATED)
async def crear_venta(
    datos: VentaCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> VentaDetalleRead:
    venta = await service.crear(session, datos)
    background_tasks.add_task(service.avisar_comprobante, venta.id)
    return venta


@router.get("/", response_model=list[VentaRead])
async def listar_ventas(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[VentaRead]:
    return await service.listar(session, limit, offset)


@router.get("/{venta_id}", response_model=VentaDetalleRead)
async def obtener_venta(
    venta_id: int, session: AsyncSession = Depends(get_session)
) -> VentaDetalleRead:
    return await service.obtener(session, venta_id)
