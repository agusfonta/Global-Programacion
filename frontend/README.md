# Librería Pampa — TPI frontend de una librería

Trabajo práctico integrador de **Programación III** (Tecnicatura Universitaria en Programación a Distancia, UTN): frontend de una librería hecho solo con HTML, CSS y JavaScript nativos (sin librerías, frameworks ni CDNs), conectado a la API REST FastAPI del backend.

## Integrantes

- Gianella Peña
- Agustina Fontagnol
- Martina Suarez
- Yoselie Aquino

## Estructura

```
Dockerfile                  Imagen del frontend (nginx:1.30-alpine)
.dockerignore               Excluye .git, .env*, node_modules y .DS_Store del build
default.conf.template       Servidor estático + proxy de /api/ al backend (sin CORS)
public/                     Única carpeta que se publica en la imagen
  index.html                Página única con las cinco vistas
  css/estilos.css           Estilos propios (identidad visual, layout adaptable, foco, mensajes)
  js/app.js                 Cliente HTTP, validaciones, lógica de ventas y pantalla
  assets/                   Recursos locales (hoy sin imágenes)
tests/app.test.js           Pruebas automáticas de la lógica (Node, fetch simulado)
docs/                       Consigna en PDF y capturas de la etapa 1
```

## Cómo se conecta a la API

El frontend pide todo a `API_BASE = "/api"` (constante en `js/app.js`). Un nginx dentro del contenedor del frontend:

- sirve los archivos estáticos, y
- reenvía `/api/` al backend **quitando el prefijo** (`/api/libros/` llega al backend como `/libros/`).

Como el navegador solo habla con un origen, **el backend no necesita CORS**. La configuración está en `default.conf.template`: la imagen oficial de nginx reemplaza `${API_UPSTREAM}` al arrancar (`NGINX_ENVSUBST_FILTER=^API_UPSTREAM$` en el Dockerfile limita la sustitución a esa variable). Su valor es `host:puerto`, sin `http://` ni barra final (por ejemplo `host.docker.internal:8000` en local o `grupo1_backend:8000` en Easypanel).

Detalles que conviene saber:

- Las rutas del backend llevan **barra final** (`/api/libros/`); el detalle no (`/api/libros/1`). El cliente ya las arma así.
- Si el backend no está levantado, nginx devuelve 502/504: la app lo trata como **error de conexión** y ofrece «Reintentar».
- Al usar la app hace falta un servidor: abrir `public/index.html` con doble clic ya no alcanza, porque `/api` solo existe detrás del nginx (o de cualquier servidor que haga ese mismo proxy).

### Cliente HTTP

`peticion(ruta, opciones)` centraliza `fetch`, parsea el JSON y, ante un error, lanza un `ErrorApi` con `{ status, mensaje, tipo }`:

| Situación | `tipo` | `mensaje` |
| --- | --- | --- |
| `fetch` falla (`TypeError`) o el proxy responde 502/504 | `conexion` | «No se pudo conectar con el servidor…» |
| 409 | `conflicto` | el `detail` de la API (por ejemplo, «Ya existe un cliente con ese email») |
| 404 | `no_encontrado` | el `detail` de la API |
| 422 | `validacion` | `detail` traducido al español por campo (usa `loc` y `type`), un error por renglón |
| Otros (por ejemplo 503) | `otro` | el `detail` o «El servidor respondió con un error (N).» |

Los decimales llegan como string (`"1500.00"`): se pasan por `Number()` solo para formatear.

## Funcionalidades

- **Catálogo (Ej. 1):** `GET /libros/` con `titulo`, `limit=20` y `offset`. La búsqueda se dispara 300 ms después de dejar de escribir (debounce) y al cambiar el filtro se vuelve a la primera página. Botones **Anterior** / **Siguiente** (Siguiente se habilita si llegaron 20 elementos; Anterior si `offset > 0`). Cada ficha muestra título, ISBN, precio, editorial, género («Sin clasificar» si es `null`) y autores, que se piden a `GET /libros/{id}` en paralelo (`Promise.all`); si el pedido de un libro falla, solo ese muestra «No disponible». Las respuestas de búsquedas viejas se descartan (control de secuencia), así no pisan a la última. Estados distintos y anunciados a lectores de pantalla (`role="status"`): cargando, no hay libros, sin coincidencias y error de conexión con **Reintentar**.
- **Alta de libros (Ej. 2):** editoriales y géneros se cargan de `GET /editoriales/` y `GET /generos/` (si fallan, se muestra el error con «Reintentar»); género opcional («Sin género»). Campo **stock** (entero ≥ 0). Los autores se agregan por **ID**: «Verificar» consulta `GET /autores/{id}` y muestra nombre y nacionalidad; recién ahí se habilita «Agregar autor» con su rol (autor, coautor, traductor, ilustrador). La lista muestra los autores en orden, con «Quitar»; el `orden` que se envía es la posición (1..n). No se permiten repetidos y se exige al menos un autor (la API acepta `autores: []`, pero la consigna no).
- **Alta de clientes (Ej. 2):** nombre y email, más el bloque **«Buscar cliente por ID»** (`GET /clientes/{id}`).
- **Validación local:** obligatorios, precio > 0 con hasta 2 decimales, stock entero ≥ 0, formato de email. **No** se valida unicidad (ISBN, email): la decide el servidor y su 409 se muestra tal cual. Con 201 se muestra el registro devuelto y se actualizan tablas, catálogo y selectores; con 409/422 se muestra el mensaje y se conserva lo cargado. Mientras se procesa, el formulario queda deshabilitado y siempre se rehabilita (`finally`).
- **Ventas (Ej. 3):** el borrador vive en memoria (`renglonesVenta`): cliente, libro y cantidad entera positiva, un renglón por libro, cantidades editables y renglones quitables. El total del borrador es **solo estimado**. «Confirmar venta» envía `POST /ventas/` con **solo** `{ cliente_id, renglones: [{ libro_id, cantidad }] }`. Con 201 se muestra el comprobante con precios unitarios, subtotales y total **tal como los devolvió la API** (no se recalculan), se limpia el borrador y se refresca el historial. Con 409/422/error de red se muestra el mensaje y el borrador se conserva.
- **Historial (Ej. 3):** `GET /ventas/?limit=20&offset=N` con Anterior/Siguiente. El backend ordena por **id ascendente** (las más antiguas primero; las nuevas aparecen en la última página): está indicado en pantalla. «Ver detalle» pide `GET /ventas/{id}` (fecha, cliente, renglones e importes de la API), así que funciona igual después de recargar la página. Tiene estados de carga, vacío y error.

