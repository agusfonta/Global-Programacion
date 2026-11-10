from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.modules.clientes import service
from app.modules.ventas import service as ventas_service
from app.modules.ventas.schemas import VentaRead
from app.modules.clientes.schemas import (
    ClienteCreate,
    ClienteRead,
    ClienteUpdate,
    PerfilCreate,
    PerfilRead,
)

router = APIRouter(prefix="/clientes", tags=["clientes"])


@router.post("/", response_model=ClienteRead, status_code=status.HTTP_201_CREATED)
async def crear_cliente(
    datos: ClienteCreate, session: AsyncSession = Depends(get_session)
) -> ClienteRead:
    return await service.crear(session, datos)


@router.get("/", response_model=list[ClienteRead])
async def listar_clientes(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[ClienteRead]:
    return await service.listar(session, limit, offset)


@router.get("/{cliente_id}", response_model=ClienteRead)
async def obtener_cliente(
    cliente_id: int, session: AsyncSession = Depends(get_session)
) -> ClienteRead:
    return await service.obtener(session, cliente_id)


@router.patch("/{cliente_id}", response_model=ClienteRead)
async def actualizar_cliente(
    cliente_id: int, datos: ClienteUpdate, session: AsyncSession = Depends(get_session)
) -> ClienteRead:
    return await service.actualizar(session, cliente_id, datos)


@router.post(
    "/{cliente_id}/perfil", response_model=PerfilRead, status_code=status.HTTP_201_CREATED
)
async def crear_perfil(
    cliente_id: int, datos: PerfilCreate, session: AsyncSession = Depends(get_session)
) -> PerfilRead:
    return await service.crear_perfil(session, cliente_id, datos)


@router.get("/{cliente_id}/ventas", response_model=list[VentaRead])
async def listar_ventas_de_cliente(
    cliente_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[VentaRead]:
    await service.obtener(session, cliente_id)  # 404 si no existe
    return await ventas_service.listar(session, limit, offset, cliente_id=cliente_id)
