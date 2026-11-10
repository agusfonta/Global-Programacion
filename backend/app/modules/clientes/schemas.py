from typing import Annotated

from pydantic import ConfigDict, StringConstraints, model_validator
from sqlmodel import Field, SQLModel

Email = Annotated[str, StringConstraints(min_length=3, pattern=r"^[^@\s]+@[^@\s]+$")]


class ClienteCreate(SQLModel):
    nombre: str = Field(min_length=1)
    email: Email


class ClienteUpdate(SQLModel):
    nombre: str | None = Field(default=None, min_length=1)
    email: Email | None = None

    @model_validator(mode="after")
    def _sin_nulos(self) -> "ClienteUpdate":
        nulos = [c for c in self.model_fields_set if getattr(self, c) is None]
        if nulos:
            raise ValueError(f"campos que no admiten null: {', '.join(nulos)}")
        return self


class PerfilCreate(SQLModel):
    telefono: str | None = None
    direccion: str | None = None


class PerfilRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    telefono: str | None = None
    direccion: str | None = None


class ClienteRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    email: str
    perfil: PerfilRead | None = None
