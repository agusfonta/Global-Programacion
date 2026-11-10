from datetime import datetime
from decimal import Decimal

from pydantic import AliasPath, ConfigDict, computed_field, model_validator
from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel


class RenglonCreate(SQLModel):
    libro_id: int
    cantidad: int = Field(ge=1)


class VentaCreate(SQLModel):
    """No viajan precio, total ni fecha: los resuelve el servidor (RN-06, RN-07)."""

    cliente_id: int
    renglones: list[RenglonCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def _sin_libros_repetidos(self) -> "VentaCreate":
        ids = [r.libro_id for r in self.renglones]
        if len(ids) != len(set(ids)):
            raise ValueError("renglones no puede repetir libro_id")
        return self


class ClienteResumen(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    email: str


class RenglonRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    libro_id: int
    titulo: str = PydanticField(validation_alias=AliasPath("libro", "titulo"))
    cantidad: int
    precio_unitario: Decimal

    @computed_field
    @property
    def subtotal(self) -> Decimal:
        return self.cantidad * self.precio_unitario


class VentaRead(SQLModel):
    """Listado: venta con su cliente."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha: datetime
    total: Decimal
    cliente: ClienteResumen


class VentaDetalleRead(VentaRead):
    """Detalle: suma los renglones."""

    renglones: list[RenglonRead]
