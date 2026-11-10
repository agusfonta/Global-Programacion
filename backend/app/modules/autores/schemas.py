from decimal import Decimal

from pydantic import AliasPath, ConfigDict, model_validator
from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel


class AutorCreate(SQLModel):
    nombre: str = Field(min_length=1)
    nacionalidad: str = Field(min_length=1)


class AutorUpdate(SQLModel):
    nombre: str | None = Field(default=None, min_length=1)
    nacionalidad: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _sin_nulos(self) -> "AutorUpdate":
        nulos = [c for c in self.model_fields_set if getattr(self, c) is None]
        if nulos:
            raise ValueError(f"campos que no admiten null: {', '.join(nulos)}")
        return self


class AutorRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    nacionalidad: str


class AutorLibroRead(SQLModel):
    """Un libro del autor, con el rol y el orden de la autoría."""

    model_config = ConfigDict(from_attributes=True)

    libro_id: int
    isbn: str = PydanticField(validation_alias=AliasPath("libro", "isbn"))
    titulo: str = PydanticField(validation_alias=AliasPath("libro", "titulo"))
    precio: Decimal = PydanticField(validation_alias=AliasPath("libro", "precio"))
    rol: str
    orden: int
