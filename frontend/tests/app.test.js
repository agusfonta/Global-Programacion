const test = require("node:test");
const assert = require("node:assert");

const app = require("../public/js/app.js");

// ---------------------------------------------------------------------------
// Utilidades de prueba: fetch simulado inyectable (sin librerías)
// ---------------------------------------------------------------------------

function respuesta(status, cuerpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (cuerpo === undefined) {
        throw new SyntaxError("Unexpected end of JSON input");
      }
      return cuerpo;
    },
  };
}

// `manejador` recibe (url, init) y devuelve una respuesta (o lanza). Registra las llamadas.
function crearFetchSimulado(manejador) {
  const llamadas = [];
  const simulado = async (url, init = {}) => {
    llamadas.push({ url, init });
    return manejador(url, init);
  };
  simulado.llamadas = llamadas;
  return simulado;
}

async function capturarError(promesa) {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba que la promesa fuera rechazada");
  return null;
}

// ---------------------------------------------------------------------------
// Utilidades que se conservan
// ---------------------------------------------------------------------------

test("el módulo se carga en Node sin errores", () => {
  assert.strictEqual(typeof app.inicializar, "function");
});

test("formatearPrecio formatea miles con punto y decimales con coma", () => {
  assert.strictEqual(app.formatearPrecio(1500), "$ 1.500,00");
  assert.strictEqual(app.formatearPrecio(3000), "$ 3.000,00");
});

test("formatearPrecio acepta los decimales que la API devuelve como string", () => {
  assert.strictEqual(app.formatearPrecio("1500.00"), "$ 1.500,00");
  assert.strictEqual(app.formatearPrecio("950.5"), "$ 950,50");
});

test("emailValido acepta un email correcto y rechaza formatos inválidos", () => {
  assert.strictEqual(app.emailValido("ana.gomez@example.com"), true);
  assert.strictEqual(app.emailValido("  ANA@Example.com "), true);
  assert.strictEqual(app.emailValido("sin-arroba"), false);
  assert.strictEqual(app.emailValido("a@b"), false);
  assert.strictEqual(app.emailValido("@"), false);
  assert.strictEqual(app.emailValido(""), false);
});

// ---------------------------------------------------------------------------
// Ejercicio 1: cliente HTTP centralizado
// ---------------------------------------------------------------------------

test("API_BASE es el prefijo /api que resuelve nginx", () => {
  assert.strictEqual(app.API_BASE, "/api");
});

test("construirQuery arma los parámetros y omite los vacíos", () => {
  assert.strictEqual(app.construirQuery({ titulo: "rayuela", limit: 20, offset: 0 }), "titulo=rayuela&limit=20&offset=0");
  assert.strictEqual(app.construirQuery({ titulo: "", limit: 20, offset: 40 }), "limit=20&offset=40");
  assert.strictEqual(app.construirQuery({ titulo: "   ", limit: 20 }), "limit=20");
  assert.strictEqual(app.construirQuery({}), "");
});

test("construirQuery codifica espacios, tildes y caracteres reservados", () => {
  const consulta = app.construirQuery({ titulo: "Cortázar & Co" });
  assert.strictEqual(new URLSearchParams(consulta).get("titulo"), "Cortázar & Co");
  assert.ok(!consulta.includes("& Co"));
});

test("peticion hace GET sobre API_BASE y devuelve el JSON parseado", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(200, [{ id: 1 }]));
  const datos = await app.peticion("/libros/?limit=20", { fetch: fetchSimulado });
  assert.deepStrictEqual(datos, [{ id: 1 }]);
  assert.strictEqual(fetchSimulado.llamadas[0].url, "/api/libros/?limit=20");
  assert.ok(!fetchSimulado.llamadas[0].init.method || fetchSimulado.llamadas[0].init.method === "GET");
});

test("peticion con cuerpo envía POST con JSON y devuelve el 201", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(201, { id: 7, nombre: "Ana" }));
  const datos = await app.peticion("/clientes/", {
    fetch: fetchSimulado,
    metodo: "POST",
    cuerpo: { nombre: "Ana", email: "ana@example.com" },
  });
  assert.deepStrictEqual(datos, { id: 7, nombre: "Ana" });
  const { url, init } = fetchSimulado.llamadas[0];
  assert.strictEqual(url, "/api/clientes/");
  assert.strictEqual(init.method, "POST");
  assert.strictEqual(init.headers["Content-Type"], "application/json");
  assert.deepStrictEqual(JSON.parse(init.body), { nombre: "Ana", email: "ana@example.com" });
});

test("peticion normaliza el error de conexión (fetch rechaza con TypeError)", async () => {
  const fetchSimulado = crearFetchSimulado(() => {
    throw new TypeError("Failed to fetch");
  });
  const error = await capturarError(app.peticion("/libros/", { fetch: fetchSimulado }));
  assert.strictEqual(error.tipo, "conexion");
  assert.strictEqual(error.status, 0);
  assert.match(error.mensaje, /conectar/i);
});

test("peticion normaliza 409 y 404 usando el detail de texto", async () => {
  const conflicto = crearFetchSimulado(() => respuesta(409, { detail: "Ya existe un cliente con ese email" }));
  const errorConflicto = await capturarError(app.peticion("/clientes/", { fetch: conflicto, metodo: "POST", cuerpo: {} }));
  assert.deepStrictEqual(
    { status: errorConflicto.status, tipo: errorConflicto.tipo, mensaje: errorConflicto.mensaje },
    { status: 409, tipo: "conflicto", mensaje: "Ya existe un cliente con ese email" }
  );

  const noEncontrado = crearFetchSimulado(() => respuesta(404, { detail: "Autor no encontrado" }));
  const errorNoEncontrado = await capturarError(app.peticion("/autores/99", { fetch: noEncontrado }));
  assert.deepStrictEqual(
    { status: errorNoEncontrado.status, tipo: errorNoEncontrado.tipo, mensaje: errorNoEncontrado.mensaje },
    { status: 404, tipo: "no_encontrado", mensaje: "Autor no encontrado" }
  );
});

