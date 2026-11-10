# Evidencia de pruebas G-01 a G-06

- Ejecutado: 2026-11-10 12:32 (hora local)
- Origen probado: `https://grupo1-chicas-frontend-libreria.ugpvou.easypanel.host` (URL pública HTTPS en Easypanel: frontend Nginx -> proxy `/api/` -> backend FastAPI -> PostgreSQL)
- Datos: ficticios (seed del backend + los creados en estos casos)
- Las respuestas son las devueltas por la API en la ejecución; no están editadas.


## G-01 · Catálogo

**Búsqueda parcial sin distinguir mayúsculas (`titulo=RAY`)**

`GET /libros/?titulo=RAY`

HTTP **200** ✅

```json
[
  "Rayuela"
]
```

**Paginación `limit=2&offset=0`**

`GET /libros/?limit=2&offset=0`

HTTP **200** ✅

```json
[
  {
    "id": 1,
    "titulo": "Rayuela"
  },
  {
    "id": 2,
    "titulo": "Ficciones"
  }
]
```

**Paginación `limit=2&offset=2`**

`GET /libros/?limit=2&offset=2`

HTTP **200** ✅

```json
[
  {
    "id": 3,
    "titulo": "Antología de la literatura fantástica"
  },
  {
    "id": 4,
    "titulo": "Respiración artificial"
  }
]
```

**Paginación `limit=2&offset=4`**

`GET /libros/?limit=2&offset=4`

HTTP **200** ✅

```json
[
  {
    "id": 5,
    "titulo": "Bestiario"
  }
]
```

**Búsqueda sin coincidencias**

`GET /libros/?titulo=zzzzzz`

HTTP **200** ✅

```json
[]
```

**Detalle de un libro con varios autores**

`GET /libros/3`

HTTP **200** ✅

```json
{
  "titulo": "Antología de la literatura fantástica",
  "genero": {
    "id": 2,
    "nombre": "Cuento"
  },
  "autores": [
    [
      "Jorge Luis Borges",
      "autor",
      1
    ],
    [
      "Adolfo Bioy Casares",
      "coautor",
      2
    ],
    [
      "Silvina Ocampo",
      "coautor",
      3
    ]
  ]
}
```


## G-02 · Alta de libro

**Alta con stock, sin género y con dos autorías**

`POST /libros/` con cuerpo `{"titulo": "Libro Global", "isbn": "978-999-00-0001-9", "precio": "12345.50", "stock": 7, "editorial_id": 1, "genero_id": null, "autores": [{"autor_id": 1, "rol": "autor", "orden": 1}, {"autor_id": 2, "rol": "traductor", "orden": 2}]}`

HTTP **201** ✅

```json
{
  "id": 6,
  "isbn": "978-999-00-0001-9",
  "titulo": "Libro Global",
  "precio": "12345.50",
  "stock": 7,
  "editorial": {
    "id": 1,
    "nombre": "Sudamericana",
    "pais": "Argentina"
  },
  "genero": null,
  "autorias": [
    {
      "autor": {
        "id": 1,
        "nombre": "Julio Cortázar",
        "nacionalidad": "Argentina"
      },
      "rol": "autor",
      "orden": 1
    },
    {
      "autor": {
        "id": 2,
        "nombre": "Jorge Luis Borges",
        "nacionalidad": "Argentina"
      },
      "rol": "traductor",
      "orden": 2
    }
  ]
}
```

**Consultar el detalle del libro creado**

`GET /libros/6`

HTTP **200** ✅

```json
{
  "id": 6,
  "isbn": "978-999-00-0001-9",
  "titulo": "Libro Global",
  "precio": "12345.50",
  "stock": 7,
  "editorial": {
    "id": 1,
    "nombre": "Sudamericana",
    "pais": "Argentina"
  },
  "genero": null,
  "autorias": [
    {
      "autor": {
        "id": 1,
        "nombre": "Julio Cortázar",
        "nacionalidad": "Argentina"
      },
      "rol": "autor",
      "orden": 1
    },
    {
      "autor": {
        "id": 2,
        "nombre": "Jorge Luis Borges",
        "nacionalidad": "Argentina"
      },
      "rol": "traductor",
      "orden": 2
    }
  ]
}
```

**Repetir el ISBN**

`POST /libros/` con cuerpo `{"titulo": "Otro", "isbn": "978-999-00-0001-9", "precio": "10", "stock": 1, "editorial_id": 1, "autores": [{"autor_id": 1, "rol": "autor", "orden": 1}]}`

HTTP **409** ✅

```json
{
  "detail": "Ya existe un libro con ese ISBN"
}
```


## G-03 · Alta de cliente

**Alta de cliente**

