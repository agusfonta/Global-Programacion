# Librería · TP Programación III (Unidades 1-4)

Integrantes: Agustina Fontagnol, Martina Suarez, Gianella Peña y Yoselie Aquino

API REST con FastAPI, SQLModel y PostgreSQL (asyncpg). Catálogo de libros, autores, editoriales y
géneros, más clientes y ventas.

## Requisitos

- Python 3.12 o superior
- PostgreSQL con una base vacía (por ejemplo `libreria`)

## Puesta en marcha

1. **Entorno virtual y dependencias**

   ```bash
   python -m venv .venv
   source .venv/Scripts/activate      # Windows (Git Bash); en PowerShell: .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **Variables de entorno.** Copiá `env.example` como `.env` y completá tus datos. El archivo
   `.env` no se versiona.

   ```bash
   cp env.example .env
   ```

   | Variable | Descripción |
   |---|---|
   | `DATABASE_URL` | Cadena de conexión, con el formato `postgresql+asyncpg://usuario:password@localhost:5432/libreria` |
   | `SQL_ECHO` | `true` para ver en la consola las consultas SQL (necesario para el caso C-07). Por defecto `false` |

3. **Crear las tablas** con Alembic (el proyecto no usa `create_all`):

   ```bash
   alembic upgrade head
   ```

   Para probar el ciclo de migraciones: `alembic downgrade -1` quita solo la última (la tabla
   `genero` y la columna `libro.genero_id`) y `alembic upgrade head` la vuelve a crear.

4. **Carga inicial de datos.** El script deja la base en un estado conocido y se puede ejecutar
   las veces que haga falta (vacía las tablas antes de cargar):

   ```bash
   psql -U <usuario> -d libreria -f test/seed.sql
   ```

   Dentro del contenedor Docker (la imagen trae el cliente `psql`; se le quita `+asyncpg` a
   `DATABASE_URL`):

   ```bash
   docker exec libreria sh -c 'psql -v ON_ERROR_STOP=1 "$(echo "$DATABASE_URL" | sed "s/+asyncpg//")" -f test/seed.sql'
   ```

5. **Levantar el servidor**

   ```bash
   uvicorn app.main:app --reload
   ```

   - Documentación interactiva: <http://localhost:8000/docs>
   - Estado: `GET /health/live` (sin tocar la base) y `GET /health/ready` (ejecuta `SELECT 1`)

## Docker

La imagen y los comandos para construirla y correrla están en [DEPLOY.md](DEPLOY.md).

## Estructura

```
app/
├── main.py              # App, lifespan (motor y fábrica de sesiones) y registro de routers
├── core/                # config.py (lee .env) y database.py (motor, sesión, get_session)
└── modules/
    ├── health/
    ├── editoriales/
    ├── generos/
    ├── autores/
    ├── libros/          # incluye LibroAutor
    ├── clientes/        # incluye PerfilCliente
    └── ventas/          # incluye RenglonVenta
        # cada módulo: models.py · schemas.py · service.py · router.py
migrations/              # Alembic (plantilla asincrónica) y versions/
test/                    # seed.sql y archivos .http con los casos C-01 a C-08
```

## Endpoints

| Recurso | Rutas |
|---|---|
| Health | `GET /health/live`, `GET /health/ready` |
| Editoriales | `POST /editoriales/`, `GET /editoriales/`, `GET /editoriales/{id}`, `PATCH /editoriales/{id}`, `GET /editoriales/{id}/libros` |
| Géneros | `POST /generos/`, `GET /generos/`, `GET /generos/{id}`, `PATCH /generos/{id}`, `GET /generos/{id}/libros` |
| Autores | `POST /autores/`, `GET /autores/`, `GET /autores/{id}`, `PATCH /autores/{id}`, `GET /autores/{id}/libros` |
| Libros | `POST /libros/`, `GET /libros/` (`titulo`, `genero_id`), `GET /libros/{id}`, `PATCH /libros/{id}` |
| Clientes | `POST /clientes/`, `GET /clientes/`, `GET /clientes/{id}`, `PATCH /clientes/{id}`, `POST /clientes/{id}/perfil`, `GET /clientes/{id}/ventas` |
| Ventas | `POST /ventas/`, `GET /ventas/`, `GET /ventas/{id}` |

Los listados se paginan con `limit` (1 a 100, por defecto 20) y `offset` (desde 0).

Códigos de respuesta: 201 al crear, 404 si el recurso no existe, 409 cuando la base rechaza la
escritura (UNIQUE o clave foránea) y 422 si el cuerpo o los parámetros no cumplen el contrato. Los
errores 409 llevan un mensaje propio, nunca el texto de la base.

## Casos de prueba

Los archivos de `test/` usan el formato de la extensión *REST Client* de VS Code (también
funcionan en los IDE de JetBrains). Antes de correrlos, cargá `test/seed.sql`. Cada petición lleva
su respuesta esperada en un comentario.

| Caso | Archivo | Qué demuestra |
|---|---|---|
| C-01 | `C-01_parametro_no_entero.http` | Parámetro de ruta no entero → 422 |
| C-02 | `C-02_unicidad.http` | ISBN o email repetido → 409 con mensaje propio |
| C-03 | `C-03_segundo_perfil.http` | Segundo perfil del mismo cliente → 409 |
| C-04 | `C-04_libro_con_ids_inexistentes.http` | Libro con editorial o autor inexistente → 409 |
| C-05 | `C-05_venta_con_ids_inexistentes.http` | Venta con libro o cliente inexistente → 409 |
| C-06 | `C-06_venta_valida.http` | Venta válida → 201, precios copiados y total calculado |
| C-07 | `C-07_consultas_fijas.http` | Cantidad fija de consultas (requiere `SQL_ECHO=true`) |
| C-08 | `C-08_busqueda_segura.http` | `' OR '1'='1` → 200 con lista vacía |

En C-07d hay que usar el id de la venta que devolvió C-06 (las altas fallidas de C-04 y C-05 también consumen ids de la secuencia).

## Decisiones de diseño

- **Dinero con `Decimal`** (`Numeric(10,2)` y `Numeric(12,2)`), nunca `float`.
- **Unicidad y claves foráneas las garantiza la base**: no hay consultas previas de existencia;
  el `IntegrityError` se traduce a un 409 con mensaje propio.
- **Sin N+1**: `joinedload` para relaciones a uno y `selectinload` para colecciones, declarados en
  la misma consulta. El detalle de un libro o de una venta emite una cantidad fija de consultas.
- **Ventas**: el DTO de alta solo lleva `cliente_id` y los renglones (`libro_id`, `cantidad`). El
  precio de cada renglón se copia del libro y el total lo calcula el servidor. Las ventas no se
  modifican (no hay `PATCH`).
- **Asincronía**: todos los handlers son `async def`. Al registrar una venta se agenda con
  `BackgroundTasks` un aviso de comprobante (`asyncio.sleep(0.5)` y un mensaje en el log) que
  corre después de enviar la respuesta.