test("peticion normaliza 422 mapeando el array de detail a mensajes en español", async () => {
  const detail = [
    { type: "greater_than", loc: ["body", "precio"], msg: "Input should be greater than 0", input: -1, ctx: { gt: 0 } },
    { type: "missing", loc: ["body", "titulo"], msg: "Field required", input: {} },
  ];
  const fetchSimulado = crearFetchSimulado(() => respuesta(422, { detail }));
  const error = await capturarError(app.peticion("/libros/", { fetch: fetchSimulado, metodo: "POST", cuerpo: {} }));
  assert.strictEqual(error.status, 422);
  assert.strictEqual(error.tipo, "validacion");
  assert.strictEqual(error.mensaje, "Precio: debe ser mayor que 0.\nTítulo: es obligatorio.");
});

test("peticion trata 503 como otro error y usa su detail", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(503, { detail: "Base de datos no disponible" }));
  const error = await capturarError(app.peticion("/libros/", { fetch: fetchSimulado }));
  assert.strictEqual(error.tipo, "otro");
  assert.strictEqual(error.status, 503);
  assert.strictEqual(error.mensaje, "Base de datos no disponible");
});

test("peticion tolera cuerpos que no son JSON: 500 es otro error y 502/504 (proxy) es de conexión", async () => {
  const interno = crearFetchSimulado(() => respuesta(500, undefined));
  const errorInterno = await capturarError(app.peticion("/libros/", { fetch: interno }));
  assert.strictEqual(errorInterno.tipo, "otro");
  assert.strictEqual(errorInterno.status, 500);
  assert.match(errorInterno.mensaje, /500/);

  for (const status of [502, 504]) {
    const proxy = crearFetchSimulado(() => respuesta(status, undefined));
    const errorProxy = await capturarError(app.peticion("/libros/", { fetch: proxy }));
    assert.strictEqual(errorProxy.tipo, "conexion");
    assert.strictEqual(errorProxy.status, status);
  }
});

// ---------------------------------------------------------------------------
// Ejercicio 1: mapeo de errores 422
// ---------------------------------------------------------------------------

test("mensajeValidacion422 traduce por tipo y campo usando loc", () => {
  const mensaje = app.mensajeValidacion422([
    { type: "missing", loc: ["body", "isbn"], msg: "Field required" },
    { type: "greater_than_equal", loc: ["body", "stock"], msg: "...", ctx: { ge: 0 } },
    { type: "string_too_short", loc: ["body", "nombre"], msg: "...", ctx: { min_length: 1 } },
  ]);
  assert.strictEqual(
    mensaje,
    "ISBN: es obligatorio.\nStock: debe ser mayor o igual que 0.\nNombre: es demasiado corto."
  );
});

test("mensajeValidacion422 indica el ítem cuando loc trae un índice", () => {
  const mensaje = app.mensajeValidacion422([
    { type: "greater_than_equal", loc: ["body", "renglones", 1, "cantidad"], msg: "...", ctx: { ge: 1 } },
  ]);
  assert.strictEqual(mensaje, "Cantidad (ítem 2): debe ser mayor o igual que 1.");
});

test("mensajeValidacion422 tiene respaldo para tipos y campos desconocidos y para detail inválido", () => {
  assert.strictEqual(
    app.mensajeValidacion422([{ type: "algo_raro", loc: ["body", "campo_nuevo"], msg: "boom" }]),
    "campo_nuevo: valor inválido."
  );
  assert.strictEqual(app.mensajeValidacion422([]), "Los datos enviados no son válidos.");
  assert.strictEqual(app.mensajeValidacion422("texto suelto"), "texto suelto");
});

// ---------------------------------------------------------------------------
// Ejercicio 1: paginación, estados, debounce y condiciones de carrera
// ---------------------------------------------------------------------------

test("calcularPaginacion habilita Siguiente solo si llegaron `limit` elementos", () => {
  assert.deepStrictEqual(app.calcularPaginacion(0, 20, 20), {
    hayAnterior: false,
    haySiguiente: true,
    offsetAnterior: 0,
    offsetSiguiente: 20,
  });
  assert.strictEqual(app.calcularPaginacion(0, 20, 7).haySiguiente, false);
  assert.strictEqual(app.calcularPaginacion(0, 20, 0).haySiguiente, false);
});

test("calcularPaginacion habilita Anterior si offset > 0 y nunca baja de cero", () => {
  const medio = app.calcularPaginacion(40, 20, 20);
  assert.strictEqual(medio.hayAnterior, true);
  assert.strictEqual(medio.offsetAnterior, 20);
  assert.strictEqual(medio.offsetSiguiente, 60);

  const desalineado = app.calcularPaginacion(5, 20, 3);
  assert.strictEqual(desalineado.hayAnterior, true);
  assert.strictEqual(desalineado.offsetAnterior, 0);
  assert.strictEqual(desalineado.haySiguiente, false);
});

test("estadoLista distingue cargando, error, vacío, sin coincidencias y lista", () => {
  assert.strictEqual(app.estadoLista({ cargando: true, error: null, cantidad: 0, hayFiltro: false }), "cargando");
  assert.strictEqual(app.estadoLista({ cargando: false, error: { tipo: "conexion" }, cantidad: 0, hayFiltro: true }), "error");
  assert.strictEqual(app.estadoLista({ cargando: false, error: null, cantidad: 0, hayFiltro: false }), "vacio");
  assert.strictEqual(app.estadoLista({ cargando: false, error: null, cantidad: 0, hayFiltro: true }), "sin-coincidencias");
  assert.strictEqual(app.estadoLista({ cargando: false, error: null, cantidad: 3, hayFiltro: true }), "lista");
});