`POST /clientes/` con cuerpo `{"nombre": "Cliente Global", "email": "global@example.com"}`

HTTP **201** ✅

```json
{
  "id": 4,
  "nombre": "Cliente Global",
  "email": "global@example.com",
  "perfil": null
}
```

**Recuperarlo por ID**

`GET /clientes/4`

HTTP **200** ✅

```json
{
  "id": 4,
  "nombre": "Cliente Global",
  "email": "global@example.com",
  "perfil": null
}
```

**Repetir el email**

`POST /clientes/` con cuerpo `{"nombre": "Otro", "email": "global@example.com"}`

HTTP **409** ✅

```json
{
  "detail": "Ya existe un cliente con ese email"
}
```


## G-04 · Venta con dos renglones

**Registrar la venta**

`POST /ventas/` con cuerpo `{"cliente_id": 4, "renglones": [{"libro_id": 6, "cantidad": 2}, {"libro_id": 2, "cantidad": 1}]}`

HTTP **201** ✅

```json
{
  "id": 2,
  "fecha": "2026-11-10T15:32:45.710857Z",
  "total": "42691.00",
  "cliente": {
    "id": 4,
    "nombre": "Cliente Global",
    "email": "global@example.com"
  },
  "renglones": [
    {
      "libro_id": 2,
      "titulo": "Ficciones",
      "cantidad": 1,
      "precio_unitario": "18000.00",
      "subtotal": "18000.00"
    },
    {
      "libro_id": 6,
      "titulo": "Libro Global",
      "cantidad": 2,
      "precio_unitario": "12345.50",
      "subtotal": "24691.00"
    }
  ]
}
```

**Consultar el detalle (equivale a abrirlo tras recargar la página)**

`GET /ventas/2`

HTTP **200** ✅

```json
{
  "id": 2,
  "fecha": "2026-11-10T15:32:45.710857Z",
  "total": "42691.00",
  "cliente": {
    "id": 4,
    "nombre": "Cliente Global",
    "email": "global@example.com"
  },
  "renglones": [
    {
      "libro_id": 2,
      "titulo": "Ficciones",
      "cantidad": 1,
      "precio_unitario": "18000.00",
      "subtotal": "18000.00"
    },
    {
      "libro_id": 6,
      "titulo": "Libro Global",
      "cantidad": 2,
      "precio_unitario": "12345.50",
      "subtotal": "24691.00"
    }
  ]
}
```

Detalle idéntico a la respuesta del alta: **sí**


## G-05 · Precio histórico

**Cambiar el precio del libro con PATCH**

`PATCH /libros/6` con cuerpo `{"precio": "99999.00"}`

HTTP **200** ✅

```json
{
  "id": 6,
  "titulo": "Libro Global",
  "precio": "99999.00"
}
```

**Detalle de la venta anterior tras el PATCH**

`GET /ventas/2`

HTTP **200** ✅

```json
{
  "id": 2,
  "fecha": "2026-11-10T15:32:45.710857Z",
  "total": "42691.00",
  "cliente": {
    "id": 4,
    "nombre": "Cliente Global",
    "email": "global@example.com"
  },
  "renglones": [
    {
      "libro_id": 2,
      "titulo": "Ficciones",
      "cantidad": 1,
      "precio_unitario": "18000.00",
      "subtotal": "18000.00"
    },
    {
      "libro_id": 6,
      "titulo": "Libro Global",
      "cantidad": 2,
      "precio_unitario": "12345.50",
      "subtotal": "24691.00"
    }
  ]
}
```

Importes de la venta sin cambios: **sí**


## G-06 · Rechazos

**Cliente inexistente**

`POST /ventas/` con cuerpo `{"cliente_id": 999, "renglones": [{"libro_id": 1, "cantidad": 1}]}`

HTTP **409** ✅

```json
{
  "detail": "El cliente indicado no existe"
}
```

**Libro inexistente**

`POST /ventas/` con cuerpo `{"cliente_id": 1, "renglones": [{"libro_id": 999, "cantidad": 1}]}`

HTTP **409** ✅

```json
{
  "detail": "Los libros [999] no existen"
}
```

**Renglones repetidos**

`POST /ventas/` con cuerpo `{"cliente_id": 1, "renglones": [{"libro_id": 1, "cantidad": 1}, {"libro_id": 1, "cantidad": 2}]}`

HTTP **422** ✅

```json
[
  {
    "loc": [
      "body"
    ],
    "msg": "Value error, renglones no puede repetir libro_id"
  }
]
```

Historial antes de los rechazos: [(1, '18000.00'), (2, '42691.00')]  
Historial después de los rechazos: [(1, '18000.00'), (2, '42691.00')]  
Historial sin cambios: **sí**
