from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, DateTime, Numeric
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.modules.clientes.models import Cliente
    from app.modules.libros.models import Libro


class Venta(SQLModel, table=True):
    __tablename__ = "venta"
    __table_args__ = (CheckConstraint("total >= 0", name="ck_venta_total"),)

    id: int | None = Field(default=None, primary_key=True)
    cliente_id: int = Field(foreign_key="cliente.id", index=True)
    fecha: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    total: Decimal = Field(default=Decimal("0"), sa_type=Numeric(12, 2))

    cliente: Optional["Cliente"] = Relationship(back_populates="ventas")
    renglones: list["RenglonVenta"] = Relationship(back_populates="venta")


class RenglonVenta(SQLModel, table=True):
    __tablename__ = "renglon_venta"
    __table_args__ = (
        CheckConstraint("cantidad > 0", name="ck_renglon_venta_cantidad"),
        CheckConstraint("precio_unitario > 0", name="ck_renglon_venta_precio"),
    )

    id: int | None = Field(default=None, primary_key=True)
    venta_id: int = Field(foreign_key="venta.id", index=True)
    libro_id: int = Field(foreign_key="libro.id", index=True)
    cantidad: int
    precio_unitario: Decimal = Field(sa_type=Numeric(10, 2))

    venta: Optional["Venta"] = Relationship(back_populates="renglones")
    libro: Optional["Libro"] = Relationship(back_populates="renglones")
