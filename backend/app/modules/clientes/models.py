from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.modules.ventas.models import Venta


class Cliente(SQLModel, table=True):
    __tablename__ = "cliente"

    id: int | None = Field(default=None, primary_key=True)
    nombre: str
    email: str = Field(unique=True)

    perfil: Optional["PerfilCliente"] = Relationship(back_populates="cliente")
    ventas: list["Venta"] = Relationship(back_populates="cliente")


class PerfilCliente(SQLModel, table=True):
    __tablename__ = "perfil_cliente"

    id: int | None = Field(default=None, primary_key=True)
    cliente_id: int = Field(foreign_key="cliente.id", unique=True, index=True)
    telefono: str | None = None
    direccion: str | None = None

    cliente: Optional["Cliente"] = Relationship(back_populates="perfil")
