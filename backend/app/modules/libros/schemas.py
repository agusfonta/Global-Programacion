from decimal import Decimal
from typing import Literal

from pydantic import ConfigDict, model_validator
from sqlmodel import Field, SQLModel

Rol = Literal["autor", "coautor", "traductor", "ilustrador"]


class LibroAutorCreate(SQLModel):
    autor_id: int
    rol: Rol
    orden: int = Field(ge=1)


class LibroCreate(SQLModel):
    isbn: str = Field(min_length=1)
    titulo: str = Field(min_length=1)
    precio: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    stock: int = Field(ge=0)
    editorial_id: int
    genero_id: int | None = None
    autores: list[LibroAutorCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _autores_sin_repetir(self) -> "LibroCreate":
        ids = [a.autor_id for a in self.autores]
        if len(ids) != len(set(ids)):
            raise ValueError("autores no puede repetir autor_id")
        return self


class LibroUpdate(SQLModel):
    isbn: str | None = Field(default=None, min_length=1)
    titulo: str | None = Field(default=None, min_length=1)
    precio: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    stock: int | None = Field(default=None, ge=0)
    editorial_id: int | None = None
    genero_id: int | None = None

    @model_validator(mode="after")
    def _sin_nulos_obligatorios(self) -> "LibroUpdate":
        obligatorios = ("isbn", "titulo", "precio", "stock", "editorial_id")
        nulos = [c for c in obligatorios if c in self.model_fields_set and getattr(self, c) is None]
        if nulos:
            raise ValueError(f"campos que no admiten null: {', '.join(nulos)}")
        return self


class EditorialResumen(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    pais: str


class GeneroResumen(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class AutorResumen(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    nacionalidad: str


class AutoriaRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    autor: AutorResumen
    rol: str
    orden: int


class LibroRead(SQLModel):
    """Listado: libro con su editorial y género."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    isbn: str
    titulo: str
    precio: Decimal
    stock: int
    editorial: EditorialResumen
    genero: GeneroResumen | None = None


class LibroDetalleRead(LibroRead):
    """Detalle: suma la lista de autorías (autor + rol + orden)."""

    autorias: list[AutoriaRead]