test("estadoLista: una página vacía con offset > 0 no se considera lista vacía de la colección", () => {
  assert.strictEqual(app.estadoLista({ cargando: false, error: null, cantidad: 0, hayFiltro: false, offset: 20 }), "fin");
  assert.strictEqual(app.estadoLista({ cargando: false, error: null, cantidad: 0, hayFiltro: true, offset: 20 }), "fin");
});

test("crearControlSecuencia solo considera vigente a la última operación iniciada", () => {
  const control = app.crearControlSecuencia();
  const primera = control.iniciar();
  assert.strictEqual(control.esVigente(primera), true);
  const segunda = control.iniciar();
  assert.strictEqual(control.esVigente(primera), false);
  assert.strictEqual(control.esVigente(segunda), true);
  const tercera = control.iniciar();
  assert.strictEqual(control.esVigente(segunda), false);
  assert.strictEqual(control.esVigente(tercera), true);
});

test("debounce ejecuta una sola vez con los últimos argumentos tras la espera", () => {
  const pendientes = [];
  let cancelados = 0;
  const temporizador = {
    setTimeout: (fn, ms) => {
      pendientes.push({ fn, ms });
      return pendientes.length;
    },
    clearTimeout: () => {
      cancelados += 1;
    },
  };
  const llamadas = [];
  const diferida = app.debounce((valor) => llamadas.push(valor), 300, temporizador);

  diferida("r");
  diferida("ra");
  diferida("ray");
  assert.deepStrictEqual(llamadas, []);
  assert.strictEqual(cancelados, 2);
  assert.strictEqual(pendientes[2].ms, 300);

  pendientes[2].fn();
  assert.deepStrictEqual(llamadas, ["ray"]);
});

test("debounce vuelve a disparar en una tanda posterior", () => {
  const pendientes = [];
  const temporizador = {
    setTimeout: (fn) => pendientes.push(fn),
    clearTimeout: () => {},
  };
  const llamadas = [];
  const diferida = app.debounce((valor) => llamadas.push(valor), 300, temporizador);
  diferida("a");
  pendientes[0]();
  diferida("b");
  pendientes[1]();
  assert.deepStrictEqual(llamadas, ["a", "b"]);
});

// ---------------------------------------------------------------------------
// Ejercicio 1: catálogo (libros + autores)
// ---------------------------------------------------------------------------

function libroDeLista(id, extra = {}) {
  return {
    id,
    isbn: `97800000000${id}`,
    titulo: `Libro ${id}`,
    precio: "1500.00",
    stock: 3,
    editorial: { id: 1, nombre: "Editorial Ficticia", pais: "Argentina" },
    genero: null,
    ...extra,
  };
}

test("obtenerLibros pide /libros/ con titulo, limit y offset y devuelve el array", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(200, [libroDeLista(1)]));
  const libros = await app.obtenerLibros({ titulo: "ray", limit: 20, offset: 40 }, fetchSimulado);
  assert.strictEqual(libros.length, 1);
  assert.strictEqual(fetchSimulado.llamadas[0].url, "/api/libros/?titulo=ray&limit=20&offset=40");
});

test("obtenerLibros ignora un título vacío", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(200, []));
  await app.obtenerLibros({ titulo: "", limit: 20, offset: 0 }, fetchSimulado);
  assert.strictEqual(fetchSimulado.llamadas[0].url, "/api/libros/?limit=20&offset=0");
});

test("enriquecerConAutores agrega los autores ordenados por `orden`", async () => {
  const fetchSimulado = crearFetchSimulado((url) => {
    assert.strictEqual(url, "/api/libros/1");
    return respuesta(200, {
      ...libroDeLista(1),
      autorias: [
        { autor: { id: 2, nombre: "Segundo Autor", nacionalidad: "Chile" }, rol: "coautor", orden: 2 },
        { autor: { id: 1, nombre: "Primera Autora", nacionalidad: "Argentina" }, rol: "autor", orden: 1 },
      ],
    });
  });
  const [libro] = await app.enriquecerConAutores([libroDeLista(1)], fetchSimulado);
  assert.deepStrictEqual(libro.autores.map((a) => a.nombre), ["Primera Autora", "Segundo Autor"]);
  assert.strictEqual(libro.titulo, "Libro 1");
});

test("enriquecerConAutores tolera fallos individuales: ese libro queda con autores null", async () => {
  const fetchSimulado = crearFetchSimulado((url) => {
    if (url.endsWith("/2")) {
      return respuesta(404, { detail: "Libro no encontrado" });
    }
    if (url.endsWith("/3")) {
      throw new TypeError("Failed to fetch");
    }
    const id = Number(url.split("/").pop());
    return respuesta(200, {
      ...libroDeLista(id),
      autorias: [{ autor: { id: 9, nombre: "Autora Ficticia", nacionalidad: "Uruguay" }, rol: "autor", orden: 1 }],
    });
  });
  const resultado = await app.enriquecerConAutores([libroDeLista(1), libroDeLista(2), libroDeLista(3)], fetchSimulado);
  assert.strictEqual(resultado.length, 3);
  assert.strictEqual(resultado[0].autores.length, 1);
  assert.strictEqual(resultado[1].autores, null);
  assert.strictEqual(resultado[2].autores, null);
  assert.strictEqual(resultado[1].titulo, "Libro 2");
});

