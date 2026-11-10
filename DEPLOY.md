# Despliegue en Easypanel

Dos servicios **App** del mismo proyecto de Easypanel: **backend** (FastAPI, red interna) y
**frontend** (Nginx, público por HTTPS). Los campos marcados **COMPLETAR** se rellenan al
desplegar; no se inventan valores.

## Datos del despliegue

| Dato | Valor |
|---|---|
| URL pública (frontend) | COMPLETAR (dominio HTTPS asignado por Easypanel) |
| Revisión desplegada (commit) | COMPLETAR (`git rev-parse --short HEAD`) |
| Repositorio / rama | COMPLETAR |
| Fecha y hora del despliegue | COMPLETAR |
| Proyecto de Easypanel | COMPLETAR (en la documentación previa del grupo: `grupo1-chicas`) |

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

`API_UPSTREAM` tiene la forma `host:puerto`, sin `http://` ni barra final. Con el proyecto y el
servicio de este grupo debería ser `grupo1-chicas_backend:8000` (**COMPLETAR**: confirmar el
nombre interno exacto en Easypanel y anotar el valor usado).

## Proxy

Nginx (`frontend/default.conf.template`) sirve los archivos estáticos de `public/` y reenvía
`/api/` al backend quitando el prefijo: la barra final de `proxy_pass` hace que `/api/libros/`
llegue a FastAPI como `/libros/`. El navegador habla con un solo origen, por eso el backend no
necesita CORS. El Dockerfile limita la sustitución de variables a `API_UPSTREAM`
(`NGINX_ENVSUBST_FILTER`).

## Carga inicial de datos

`backend/test/seed.sql` carga datos ficticios, pero **vacía las tablas** (`TRUNCATE ... CASCADE`)
antes de insertar. **No se ejecuta sobre la base del despliegue**: esa base ya contiene datos y se
conservan. Antes de publicar se comprueba que el catálogo no esté vacío:

```bash
curl -s https://<URL-publica>/api/libros/?limit=3
```

Si se quisiera usar el seed, hacerlo solo sobre una base nueva y vacía.

## Verificación en la URL pública

Registrar acá lo observado (con datos ficticios), y guardar capturas en [evidencia/](evidencia/):

| Verificación | Resultado |
|---|---|
| `GET <URL>/` abre por HTTPS | COMPLETAR |
| `GET <URL>/api/health/ready` responde 200 | COMPLETAR |
| G-01 catálogo (búsqueda, limit/offset, sin coincidencias, detalle) | COMPLETAR |
| G-02 alta de libro (y 409 por ISBN repetido) | COMPLETAR |
| G-03 alta de cliente (y 409 por email repetido) | COMPLETAR |
| G-04 venta con dos renglones y detalle tras recargar | COMPLETAR |
| G-05 `PATCH /libros/{id}` y venta anterior sin cambios | COMPLETAR |
| G-06 rechazos 409 y 422, historial sin cambios | COMPLETAR |
| G-07 imagen del frontend se construye; HTTPS; datos tras redespliegue | COMPLETAR |

Ya hay evidencia **local** (no de la URL pública) de G-01 a G-06 y de la construcción de la
imagen en [evidencia/pruebas-G01-G06.md](evidencia/pruebas-G01-G06.md) y
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

El grupo ya tiene un backend desplegado a mano como contenedor suelto (puerto publicado propio),
contra la misma base PostgreSQL. Se dejó funcionando y el servicio App de esta guía convive con él;
ambos usan las mismas migraciones, que son idempotentes.
