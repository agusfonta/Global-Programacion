from sqlmodel import SQLModel

from app.modules.autores import models as autores  # noqa: F401
from app.modules.clientes import models as clientes  # noqa: F401
from app.modules.editoriales import models as editoriales  # noqa: F401
from app.modules.generos import models as generos  # noqa: F401
from app.modules.libros import models as libros  # noqa: F401
from app.modules.ventas import models as ventas  # noqa: F401

metadata = SQLModel.metadata
