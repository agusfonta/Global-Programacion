# Despliegue en Easypanel

Dos servicios **App** del mismo proyecto de Easypanel: **backend** (FastAPI, red interna) y
**frontend** (Nginx, público por HTTPS). Los campos marcados **COMPLETAR** se rellenan al
desplegar; no se inventan valores.

## Datos del despliegue

| Dato | Valor |
|---|---|
| URL pública (frontend) | https://libreria.agusfontagnol.me |
| Revisión desplegada (commit) | `cd4c7f3` (rama `main`) |
| Repositorio / rama | https://github.com/agusfonta/Global-Programacion, rama `main` |
| Fecha del último despliegue | 2026-11-10, 13:02:47 (hora de Argentina; 16:02:47 GMT) |
| Proyecto de Easypanel | `grupo1-chicas` (servicios `backend-libreria`, `frontend-libreria` y `db-libreria`) |

## Servicios

### backend (App)

| Campo en Easypanel | Valor |
|---|---|
| Source → Repositorio y rama | los de la tabla de arriba |
| Source → Build Path | `/backend` |
| Build → método y ruta | Dockerfile, `Dockerfile` |
| Puerto de la API | `8000` (Uvicorn en `0.0.0.0:8000`, definido en el Dockerfile) |
| Domains | **ninguno**: se quita el dominio automático; solo red interna |
| Environment | `DATABASE_URL`, `SQL_ECHO` (ver abajo) |

Variables de entorno (valores reales **solo** en el panel, nunca en el repositorio):

| Variable | Forma |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://<usuario>:<password>@<host-interno-postgres>:5432/<base>` |
| `SQL_ECHO` | `false` |

El host y el puerto internos de PostgreSQL salen de **Credentials** del servicio Postgres de
Easypanel. El puerto 5432 se mantiene privado. Plantilla en [backend/env.example](backend/env.example).

**Migraciones:** el `CMD` del Dockerfile ejecuta `alembic upgrade head` antes de iniciar Uvicorn,
así que se aplican en cada arranque (si ya están aplicadas no hacen nada). Se confirma en los
logs del servicio con líneas `Running upgrade ...` o `Context impl PostgresqlImpl`.

**Salud** (desde **Shell** del servicio backend):

```bash
python -c "from urllib.request import urlopen; print(urlopen('http://127.0.0.1:8000/health/ready').status)"
```

Debe imprimir `200`.

### frontend (App)

| Campo en Easypanel | Valor |
|---|---|
| Source → Build Path | `/frontend` |
| Build → método y ruta | Dockerfile, `Dockerfile` |
| Puerto interno | `80` |
| Domains | dominio HTTPS asignado; protocolo interno **HTTP**, puerto de destino **80** |
| Environment | `API_UPSTREAM=<nombre-interno-del-backend>:8000` |

`API_UPSTREAM` tiene la forma `host:puerto`, sin `http://` ni barra final. Valor usado:
`API_UPSTREAM=grupo1-chicas_backend-libreria:8000` (nombre interno `<proyecto>_<servicio>`).

El host interno de PostgreSQL de este despliegue es `grupo1-chicas_db-libreria:5432`, base
`libreria` (servicio `db-libreria`). La contraseña solo existe en el panel.

## Dominio propio

