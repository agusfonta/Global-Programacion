# Evidencia G-07 · Despliegue y persistencia tras redespliegue

- Ejecutado: 2026-11-10 (hora local de Argentina, UTC-3)
- URL pública: https://libreria.agusfontagnol.me
- Servicios redesplegados desde el panel de Easypanel con el botón **Implementar**: `backend-libreria` y `frontend-libreria`
- Revisión desplegada: commit `cd4c7f3` de la rama `main` (https://github.com/agusfonta/Global-Programacion)
- Datos: ficticios

## 1. La imagen del frontend se construye

El historial de implementaciones de `frontend-libreria` muestra la implementación nueva con resultado
**Success**, fechada `Tue, 10 Nov 2026 16:02:47 GMT` (13:02:47 en Argentina), tomada del commit `cd4c7f3`.
El build usa `frontend/Dockerfile` (base `nginx:1.30-alpine`) con Ruta de compilación `/frontend`.
En `backend-libreria` el historial muestra la implementación nueva con el mismo commit (`cd4c7f3`).
(Evidencia local previa del build en `imagen-frontend-local.md`.)

## 2. La URL pública abre por HTTPS y la API responde 200 en salud

Comprobado tras el redespliegue:

| Petición | Resultado |
|---|---|
| `GET https://libreria.agusfontagnol.me/` | HTTP 200, certificado verificado (Let's Encrypt) |
| `GET https://libreria.agusfontagnol.me/api/health/ready` | HTTP 200, `{"estado":"ok"}` |

La API no dejó de responder durante el redespliegue: se consultó `/api/health/ready` cada ~5 s durante
y después de implementar y siempre dio 200 (Easypanel cambia de contenedor sin cortar el servicio).

## 3. Los datos siguen disponibles

Se tomó una copia de las respuestas de la API **antes** de redesplegar y se comparó con las
respuestas **después** (listados `limit=100` y detalle de cada venta). Resultado:

| Dato | Antes | Después | Iguales |
|---|---|---|---|
| Libros (`GET /api/libros/`) | 8 | 8 | sí |
| Clientes (`GET /api/clientes/`) | 5 | 5 | sí |
| Ventas (`GET /api/ventas/`) | ids 1, 2 y 4 | ids 1, 2 y 4 | sí |
| Detalle de cada venta (renglones e importes) | totales 18000.00, 42691.00 y 42691.00 | idénticos | sí |

Libros presentes tras el redespliegue: Rayuela, Ficciones, Antología de la literatura fantástica,
Respiración artificial, Bestiario, Libro Global, LibroPrueba y Libro Demo Dominio.

Captura de la aplicación después del redespliegue: [G07-tras-redespliegue-1280.png](G07-tras-redespliegue-1280.png).

## Conclusión

La imagen del frontend se construye, la URL pública abre por HTTPS, la API devuelve 200 en salud y
los datos (libros, clientes y ventas con sus importes) siguen idénticos tras redesplegar.
