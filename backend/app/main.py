import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.database import create_engine, create_session_factory
from app.modules.autores.router import router as autores_router
from app.modules.clientes.router import router as clientes_router
from app.modules.editoriales.router import router as editoriales_router
from app.modules.generos.router import router as generos_router
from app.modules.health.router import router as health_router
from app.modules.libros.router import router as libros_router
from app.modules.ventas.router import router as ventas_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    engine = create_engine()
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    try:
        yield
    finally:
        await engine.dispose()


# Solo el logger de la app: con basicConfig en la raíz, echo=True de SQLAlchemy duplica cada consulta.
_app_logger = logging.getLogger("app")
_app_logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
_app_logger.addHandler(_handler)
_app_logger.propagate = False

app = FastAPI(
    title="Librería",
    description="Catálogo, clientes y ventas",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(autores_router)
app.include_router(clientes_router)
app.include_router(editoriales_router)
app.include_router(generos_router)
app.include_router(libros_router)
app.include_router(ventas_router)
