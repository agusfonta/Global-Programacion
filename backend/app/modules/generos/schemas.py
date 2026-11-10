from pydantic import ConfigDict, model_validator
from sqlmodel import Field, SQLModel


class GeneroCreate(SQLModel):
    nombre: str = Field(min_length=1)


class GeneroUpdate(SQLModel):
    nombre: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _sin_nulos(self) -> "GeneroUpdate":
        nulos = [c for c in self.model_fields_set if getattr(self, c) is None]
        if nulos:
            raise ValueError(f"campos que no admiten null: {', '.join(nulos)}")
        return self


class GeneroRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