test("enriquecerConAutores con lista vacía no hace pedidos", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(200, {}));
  assert.deepStrictEqual(await app.enriquecerConAutores([], fetchSimulado), []);
  assert.strictEqual(fetchSimulado.llamadas.length, 0);
});

test("textoAutores une nombres, y muestra «No disponible» si no se pudieron cargar", () => {
  assert.strictEqual(app.textoAutores([{ nombre: "A" }, { nombre: "B" }]), "A, B");
  assert.strictEqual(app.textoAutores([{ nombre: "Solo" }]), "Solo");
  assert.strictEqual(app.textoAutores(null), "No disponible");
  assert.strictEqual(app.textoAutores([]), "Sin autores");
});

test("textoGenero muestra «Sin clasificar» cuando el género es null", () => {
  assert.strictEqual(app.textoGenero(null), "Sin clasificar");
  assert.strictEqual(app.textoGenero(undefined), "Sin clasificar");
  assert.strictEqual(app.textoGenero({ id: 1, nombre: "Novela" }), "Novela");
});

test("construirVistaFicha usa los datos de la API: editorial, género, precio string y autores", () => {
  const vista = app.construirVistaFicha({
    ...libroDeLista(5, { precio: "2500.50", genero: { id: 2, nombre: "Cuento" } }),
    autores: [{ nombre: "Autora Ficticia" }],
  });
  assert.deepStrictEqual(vista, {
    id: 5,
    titulo: "Libro 5",
    isbn: "978000000005",
    editorial: "Editorial Ficticia",
    genero: "Cuento",
    autores: "Autora Ficticia",
    precio: "$ 2.500,50",
  });

  const sinDatos = app.construirVistaFicha({ ...libroDeLista(6), autores: null });
  assert.strictEqual(sinDatos.genero, "Sin clasificar");
  assert.strictEqual(sinDatos.autores, "No disponible");
});

// ---------------------------------------------------------------------------
// Ejercicio 2: validación y armado de cuerpos (altas de libros y clientes)
// ---------------------------------------------------------------------------

test("parsearId acepta solo enteros positivos y devuelve el número", () => {
  assert.strictEqual(app.parsearId("5"), 5);
  assert.strictEqual(app.parsearId("  12 "), 12);
  for (const invalido of ["", "0", "-3", "1.5", "abc", "1e3", " "]) {
    assert.strictEqual(app.parsearId(invalido), null, `«${invalido}» no es un ID válido`);
  }
});

test("ROLES_AUTOR contiene los cuatro roles del contrato", () => {
  assert.deepStrictEqual(app.ROLES_AUTOR, ["autor", "coautor", "traductor", "ilustrador"]);
});

const autorA = { id: 1, nombre: "Autora Ficticia", nacionalidad: "Argentina" };
const autorB = { id: 2, nombre: "Otro Autor", nacionalidad: "Chile" };

test("agregarAutor suma el autor con su rol y conserva el orden de inserción", () => {
  const paso1 = app.agregarAutor([], autorA, "autor");
  assert.strictEqual(paso1.error, null);
  assert.deepStrictEqual(paso1.lista, [{ autorId: 1, nombre: "Autora Ficticia", nacionalidad: "Argentina", rol: "autor" }]);

  const paso2 = app.agregarAutor(paso1.lista, autorB, "traductor");
  assert.deepStrictEqual(paso2.lista.map((a) => [a.autorId, a.rol]), [[1, "autor"], [2, "traductor"]]);
  assert.strictEqual(paso1.lista.length, 1, "no muta la lista original");
});

test("agregarAutor rechaza repetidos, roles inválidos y autor sin verificar sin modificar la lista", () => {
  const { lista } = app.agregarAutor([], autorA, "autor");
  const repetido = app.agregarAutor(lista, { ...autorA, nombre: "Mismo ID" }, "coautor");
  assert.match(repetido.error, /ya está/i);
  assert.strictEqual(repetido.lista.length, 1);

  const rolInvalido = app.agregarAutor(lista, autorB, "editor");
  assert.match(rolInvalido.error, /rol/i);
  assert.strictEqual(rolInvalido.lista.length, 1);

  const sinVerificar = app.agregarAutor(lista, null, "autor");
  assert.match(sinVerificar.error, /verific/i);
});

test("quitarAutor elimina por id y deja la lista intacta si el id no está", () => {
  let lista = app.agregarAutor([], autorA, "autor").lista;
  lista = app.agregarAutor(lista, autorB, "coautor").lista;
  const restante = app.quitarAutor(lista, 1);
  assert.deepStrictEqual(restante.map((a) => a.autorId), [2]);
  assert.strictEqual(app.quitarAutor(lista, 99).length, 2);
  assert.deepStrictEqual(app.quitarAutor(restante, 2), []);
});

function datosLibroValidos(extra = {}) {
  return {
    titulo: "Libro de Prueba",
    isbn: "9780000000099",
    precio: "1500.50",
    stock: "10",
    editorialId: "1",
    generoId: "",
    autores: [{ autorId: 1, nombre: "Autora Ficticia", nacionalidad: "Argentina", rol: "autor" }],
    ...extra,
  };
}

test("validarLibro acepta datos válidos (género opcional) devolviendo []", () => {
  assert.deepStrictEqual(app.validarLibro(datosLibroValidos()), []);
  assert.deepStrictEqual(app.validarLibro(datosLibroValidos({ generoId: "3", precio: "10", stock: "0" })), []);
});

test("validarLibro exige título e ISBN no vacíos", () => {
  assert.match(app.validarLibro(datosLibroValidos({ titulo: "   " })).join("|"), /título es obligatorio/i);
  assert.match(app.validarLibro(datosLibroValidos({ isbn: "" })).join("|"), /isbn es obligatorio/i);
});

