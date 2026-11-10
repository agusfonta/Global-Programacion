# Despliegue con Docker

Imagen del TP congelado (Cap. 1-4) para correr en un contenedor. Todos los comandos se ejecutan
desde esta carpeta (`despliegue/`). Sin Docker Compose.

## Despliegue en el VPS (Ej. 10)

- **URL pública**: http://187.127.58.90:8101 (por ejemplo `/health/ready`, `/libros/`, `/docs`).
- **Grupo**: Las chicas.
- **Fecha y hora del despliegue** (primer `docker run`): viernes 2026-11-06, 14:55:52 UTC =
  11:55:52 en Argentina (America/Argentina/Mendoza). El contenedor se recreó a las 15:05:03 UTC
  (12:05:03) para el caso D-04; mismos datos y misma imagen.
- **Dónde se construyó la imagen**: en el propio servidor (`docker build -t libreria .` en
  `/root/libreria/despliegue`), no se llevó una imagen ya construida.
- **Cómo se llevaron los archivos**: `tar` sobre SSH desde `despliegue/`, sin `.env`, `.venv`,
  `evidencia/` ni `__pycache__`:

  ```bash
  tar -C despliegue --exclude=.env --exclude='.env.*' --exclude=.venv --exclude=evidencia \
    --exclude=__pycache__ --exclude='*.pyc' -cf - . \
    | ssh <usuario>@187.127.58.90 \
      'mkdir -p /root/libreria/despliegue && tar -C /root/libreria/despliegue -xf -'
  ```

- **Base de datos**: el PostgreSQL del grupo en Easypanel (servicio `grupo1-chicas_db`,
  PostgreSQL 17). Se creó una base nueva `libreria` con un rol propio `libreria` (dueño de esa
  base), separada de la base `calculadora` del otro proyecto del grupo para que las tablas y
  `alembic_version` no choquen.
- **Red y host de la base**: la base no publica el puerto 5432 en el servidor, así que
  `host.docker.internal` no llega a ella. El contenedor se une a la red de Docker del grupo
  (`easypanel-grupo1-chicas`, `attachable`) y usa el host `grupo1-chicas-db`.
- **Archivo de variables**: `/root/libreria/libreria.env` (permisos 600, fuera del contexto de
  build, de la imagen y del repositorio). Su contenido tiene esta forma (la contraseña no se
  muestra en ningún lado):

  ```
  DATABASE_URL=postgresql+asyncpg://libreria:<password>@grupo1-chicas-db:5432/libreria
  SQL_ECHO=false
  ```

- **Comandos ejecutados en el servidor** (desde `/root/libreria/despliegue`):

  ```bash
  docker build -t libreria .
  docker run -d --name libreria -p 8101:8000 --restart unless-stopped \
    --network easypanel-grupo1-chicas --env-file /root/libreria/libreria.env libreria
  docker exec libreria \
  sh -c 'psql -v ON_ERROR_STOP=1 "$(echo "$DATABASE_URL" | sed "s/+asyncpg//")" -f test/seed.sql'
  ```

  El único agregado respecto del `docker run` de la sección 3 es `--network` y el puerto 8101.
  La carga inicial (`test/seed.sql`) dejó 5 libros, clientes y editoriales de ejemplo.
- **Firewall**: no hizo falta ninguna regla de `ufw`; los puertos publicados por Docker no pasan
  por sus cadenas en este servidor y el acceso desde afuera funcionó directamente.
- **Cómo se actualiza**: llevar los archivos de nuevo (el `tar` de arriba), y en el servidor
  `docker build -t libreria .`, `docker rm -f libreria` y el mismo `docker run` de arriba. Los
  datos viven en la base: recrear el contenedor no los pierde y las migraciones ya aplicadas no
  se repiten.
- **Si el contenedor no está después de reiniciar el servidor**: un contenedor unido a una red
  de swarm puede no arrancar si la red aún no estaba lista; se levanta con `docker start libreria`
  (y se confirma con `docker ps`).
- **Avisos**: el servidor es compartido con otros grupos (1 CPU, ~4 GB); la base del servidor es
  PostgreSQL 17 y las pruebas locales de C-10 usaron la 16 (las migraciones son DDL estándar y
  corrieron sin cambios).

### Evidencia (casos D)

Salida de consola con fecha, host y comando. Los casos D-01 a D-08 de [evidencia/](evidencia/)
se ejecutaron en el VPS; los de [evidencia/local/](evidencia/local/) son los de la prueba local
(C-10).

