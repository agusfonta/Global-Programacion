# Evidencia de construcción y arranque de la imagen del frontend (parcial de G-07)

- Ejecutado: 2026-11-10 11:52
- Solo cubre el entorno LOCAL. El despliegue en Easypanel y el redespliegue no están registrados acá.

## docker build
```
#1 [internal] load build definition from Dockerfile
#1 DONE 0.0s
#2 [auth] library/nginx:pull token for registry-1.docker.io
#2 DONE 0.0s
#3 [internal] load metadata for docker.io/library/nginx:1.30-alpine
#3 DONE 1.3s
#4 [internal] load .dockerignore
#4 DONE 0.0s
#5 [internal] load build context
#5 DONE 0.0s
#6 [1/3] FROM docker.io/library/nginx:1.30-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311
#7 [2/3] COPY public/ /usr/share/nginx/html/
#7 DONE 0.0s
#8 [3/3] COPY default.conf.template /etc/nginx/templates/default.conf.template
#8 DONE 0.1s
#9 naming to docker.io/library/libreria-frontend:latest
#9 naming to docker.io/library/libreria-frontend:latest done
#9 DONE 0.4s
```

## Salud y estáticos a través del contenedor (http://127.0.0.1:8080)
```
/ -> HTTP 200
/api/health/live -> HTTP 200
/api/health/ready -> HTTP 200
/api/libros/?limit=1 -> HTTP 200
```