test("validarLibro exige precio mayor que 0 con hasta 2 decimales", () => {
  for (const precio of ["", "0", "-5", "abc", "10.999", "0.00"]) {
    assert.match(app.validarLibro(datosLibroValidos({ precio })).join("|"), /precio/i, `precio «${precio}»`);
  }
  for (const precio of ["0.01", "10", "10.5", "10.50"]) {
    assert.deepStrictEqual(app.validarLibro(datosLibroValidos({ precio })), [], `precio «${precio}»`);
  }
});

test("validarLibro exige stock entero mayor o igual a 0", () => {
  for (const stock of ["", "-1", "1.5", "abc"]) {
    assert.match(app.validarLibro(datosLibroValidos({ stock })).join("|"), /stock/i, `stock «${stock}»`);
  }
  for (const stock of ["0", "7"]) {
    assert.deepStrictEqual(app.validarLibro(datosLibroValidos({ stock })), []);
  }
});

test("validarLibro exige editorial y al menos un autor, y rechaza autores repetidos", () => {
  assert.match(app.validarLibro(datosLibroValidos({ editorialId: "" })).join("|"), /editorial/i);
  assert.match(app.validarLibro(datosLibroValidos({ autores: [] })).join("|"), /al menos un autor/i);
  const autor = { autorId: 1, nombre: "X", nacionalidad: "Y", rol: "autor" };
  assert.match(app.validarLibro(datosLibroValidos({ autores: [autor, autor] })).join("|"), /repetid/i);
});

test("validarLibro acumula todos los errores y NO valida unicidad (la decide el servidor)", () => {
  const errores = app.validarLibro(datosLibroValidos({ titulo: "", precio: "0", stock: "-1", autores: [] }));
  assert.strictEqual(errores.length, 4);
  assert.deepStrictEqual(app.validarLibro(datosLibroValidos({ isbn: "9780000000011" })), []);
});

test("construirCuerpoLibro arma snake_case con ids numéricos, orden por posición y género null", () => {
  const cuerpo = app.construirCuerpoLibro(
    datosLibroValidos({
      titulo: "  Libro de Prueba ",
      isbn: " 9780000000099 ",
      autores: [
        { autorId: 4, nombre: "A", nacionalidad: "X", rol: "autor" },
        { autorId: 7, nombre: "B", nacionalidad: "Y", rol: "traductor" },
      ],
    })
  );
  assert.deepStrictEqual(cuerpo, {
    isbn: "9780000000099",
    titulo: "Libro de Prueba",
    precio: 1500.5,
    stock: 10,
    editorial_id: 1,
    genero_id: null,
    autores: [
      { autor_id: 4, rol: "autor", orden: 1 },
      { autor_id: 7, rol: "traductor", orden: 2 },
    ],
  });
});

test("construirCuerpoLibro envía genero_id numérico cuando se eligió uno", () => {
  const cuerpo = app.construirCuerpoLibro(datosLibroValidos({ generoId: "3", stock: "0" }));
  assert.strictEqual(cuerpo.genero_id, 3);
  assert.strictEqual(cuerpo.stock, 0);
  assert.strictEqual(typeof cuerpo.editorial_id, "number");
});

test("validarCliente exige nombre y email con formato válido, sin chequear unicidad", () => {
  assert.deepStrictEqual(app.validarCliente({ nombre: "Ana Gómez", email: "ana@example.com" }), []);
  assert.match(app.validarCliente({ nombre: "  ", email: "ana@example.com" }).join("|"), /nombre es obligatorio/i);
  assert.match(app.validarCliente({ nombre: "Ana", email: "" }).join("|"), /email es obligatorio/i);
  assert.match(app.validarCliente({ nombre: "Ana", email: "sin-arroba" }).join("|"), /formato/i);
  assert.strictEqual(app.validarCliente({ nombre: "", email: "x" }).length, 2);
});

test("construirCuerpoCliente recorta espacios y usa nombre/email", () => {
  assert.deepStrictEqual(app.construirCuerpoCliente({ nombre: "  Ana Gómez ", email: " ana@example.com " }), {
    nombre: "Ana Gómez",
    email: "ana@example.com",
  });
});

// ---------------------------------------------------------------------------
// Ejercicio 2: llamadas a la API (selectores, verificación, altas)
// ---------------------------------------------------------------------------

test("obtenerEditoriales y obtenerGeneros piden limit=100 (el default de la API es 20)", async () => {
  const fetchSimulado = crearFetchSimulado((url) =>
    url.startsWith("/api/editoriales/") ? respuesta(200, [{ id: 1, nombre: "E", pais: "AR" }]) : respuesta(200, [{ id: 2, nombre: "G" }])
  );
  assert.deepStrictEqual(await app.obtenerEditoriales(fetchSimulado), [{ id: 1, nombre: "E", pais: "AR" }]);
  assert.deepStrictEqual(await app.obtenerGeneros(fetchSimulado), [{ id: 2, nombre: "G" }]);
  assert.deepStrictEqual(fetchSimulado.llamadas.map((l) => l.url), [
    "/api/editoriales/?limit=100",
    "/api/generos/?limit=100",
  ]);
});