El dominio `agusfontagnol.me` tiene el DNS en Namecheap, con un registro **A comodín** (`*`) hacia
la IP del servidor, así que `libreria.agusfontagnol.me` resuelve sin crear registros nuevos. En
`frontend-libreria` → Dominios se agregó el host `libreria.agusfontagnol.me` con HTTPS
(Let's Encrypt), protocolo interno HTTP y puerto de destino 80. Al cambiar de dominio **no hace
falta** modificar el código, el backend ni `API_UPSTREAM`: el frontend pide `/api/...` en
ruta relativa y Nginx lo reenvía por la red interna.

## Proxy

Nginx (`frontend/default.conf.template`) sirve los archivos estáticos de `public/` y reenvía
`/api/` al backend quitando el prefijo: la barra final de `proxy_pass` hace que `/api/libros/`
llegue a FastAPI como `/libros/`. El navegador habla con un solo origen (el dominio del frontend),
por eso el backend no necesita CORS ni cambios al cambiar de dominio. Comprobado: una petición
con `Origin: https://libreria.agusfontagnol.me` a `/api/libros/` responde 200 sin cabeceras CORS,
que no hacen falta. El Dockerfile limita la sustitución de variables a `API_UPSTREAM`
(`NGINX_ENVSUBST_FILTER`).

## Carga inicial de datos

`backend/test/seed.sql` carga datos ficticios (5 libros, 3 clientes y 1 venta), pero **vacía las
tablas** (`TRUNCATE ... CASCADE`) antes de insertar. Solo se ejecuta sobre una base nueva y vacía.

La base `libreria` del servicio `db-libreria` era nueva: las migraciones corrieron desde cero
(`Running upgrade -> 0001` y `0001 -> 0002` en los registros), así que se cargó el seed una vez
desde la **Consola** del servicio `backend-libreria`:

```bash
URL=$(echo "$DATABASE_URL" | sed 's/+asyncpg//')
psql -v ON_ERROR_STOP=1 "$URL" -f test/seed.sql
```

Resultado: `COMMIT`. Comprobación: `GET /api/libros/?limit=10` devuelve 5 libros. **No volver a
ejecutarlo** sobre esta base: borraría las ventas y los registros creados después.

## Verificación en la URL pública

Registrar acá lo observado (con datos ficticios), y guardar capturas en [evidencia/](evidencia/):

| Verificación | Resultado |
|---|---|
Ejecutado el 2026-11-10 sobre `https://libreria.agusfontagnol.me`. Registro completo en
[evidencia/pruebas-G01-G06-url-publica.md](evidencia/pruebas-G01-G06-url-publica.md)
(19 verificaciones, todas correctas) y capturas
[publica-escritorio-1280.png](evidencia/publica-escritorio-1280.png) y
[publica-movil-375.png](evidencia/publica-movil-375.png).

| Verificación | Resultado |
|---|---|
| `GET <URL>/` abre por HTTPS | OK (200) |
| `GET <URL>/api/health/ready` responde 200 | OK (200, `{"estado":"ok"}`) |
| G-01 catálogo (búsqueda, limit/offset, sin coincidencias, detalle) | OK |
| G-02 alta de libro (y 409 por ISBN repetido) | OK (201 y 409) |
| G-03 alta de cliente (y 409 por email repetido) | OK (201 y 409) |
| G-04 venta con dos renglones y detalle tras recargar | OK (201; detalle idéntico; total 42.691,00) |
| G-05 `PATCH /libros/{id}` y venta anterior sin cambios | OK (la venta conserva 12.345,50) |
| G-06 rechazos 409 y 422, historial sin cambios | OK (409, 409 y 422; historial igual) |
| G-07 imagen se construye, HTTPS y datos tras redespliegue | OK: ver [evidencia/G07-redespliegue.md](evidencia/G07-redespliegue.md). Tras redesplegar backend y frontend, salud 200 y los 8 libros, 5 clientes y 3 ventas (con importes) idénticos |

No se guardaron capturas de los mensajes de error en pantalla (409/422 en la interfaz):
COMPLETAR con capturas manuales desde la URL pública.

Evidencia **local** previa de la imagen en
[evidencia/imagen-frontend-local.md](evidencia/imagen-frontend-local.md).

## Diagnóstico

| Síntoma | Qué revisar |
|---|---|
| Falla un `COPY` | Build Path, nombres exactos de los archivos y la carpeta `public/` |
| Nginx no arranca o `/api/` da 502 | Logs del frontend, `API_UPSTREAM`, nombre interno y puerto, y que el backend esté en ejecución |
| `/api/health/ready` falla | Logs del backend, `DATABASE_URL`, conexión a PostgreSQL y migraciones |
| Una petición de la API da 404 | Pestaña Red del navegador: prefijo `/api` y ruta del backend, con su barra final |

## Cómo se actualiza

1. Hacer push de los cambios a la rama configurada.
2. En Easypanel, **Deploy** del servicio que cambió (backend, frontend o ambos).
3. Si cambió el esquema, las migraciones se aplican solas al arrancar el backend.
4. Comprobar `/api/health/ready` y que los datos sigan disponibles.

## Nota sobre el despliegue previo

El grupo ya tenía un backend desplegado a mano como contenedor suelto (puerto publicado propio),
contra otra base de PostgreSQL. Se dejó funcionando y no se modificó. El servicio App de esta guía
usa su propia base (`db-libreria`) y no comparte datos con aquel.

El servicio `backend-libreria` no tiene dominio público: el que Easypanel crea automáticamente se
borró desde Dominios y el frontend llega al backend por la red interna. Con el dominio propio ya
configurado, también se borró el dominio automático del frontend; `https://libreria.agusfontagnol.me`
es la única URL pública.