### Decisiones

- **Autores y clientes por ID:** aunque la API tiene `GET /autores/` y `GET /clientes/` (listados), se eligió la **consulta por ID** para los autores y para el bloque de búsqueda de clientes: es lo que pide la consigna y evita cargar listados enteros. El selector de clientes de **Ventas** sí usa el listado (`GET /clientes/?limit=100`).
- **Tablas de libros y clientes:** se llenan con `GET /libros/?limit=100` y `GET /clientes/?limit=100` (no con lo creado en la sesión), así lo que se ve siempre coincide con el servidor. Los mismos datos alimentan los selectores de ventas, y se recargan después de cada alta. Se agregó una columna **ID** (se necesita para consultar y vender) y la tabla de libros muestra **Stock** en lugar de Autores, porque los autores exigirían un pedido por fila.
- **Detalle de ventas** y comprobante usan el mismo renderizado, alimentado siempre con la respuesta de la API.
- **Sin persistencia local:** se eliminaron `localStorage`, los datos semilla, la generación de ids, las ventas locales y las comprobaciones de unicidad locales; la única fuente de verdad es la API.

### Límites conocidos

- **La búsqueda por título distingue tildes** («Cortazar» no encuentra «Cortázar»); la API compara con `ILIKE`. Es parcial y no distingue mayúsculas. Hay un aviso en pantalla.
- **La API no devuelve total**: la paginación solo sabe si hay otra página porque llegaron exactamente 20 elementos. Si el total es múltiplo de 20, la última página «siguiente» llega vacía y se muestra un aviso.
- **El historial es ascendente**: no hay forma de pedirlo descendente.
- **Límite de 100** en tablas y selectores (editoriales, géneros, libros y clientes): si hay más, solo se ven los primeros 100 por id; se muestra un aviso para libros y clientes. Con más de 100 clientes, los posteriores no se pueden elegir al vender.
- **La API no valida stock ni aplica descuentos** en la venta: el total es la suma de subtotales.
- El catálogo hace 1 pedido de lista + 1 por libro (hasta 20) para traer los autores.
- La lógica y los pedidos se prueban en Node con un `fetch` simulado; la capa de pantalla (DOM) no tiene pruebas automáticas.

## Imagen Docker y prueba local

Con el backend corriendo en el puerto 8000 y Docker iniciado, desde `frontend/`:

```bash
docker build -t libreria-frontend .
```

```bash
docker run --rm --name libreria-frontend -p 127.0.0.1:8080:80 --add-host=host.docker.internal:host-gateway -e API_UPSTREAM=host.docker.internal:8000 libreria-frontend
```

(En Docker Desktop se puede omitir `--add-host`.) Abrir <http://127.0.0.1:8080> y comprobar que <http://127.0.0.1:8080/api/health/ready> responde 200. Cortar con Ctrl+C.

## Pruebas

Requieren Node.js (no hay `package.json` ni dependencias):

```bash
node --test tests/app.test.js
node --check public/js/app.js
```

Las pruebas usan un `fetch` simulado que se inyecta en `peticion(ruta, { fetch })`. Cubren el cliente HTTP y el mapeo de errores 422, la paginación, el debounce, el control de carreras, el catálogo con autores tolerante a fallos, las validaciones y cuerpos de los altas, el borrador de venta, la confirmación (que conserva el borrador si falla) y que ya no queda código local obsoleto.

## Verificación manual

Se probó en el navegador integrado de la aplicación de escritorio de Claude (Chromium) contra un **servidor de prueba (stub) con datos ficticios** que imitaba el contrato de la API, **no contra el backend real ni dentro del contenedor con nginx**. Se comprobó: catálogo con paginación, búsqueda con descarte de respuestas viejas, libro sin autores y con fallo individual de autores («No disponible»), error de conexión con «Reintentar», altas de libro y cliente (201, 409 y validación local), verificación de autores, borrador de venta y confirmación (también con el servidor caído, conservando el borrador), historial, detalle tras recargar y ausencia de desborde horizontal a 320 px. Pendiente de probar con el backend real y nginx.

## Imágenes y recursos ajenos

El proyecto no usa imágenes ni recursos de terceros. Los íconos de los mensajes (✔, ✖, ↻, ℹ) son caracteres Unicode generados con CSS.