test("buscarAutor y buscarCliente consultan por ID y propagan el 404 normalizado", async () => {
  const fetchSimulado = crearFetchSimulado((url) =>
    url.endsWith("/1")
      ? respuesta(200, { id: 1, nombre: "Autora Ficticia", nacionalidad: "Argentina" })
      : respuesta(404, { detail: url.includes("autores") ? "Autor no encontrado" : "Cliente no encontrado" })
  );
  assert.strictEqual((await app.buscarAutor(1, fetchSimulado)).nombre, "Autora Ficticia");
  const errorAutor = await capturarError(app.buscarAutor(99, fetchSimulado));
  assert.strictEqual(errorAutor.mensaje, "Autor no encontrado");
  const errorCliente = await capturarError(app.buscarCliente(99, fetchSimulado));
  assert.strictEqual(errorCliente.tipo, "no_encontrado");
  assert.strictEqual(errorCliente.mensaje, "Cliente no encontrado");
  assert.strictEqual(fetchSimulado.llamadas[0].url, "/api/autores/1");
});

test("registrarLibro hace POST /libros/ con el cuerpo en snake_case", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(201, { id: 9, titulo: "Libro de Prueba" }));
  const cuerpo = app.construirCuerpoLibro(datosLibroValidos());
  const creado = await app.registrarLibro(cuerpo, fetchSimulado);
  assert.strictEqual(creado.id, 9);
  const { url, init } = fetchSimulado.llamadas[0];
  assert.strictEqual(url, "/api/libros/");
  assert.strictEqual(init.method, "POST");
  assert.deepStrictEqual(JSON.parse(init.body), cuerpo);
});

test("registrarLibro propaga el 409 de ISBN duplicado con el mensaje del servidor", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(409, { detail: "Ya existe un libro con ese ISBN" }));
  const error = await capturarError(app.registrarLibro(app.construirCuerpoLibro(datosLibroValidos()), fetchSimulado));
  assert.strictEqual(error.tipo, "conflicto");
  assert.strictEqual(error.mensaje, "Ya existe un libro con ese ISBN");
});

test("registrarCliente hace POST /clientes/ y propaga el 409 de email duplicado", async () => {
  const ok = crearFetchSimulado(() => respuesta(201, { id: 3, nombre: "Ana", email: "ana@example.com", perfil: null }));
  const creado = await app.registrarCliente({ nombre: "Ana", email: "ana@example.com" }, ok);
  assert.strictEqual(creado.id, 3);
  assert.strictEqual(ok.llamadas[0].url, "/api/clientes/");
  assert.strictEqual(ok.llamadas[0].init.method, "POST");

  const duplicado = crearFetchSimulado(() => respuesta(409, { detail: "Ya existe un cliente con ese email" }));
  const error = await capturarError(app.registrarCliente({ nombre: "Ana", email: "ana@example.com" }, duplicado));
  assert.strictEqual(error.mensaje, "Ya existe un cliente con ese email");
});

test("resumenLibroCreado y resumenClienteCreado describen el registro devuelto por la API", () => {
  const texto = app.resumenLibroCreado({
    id: 9,
    isbn: "9780000000099",
    titulo: "Libro de Prueba",
    precio: "1500.50",
    stock: 10,
    editorial: { id: 1, nombre: "Editorial Ficticia", pais: "Argentina" },
    genero: null,
    autorias: [{ autor: { id: 1, nombre: "Autora Ficticia", nacionalidad: "Argentina" }, rol: "autor", orden: 1 }],
  });
  assert.match(texto, /Libro registrado/);
  assert.match(texto, /ID 9/);
  assert.match(texto, /Libro de Prueba/);
  assert.match(texto, /\$ 1\.500,50/);
  assert.match(texto, /Stock: 10/);
  assert.match(texto, /Sin clasificar/);
  assert.match(texto, /Autora Ficticia \(autor\)/);

  const cliente = app.resumenClienteCreado({ id: 3, nombre: "Ana Gómez", email: "ana@example.com", perfil: null });
  assert.match(cliente, /Cliente registrado/);
  assert.match(cliente, /ID 3/);
  assert.match(cliente, /Ana Gómez/);
  assert.match(cliente, /ana@example\.com/);
});

// ---------------------------------------------------------------------------
// Ejercicio 3: borrador de venta (en memoria)
// ---------------------------------------------------------------------------

const catalogoVenta = [
  { id: 1, titulo: "Libro 1", precio: "1500.00" },
  { id: 2, titulo: "Libro 2", precio: "2000.50" },
  { id: 3, titulo: "Libro 3", precio: "999.99" },
];

test("cantidadValida acepta solo enteros positivos", () => {
  assert.strictEqual(app.cantidadValida("3"), true);
  assert.strictEqual(app.cantidadValida(" 12 "), true);
  for (const invalida of ["0", "-1", "1.5", "", "abc", "1e2"]) {
    assert.strictEqual(app.cantidadValida(invalida), false, `«${invalida}»`);
  }
});

test("crearBorrador agrega renglones con libroId numérico y cantidad numérica como texto", () => {
  const borrador = app.crearBorrador();
  assert.deepStrictEqual(borrador.agregar("2", "3", catalogoVenta), []);
  assert.deepStrictEqual(borrador.renglones, [{ libroId: 2, cantidad: "3" }]);
  assert.deepStrictEqual(borrador.agregar("1", " 5 ", catalogoVenta), []);
  assert.deepStrictEqual(borrador.renglones.map((r) => [r.libroId, r.cantidad]), [[2, "3"], [1, "5"]]);
});

test("crearBorrador admite un solo renglón por libro y valida libro y cantidad", () => {
  const borrador = app.crearBorrador();
  borrador.agregar("1", "1", catalogoVenta);
  assert.match(borrador.agregar("1", "2", catalogoVenta).join("|"), /ya está en la venta/i);
  assert.match(borrador.agregar("", "1", catalogoVenta).join("|"), /seleccioná un libro/i);
  assert.match(borrador.agregar("99", "1", catalogoVenta).join("|"), /no existe|no está disponible/i);
  for (const cantidad of ["0", "-2", "1.5", ""]) {
    assert.match(borrador.agregar("2", cantidad, catalogoVenta).join("|"), /cantidad/i, `cantidad «${cantidad}»`);
  }
  assert.strictEqual(borrador.renglones.length, 1);
});

