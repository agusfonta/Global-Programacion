-- Estado inicial conocido para las pruebas (C-01 a C-08).
-- Requiere las tablas creadas con `alembic upgrade head`.
-- Se puede ejecutar las veces que haga falta: vacía las tablas y vuelve a cargar los datos.
-- Uso: psql -U <usuario> -d libreria -f test/seed.sql

BEGIN;

TRUNCATE renglon_venta, venta, perfil_cliente, cliente, libro_autor, libro, autor, genero, editorial
    RESTART IDENTITY CASCADE;

INSERT INTO editorial (id, nombre, pais) VALUES
    (1, 'Sudamericana', 'Argentina'),
    (2, 'Alfaguara', 'España');

INSERT INTO genero (id, nombre) VALUES
    (1, 'Novela'),
    (2, 'Cuento');

INSERT INTO autor (id, nombre, nacionalidad) VALUES
    (1, 'Julio Cortázar', 'Argentina'),
    (2, 'Jorge Luis Borges', 'Argentina'),
    (3, 'Adolfo Bioy Casares', 'Argentina'),
    (4, 'Silvina Ocampo', 'Argentina'),
    (5, 'Ricardo Piglia', 'Argentina');

INSERT INTO libro (id, isbn, titulo, precio, stock, editorial_id, genero_id) VALUES
    (1, '978-950-00-0001-1', 'Rayuela', 25000.00, 10, 1, 1),
    (2, '978-950-00-0002-2', 'Ficciones', 18000.00, 15, 1, 2),
    (3, '978-950-00-0003-3', 'Antología de la literatura fantástica', 22000.00, 8, 2, 2),
    (4, '978-950-00-0004-4', 'Respiración artificial', 27000.00, 6, 2, 1),
    (5, '978-950-00-0005-5', 'Bestiario', 16000.00, 12, 1, 2);

-- El libro 3 tiene varios autores (para C-07); el resto tiene uno.
INSERT INTO libro_autor (libro_id, autor_id, rol, orden) VALUES
    (1, 1, 'autor', 1),
    (2, 2, 'autor', 1),
    (3, 2, 'autor', 1),
    (3, 3, 'coautor', 2),
    (3, 4, 'coautor', 3),
    (4, 5, 'autor', 1),
    (5, 1, 'autor', 1);

INSERT INTO cliente (id, nombre, email) VALUES
    (1, 'Lucía Fernández', 'lucia@example.com'),
    (2, 'Tomás Ríos', 'tomas@example.com'),
    (3, 'Marta Gómez', 'marta@example.com');

-- El cliente 1 ya tiene perfil (C-03); los clientes 2 y 3 no.
INSERT INTO perfil_cliente (id, cliente_id, telefono, direccion) VALUES
    (1, 1, '11-5555-0001', 'Av. Corrientes 1234');

-- Una venta previa (id 1). Las altas fallidas también consumen ids de la secuencia.
INSERT INTO venta (id, cliente_id, fecha, total) VALUES
    (1, 1, '2026-10-01T15:00:00Z', 18000.00);
INSERT INTO renglon_venta (id, venta_id, libro_id, cantidad, precio_unitario) VALUES
    (1, 1, 2, 1, 18000.00);

-- Las secuencias quedan después de los ids insertados a mano.
SELECT setval(pg_get_serial_sequence('editorial', 'id'), (SELECT MAX(id) FROM editorial));
SELECT setval(pg_get_serial_sequence('genero', 'id'), (SELECT MAX(id) FROM genero));
SELECT setval(pg_get_serial_sequence('autor', 'id'), (SELECT MAX(id) FROM autor));
SELECT setval(pg_get_serial_sequence('libro', 'id'), (SELECT MAX(id) FROM libro));
SELECT setval(pg_get_serial_sequence('cliente', 'id'), (SELECT MAX(id) FROM cliente));
SELECT setval(pg_get_serial_sequence('perfil_cliente', 'id'), (SELECT MAX(id) FROM perfil_cliente));
SELECT setval(pg_get_serial_sequence('venta', 'id'), (SELECT MAX(id) FROM venta));
SELECT setval(pg_get_serial_sequence('renglon_venta', 'id'), (SELECT MAX(id) FROM renglon_venta));

COMMIT;