| Caso | Archivo |
|------|---------|
| D-01 imágenes (base y proyecto) | [evidencia/D-01_imagenes.txt](evidencia/D-01_imagenes.txt) |
| D-02 arranque con migraciones | [evidencia/D-02_arranque.txt](evidencia/D-02_arranque.txt) |
| D-03 URL pública, desde afuera del VPS | [evidencia/D-03_url_publica.txt](evidencia/D-03_url_publica.txt) |
| D-04 recrear el contenedor | [evidencia/D-04_recrear.txt](evidencia/D-04_recrear.txt) |
| D-05 sin `DATABASE_URL` | [evidencia/D-05_sin_database_url.txt](evidencia/D-05_sin_database_url.txt) |
| D-06 contenido de la imagen | [evidencia/D-06_contenido_imagen.txt](evidencia/D-06_contenido_imagen.txt) |
| D-07 usuario sin privilegios | [evidencia/D-07_usuario.txt](evidencia/D-07_usuario.txt) |
| D-08 aviso del comprobante en los logs | [evidencia/D-08_aviso_comprobante.txt](evidencia/D-08_aviso_comprobante.txt) |
| IN-06 datos iniciales / IN-07 `/health/ready` (local) | [evidencia/local/IN-06_seed.txt](evidencia/local/IN-06_seed.txt), [evidencia/local/IN-07_health_ready.txt](evidencia/local/IN-07_health_ready.txt) |

Lo que sigue describe la imagen y los comandos genéricos (valen en cualquier máquina; el
despliegue del VPS es el de arriba).

## 1. Archivo de variables

Crear un archivo de variables **fuera del repositorio** (por ejemplo `libreria.env`; nunca se
versiona ni entra en la imagen) a partir de [env.example](env.example):

```
DATABASE_URL=postgresql+asyncpg://<usuario>:<password>@<host>:5432/<base>
SQL_ECHO=false
```

Dentro de un contenedor `localhost` es el propio contenedor: `<host>` debe ser
`host.docker.internal` (base en la misma máquina) o la dirección de la base. Sin
`DATABASE_URL` el contenedor se detiene con un error que lo indica.

## 2. Construir la imagen

```bash
docker build -t libreria .
```

Base `python:3.12-alpine`; todas las dependencias bajan como wheels (no se compila nada).

## 3. Correr el contenedor

```bash
docker run -d --name libreria -p 8000:8000 --restart unless-stopped \
  --env-file libreria.env libreria
```

En Linux, para que `host.docker.internal` resuelva, agregar
`--add-host=host.docker.internal:host-gateway`:

```bash
docker run -d --name libreria -p 8000:8000 --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway --env-file libreria.env libreria
```

Al arrancar aplica `alembic upgrade head` y luego levanta `uvicorn` (usuario `app`, sin
privilegios). El `HEALTHCHECK` consulta `GET /health/ready`; `docker ps` muestra `(healthy)`.

## 4. Datos iniciales

La imagen trae el cliente `psql`. El comando carga `test/seed.sql` (se puede repetir: vacía las
tablas y vuelve a cargar):

```bash
docker exec libreria \
  sh -c 'psql -v ON_ERROR_STOP=1 "$(echo "$DATABASE_URL" | sed "s/+asyncpg//")" -f test/seed.sql'
```

Comprobación: `curl http://127.0.0.1:8000/libros/` devuelve 5 libros.

## 5. Cómo se actualiza

```bash
docker build -t libreria .
docker rm -f libreria
docker run -d --name libreria -p 8000:8000 --restart unless-stopped \
  --env-file libreria.env libreria
```

Los datos viven en la base, no en el contenedor: recrearlo no los pierde, y las migraciones ya
aplicadas no se repiten.

## Cambios hechos al TP

Sólo para poder desplegarlo; la lógica de negocio no cambió.

- **Dockerfile** (nuevo): `python:3.12-alpine`, `postgresql-client` (para `psql`), dependencias
  antes del código con `--no-cache-dir`, usuario `app` sin privilegios, `EXPOSE 8000`,
  `HEALTHCHECK` con `wget` a `/health/ready`, arranque `alembic upgrade head && exec uvicorn`.
- **.dockerignore** (nuevo): deja afuera `.env`, `.venv/`, `.git/`, `__pycache__`, `*.pyc` y
  `evidencia/`.
- **IN-07** (`app/modules/health/service.py` y `router.py`): `/health/ready` responde 503 con
  `{"estado": "no disponible"}` si la base no contesta (límite de 3 s); antes terminaba en 500.
  `/health/live` no cambia.
- **IN-06** (datos iniciales): el `psql` de la imagen permite correr `test/seed.sql` tal cual
  dentro del contenedor; no se agregó ningún script.
- **Sin cambios nuevos al TP en el VPS (C-11)**: se desplegó tal cual quedó en C-10.
- **README.md**: sólo el paso 4 (carga inicial) y el apartado Docker.
- **env.example**: forma de `DATABASE_URL` con `<host>` y `SQL_ECHO=false`, sin valores reales.