test("crearBorrador permite cambiar cantidades y quitar renglones", () => {
  const borrador = app.crearBorrador();
  borrador.agregar("1", "1", catalogoVenta);
  borrador.agregar("2", "1", catalogoVenta);
  borrador.cambiarCantidad(2, "4");
  assert.strictEqual(borrador.renglones[1].cantidad, "4");
  borrador.cambiarCantidad(2, "abc");
  assert.strictEqual(borrador.renglones[1].cantidad, "abc", "se conserva el valor inválido mientras se edita");
  borrador.quitar(1);
  assert.deepStrictEqual(borrador.renglones.map((r) => r.libroId), [2]);
  borrador.quitar(99);
  assert.strictEqual(borrador.renglones.length, 1);
  borrador.vaciar();
  assert.strictEqual(borrador.renglones.length, 0);
});

test("el arreglo `renglones` del borrador es siempre el mismo objeto (se muta in situ)", () => {
  const borrador = app.crearBorrador();
  const referencia = borrador.renglones;
  borrador.agregar("1", "1", catalogoVenta);
  borrador.vaciar();
  assert.strictEqual(borrador.renglones, referencia);
});

test("calcularSubtotal y calcularTotalEnCurso estiman con precios string e ignoran cantidades inválidas", () => {
  assert.strictEqual(app.calcularSubtotal("2", "1500.00"), 3000);
  assert.strictEqual(app.calcularSubtotal(3, "999.99"), 2999.97);
  const renglones = [
    { libroId: 1, cantidad: "2" },
    { libroId: 2, cantidad: "1" },
    { libroId: 3, cantidad: "x" },
    { libroId: 77, cantidad: "1" },
  ];
  assert.strictEqual(app.calcularTotalEnCurso(renglones, catalogoVenta), 5000.5);
  assert.strictEqual(app.calcularTotalEnCurso([], catalogoVenta), 0);
});

test("validarVenta exige cliente, al menos un renglón y cantidades enteras positivas", () => {
  const ok = [{ libroId: 1, cantidad: "2" }];
  assert.deepStrictEqual(app.validarVenta("4", ok), []);
  assert.match(app.validarVenta("", ok).join("|"), /cliente/i);
  assert.match(app.validarVenta("4", []).join("|"), /al menos un libro|sin renglones/i);
  assert.match(app.validarVenta("4", [{ libroId: 1, cantidad: "0" }]).join("|"), /cantidad/i);
  assert.match(app.validarVenta("4", [{ libroId: 1, cantidad: "1.5" }]).join("|"), /cantidad/i);
  assert.strictEqual(app.validarVenta("", []).length, 2);
});

test("construirCuerpoVenta envía SOLO cliente_id y renglones {libro_id, cantidad} numéricos", () => {
  const cuerpo = app.construirCuerpoVenta("4", [
    { libroId: 2, cantidad: "3" },
    { libroId: 1, cantidad: " 1 " },
  ]);
  assert.deepStrictEqual(cuerpo, {
    cliente_id: 4,
    renglones: [
      { libro_id: 2, cantidad: 3 },
      { libro_id: 1, cantidad: 1 },
    ],
  });
  assert.deepStrictEqual(Object.keys(cuerpo).sort(), ["cliente_id", "renglones"]);
  assert.deepStrictEqual(Object.keys(cuerpo.renglones[0]).sort(), ["cantidad", "libro_id"]);
});

// ---------------------------------------------------------------------------
// Ejercicio 3: confirmación contra la API
// ---------------------------------------------------------------------------

function ventaDeApi(extra = {}) {
  return {
    id: 12,
    fecha: "2026-11-10T14:30:00-03:00",
    total: "5000.50",
    cliente: { id: 4, nombre: "Ana Gómez", email: "ana@example.com" },
    renglones: [
      { libro_id: 1, titulo: "Libro 1", cantidad: 2, precio_unitario: "1500.00", subtotal: "3000.00" },
      { libro_id: 2, titulo: "Libro 2", cantidad: 1, precio_unitario: "2000.50", subtotal: "2000.50" },
    ],
    ...extra,
  };
}

function borradorConDosRenglones() {
  const borrador = app.crearBorrador();
  borrador.agregar("1", "2", catalogoVenta);
  borrador.agregar("2", "1", catalogoVenta);
  return borrador;
}

test("confirmarBorrador hace POST /ventas/ con el cuerpo mínimo, devuelve la venta y vacía el borrador", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(201, ventaDeApi()));
  const borrador = borradorConDosRenglones();
  const venta = await app.confirmarBorrador(borrador, "4", fetchSimulado);

  assert.strictEqual(venta.id, 12);
  assert.strictEqual(borrador.renglones.length, 0);
  const { url, init } = fetchSimulado.llamadas[0];
  assert.strictEqual(url, "/api/ventas/");
  assert.strictEqual(init.method, "POST");
  assert.deepStrictEqual(JSON.parse(init.body), {
    cliente_id: 4,
    renglones: [
      { libro_id: 1, cantidad: 2 },
      { libro_id: 2, cantidad: 1 },
    ],
  });
});

