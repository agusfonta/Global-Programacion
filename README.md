# Librería · Global de Programación III

**Grupo:** Las chicas

**Integrantes:** Agustina Fontagnol, Gianella Peña, Martina Suarez y Yoselie Aquino

Aplicación web de una librería: catálogo, altas de libros y clientes, ventas e historial.
El frontend (HTML, CSS y JavaScript nativos) consume la API FastAPI de la librería y los datos
quedan en PostgreSQL. Se sirve desde un contenedor Nginx que además reenvía `/api/` al backend.

```
frontend/   Interfaz + Dockerfile + plantilla de Nginx (ver frontend/README.md)
backend/    API FastAPI + Dockerfile + migraciones Alembic (ver backend/README.md)
evidencia/  Registros y capturas de los casos G-01 a G-07
DEPLOY.md   URL pública, rutas de build, puertos, variables, migraciones y actualización
```

## Cómo ejecutar la app localmente

Requisitos: Docker. Todos los datos son ficticios.

**1. Base de datos y backend** (red de Docker propia para que los contenedores se vean por nombre):

```bash
docker network create libreria-net
```

```bash
docker run -d --rm --name libreria-pg --network libreria-net -e POSTGRES_PASSWORD=cambiar-esto -e POSTGRES_DB=libreria postgres:16-alpine
```

```bash
docker build -t libreria-backend ./backend
```

```bash
docker run -d --rm --name libreria-api --network libreria-net -e DATABASE_URL=postgresql+asyncpg://postgres:cambiar-esto@libreria-pg:5432/libreria libreria-backend
```

Al arrancar el backend aplica `alembic upgrade head`. Comprobación: dentro del contenedor,
`docker exec libreria-api python -c "from urllib.request import urlopen; print(urlopen('http://127.0.0.1:8000/health/ready').status)"` imprime `200`.

**2. Datos de prueba.** `backend/test/seed.sql` carga 5 libros, 3 clientes y 1 venta ficticios.
**Atención:** empieza con `TRUNCATE ... CASCADE`, así que vacía las tablas. Usalo solo en una
base de pruebas, nunca sobre una base con datos que quieras conservar.

```bash
docker exec -i libreria-pg psql -U postgres -d libreria < backend/test/seed.sql
```

**3. Frontend:**

```bash
docker build -t libreria-frontend ./frontend
```

```bash
docker run -d --rm --name libreria-frontend --network libreria-net -p 127.0.0.1:8080:80 -e API_UPSTREAM=libreria-api:8000 libreria-frontend
```

Abrir <http://127.0.0.1:8080>. `http://127.0.0.1:8080/api/health/ready` debe responder 200.

**Limpiar:** `docker rm -f libreria-frontend libreria-api libreria-pg` y `docker network rm libreria-net`.

## Pruebas del frontend

Requieren Node.js y no tienen dependencias:

```bash
node --test frontend/tests/app.test.js
```

## Evidencia y despliegue

Ver [DEPLOY.md](DEPLOY.md) y la carpeta [evidencia/](evidencia/).