test("confirmarBorrador CONSERVA el borrador ante 409, 422 y error de red", async () => {
  const casos = [
    () => respuesta(409, { detail: "Cliente no encontrado" }),
    () => respuesta(422, { detail: [{ type: "missing", loc: ["body", "cliente_id"], msg: "Field required" }] }),
    () => {
      throw new TypeError("Failed to fetch");
    },
  ];
  const tipos = ["conflicto", "validacion", "conexion"];
  for (let i = 0; i < casos.length; i += 1) {
    const borrador = borradorConDosRenglones();
    const error = await capturarError(app.confirmarBorrador(borrador, "4", crearFetchSimulado(casos[i])));
    assert.strictEqual(error.tipo, tipos[i]);
    assert.deepStrictEqual(borrador.renglones.map((r) => [r.libroId, r.cantidad]), [[1, "2"], [2, "1"]]);
  }
});

test("confirmarBorrador no llama a la API si la validación local falla", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(201, ventaDeApi()));
  const vacio = app.crearBorrador();
  const errorVacio = await capturarError(app.confirmarBorrador(vacio, "4", fetchSimulado));
  assert.strictEqual(errorVacio.tipo, "validacion");
  assert.match(errorVacio.mensaje, /al menos un libro/i);

  const errorCliente = await capturarError(app.confirmarBorrador(borradorConDosRenglones(), "", fetchSimulado));
  assert.match(errorCliente.mensaje, /cliente/i);
  assert.strictEqual(fetchSimulado.llamadas.length, 0);
});

test("filasDetalleVenta y totales usan los importes de la respuesta, sin recalcular", () => {
  const venta = ventaDeApi({
    total: "199.99",
    renglones: [{ libro_id: 1, titulo: "Libro 1", cantidad: 2, precio_unitario: "100.00", subtotal: "199.99" }],
  });
  assert.deepStrictEqual(app.filasDetalleVenta(venta), [
    { titulo: "Libro 1", cantidad: "2", precioUnitario: "$ 100,00", subtotal: "$ 199,99" },
  ]);
  assert.strictEqual(app.totalDeVenta(venta), "$ 199,99");
  assert.strictEqual(app.totalDeVenta(ventaDeApi()), "$ 5.000,50");
});

test("resumenVentaConfirmada informa id, cliente y total de la respuesta", () => {
  const texto = app.resumenVentaConfirmada(ventaDeApi());
  assert.match(texto, /Venta 12 confirmada/);
  assert.match(texto, /Ana Gómez/);
  assert.match(texto, /\$ 5\.000,50/);
});

test("formatearFecha acepta fechas ISO con offset y tolera valores inválidos", () => {
  const texto = app.formatearFecha("2026-11-10T14:30:00-03:00");
  assert.strictEqual(typeof texto, "string");
  assert.notStrictEqual(texto, "—");
  assert.ok(!texto.includes("Invalid"));
  assert.strictEqual(app.formatearFecha("no-es-fecha"), "—");
  assert.strictEqual(app.formatearFecha(null), "—");
});

// ---------------------------------------------------------------------------
// Ejercicio 3: clientes, historial y detalle desde la API
// ---------------------------------------------------------------------------

test("obtenerClientes pide limit=100 por defecto y acepta un límite explícito", async () => {
  const fetchSimulado = crearFetchSimulado(() => respuesta(200, []));
  await app.obtenerClientes({}, fetchSimulado);
  await app.obtenerClientes({ limit: 20, offset: 20 }, fetchSimulado);
  assert.deepStrictEqual(fetchSimulado.llamadas.map((l) => l.url), [
    "/api/clientes/?limit=100",
    "/api/clientes/?limit=20&offset=20",
  ]);
});

test("obtenerVentas y obtenerVenta consultan el historial y el detalle", async () => {
  const fetchSimulado = crearFetchSimulado((url) =>
    url.startsWith("/api/ventas/?") ? respuesta(200, [{ id: 1, fecha: "2026-11-10T10:00:00-03:00", total: "10.00", cliente: { id: 1, nombre: "A", email: "a@example.com" } }])
      : url === "/api/ventas/12" ? respuesta(200, ventaDeApi())
      : respuesta(404, { detail: "Venta no encontrada" })
  );
  const lista = await app.obtenerVentas({ limit: 20, offset: 40 }, fetchSimulado);
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(fetchSimulado.llamadas[0].url, "/api/ventas/?limit=20&offset=40");

  const detalle = await app.obtenerVenta(12, fetchSimulado);
  assert.strictEqual(detalle.renglones.length, 2);
  const error = await capturarError(app.obtenerVenta(999, fetchSimulado));
  assert.strictEqual(error.mensaje, "Venta no encontrada");
});

// ---------------------------------------------------------------------------
// Ejercicio 3: se eliminó todo lo local obsoleto
// ---------------------------------------------------------------------------

test("ya no se exportan datos semilla, ids locales ni persistencia local", () => {
  for (const nombre of [
    "libros",
    "clientes",
    "ventas",
    "editoriales",
    "generos",
    "autores",
    "generarSiguienteId",
    "crearVenta",
    "crearLibro",
    "CLAVES_ALMACENAMIENTO",
    "guardarColeccion",
    "leerColeccion",
    "cargarDatosGuardados",
    "validarIntegridadReferencial",
    "resolverEditorial",
    "filtrarPorTitulo",
    "calcularTotal",
  ]) {
    assert.strictEqual(app[nombre], undefined, `${nombre} debería haberse eliminado`);
  }
});

test("el código fuente no usa localStorage ni mensajes/comprobaciones de unicidad locales", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const fuente = fs.readFileSync(path.join(__dirname, "..", "public", "js", "app.js"), "utf8");
  for (const patron of [/localStorage/, /sessionStorage/, /generarSiguienteId/, /MENSAJE_\w*DUPLICADO/, /libreriaPampa\./, /autorIds/, /clienteNombre/]) {
    assert.doesNotMatch(fuente, patron, `no debería aparecer ${patron}`);
  }
});
