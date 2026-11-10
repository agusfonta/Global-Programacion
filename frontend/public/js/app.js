// Librería Pampa - lógica de la aplicación (conectada a la API REST).
// Nota: los mensajes con `hidden` y aria-live deben recibir su texto DESPUÉS de quitar `hidden`,
// para que los lectores de pantalla lo anuncien.

function formatearPrecio(valor) {
  const numero = Number(valor).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$ ${numero}`;
}

// ---------------------------------------------------------------------------
// Ejercicio 1: cliente HTTP centralizado
// ---------------------------------------------------------------------------

// Prefijo de la API. En producción lo resuelve el nginx del contenedor del frontend
// (proxy de /api/ al backend, quitando el prefijo), así que no hace falta CORS.
const API_BASE = "/api";

const LIMITE_PAGINA = 20; // tamaño fijo de página del catálogo y del historial
const LIMITE_SELECTORES = 100; // máximo que permite la API en un solo pedido
const ESPERA_BUSQUEDA_MS = 300;

const MENSAJE_SIN_CONEXION =
  "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.";

// Error normalizado de la API: { status, mensaje, tipo }.
// tipo: "conexion" | "conflicto" (409) | "no_encontrado" (404) | "validacion" (422) | "otro".
class ErrorApi extends Error {
  constructor(status, mensaje, tipo) {
    super(mensaje);
    this.name = "ErrorApi";
    this.status = status;
    this.mensaje = mensaje;
    this.tipo = tipo;
  }
}

const ETIQUETAS_CAMPO = {
  isbn: "ISBN",
  titulo: "Título",
  precio: "Precio",
  stock: "Stock",
  editorial_id: "Editorial",
  genero_id: "Género",
  autores: "Autores",
  autor_id: "ID de autor",
  rol: "Rol",
  orden: "Orden",
  nombre: "Nombre",
  email: "Email",
  cliente_id: "Cliente",
  renglones: "Renglones",
  libro_id: "Libro",
  cantidad: "Cantidad",
  limit: "Límite",
  offset: "Desplazamiento",
};

// Los mensajes de pydantic vienen en inglés: se traducen según `type` (y `ctx` si hay).
const TRADUCCIONES_422 = {
  missing: () => "es obligatorio",
  greater_than: (ctx) => `debe ser mayor que ${ctx.gt}`,
  greater_than_equal: (ctx) => `debe ser mayor o igual que ${ctx.ge}`,
  less_than: (ctx) => `debe ser menor que ${ctx.lt}`,
  less_than_equal: (ctx) => `debe ser menor o igual que ${ctx.le}`,
  string_too_short: () => "es demasiado corto",
  string_too_long: () => "es demasiado largo",
  too_short: () => "no tiene suficientes elementos",
  too_long: () => "tiene demasiados elementos",
  int_parsing: () => "debe ser un número entero",
  int_type: () => "debe ser un número entero",
  decimal_parsing: () => "debe ser un número decimal",
  decimal_type: () => "debe ser un número decimal",
  decimal_max_places: (ctx) => `admite como máximo ${ctx.decimal_places} decimales`,
  value_error: () => "tiene un formato inválido",
  literal_error: () => "tiene un valor no permitido",
  enum: () => "tiene un valor no permitido",
  string_type: () => "debe ser un texto",
};

function traducirItem422(item) {
  const loc = Array.isArray(item && item.loc) ? item.loc : [];
  const partes = loc.slice(loc[0] === "body" || loc[0] === "query" ? 1 : 0);
  const nombres = partes.filter((parte) => typeof parte === "string");
  const indices = partes.filter((parte) => typeof parte === "number");
  const campo = nombres.length > 0 ? nombres[nombres.length - 1] : "Dato";
  const etiqueta = ETIQUETAS_CAMPO[campo] || campo;
  const ubicacion = indices.length > 0 ? ` (ítem ${indices[0] + 1})` : "";
  const traducir = TRADUCCIONES_422[item && item.type];
  const texto = traducir ? traducir((item && item.ctx) || {}) : "valor inválido";
  return `${etiqueta}${ubicacion}: ${texto}.`;
}

function mensajeValidacion422(detail) {
  if (typeof detail === "string") {
    return detail;
  }
  if (!Array.isArray(detail) || detail.length === 0) {
    return "Los datos enviados no son válidos.";
  }
  return detail.map(traducirItem422).join("\n");
}

async function leerJsonSeguro(respuestaHttp) {
  try {
    return await respuestaHttp.json();
  } catch (error) {
    return null;
  }
}

function normalizarErrorHttp(status, cuerpo) {
  const detail = cuerpo && typeof cuerpo === "object" ? cuerpo.detail : undefined;
  if (status === 422) {
    return new ErrorApi(status, mensajeValidacion422(detail), "validacion");
  }
  if (status === 502 || status === 504) {
    // Los genera el proxy cuando el backend no responde: para el usuario es falta de conexión.
    return new ErrorApi(status, MENSAJE_SIN_CONEXION, "conexion");
  }
  const texto = typeof detail === "string" ? detail : `El servidor respondió con un error (${status}).`;
  if (status === 409) {
    return new ErrorApi(status, texto, "conflicto");
  }
  if (status === 404) {
    return new ErrorApi(status, texto, "no_encontrado");
  }
  return new ErrorApi(status, texto, "otro");
}

// opciones: { metodo, cuerpo, fetch } (`fetch` permite inyectar uno simulado en las pruebas).
// Devuelve el JSON de la respuesta o lanza un ErrorApi.
async function peticion(ruta, opciones = {}) {
  const fetchUsado = opciones.fetch || globalThis.fetch;
  const init = { method: opciones.metodo || "GET", headers: { Accept: "application/json" } };
  if (opciones.cuerpo !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opciones.cuerpo);
  }

  let respuestaHttp;
  try {
    respuestaHttp = await fetchUsado(`${API_BASE}${ruta}`, init);
  } catch (error) {
    throw new ErrorApi(0, MENSAJE_SIN_CONEXION, "conexion");
  }

  const cuerpo = await leerJsonSeguro(respuestaHttp);
  if (!respuestaHttp.ok) {
    throw normalizarErrorHttp(respuestaHttp.status, cuerpo);
  }
  return cuerpo;
}

// Arma la query omitiendo valores vacíos (el backend ignora `titulo` vacío, pero no hace falta enviarlo).
function construirQuery(parametros) {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor === undefined || valor === null || String(valor).trim() === "") {
      continue;
    }
    consulta.set(clave, String(valor).trim());
  }
  return consulta.toString();
}

function rutaConQuery(ruta, parametros) {
  const consulta = construirQuery(parametros);
  return consulta === "" ? ruta : `${ruta}?${consulta}`;
}

// ---------------------------------------------------------------------------
// Ejercicio 1: estado de listas, paginación, debounce y carreras
// ---------------------------------------------------------------------------

// El backend no devuelve total: hay página siguiente si llegaron exactamente `limit` elementos.
function calcularPaginacion(offset, limit, cantidad) {
  return {
    hayAnterior: offset > 0,
    haySiguiente: cantidad >= limit,
    offsetAnterior: Math.max(0, offset - limit),
    offsetSiguiente: offset + limit,
  };
}

function estadoLista({ cargando, error, cantidad, hayFiltro, offset = 0 }) {
  if (cargando) {
    return "cargando";
  }
  if (error) {
    return "error";
  }
  if (cantidad > 0) {
    return "lista";
  }
  if (offset > 0) {
    return "fin";
  }
  return hayFiltro ? "sin-coincidencias" : "vacio";
}

// Cada operación asíncrona toma un número; solo la última iniciada es vigente.
function crearControlSecuencia() {
  let ultima = 0;
  return {
    iniciar() {
      ultima += 1;
      return ultima;
    },
    esVigente(numero) {
      return numero === ultima;
    },
  };
}

function debounce(funcion, esperaMs, temporizador = globalThis) {
  let pendiente = null;
  return (...argumentos) => {
    if (pendiente !== null) {
      temporizador.clearTimeout(pendiente);
    }
    pendiente = temporizador.setTimeout(() => {
      pendiente = null;
      funcion(...argumentos);
    }, esperaMs);
  };
}

// ---------------------------------------------------------------------------
// Ejercicio 1: catálogo (libros + autores)
// ---------------------------------------------------------------------------

function obtenerLibros({ titulo = "", limit = LIMITE_PAGINA, offset = 0 } = {}, fetchUsado) {
  return peticion(rutaConQuery("/libros/", { titulo, limit, offset }), { fetch: fetchUsado });
}

// El listado no trae autores: se piden al detalle de cada libro. Si uno falla, ese libro
// queda con `autores: null` (se muestra «No disponible») y los demás siguen normales.
async function enriquecerConAutores(libros, fetchUsado) {
  return Promise.all(
    libros.map(async (libro) => {
      try {
        const detalle = await peticion(`/libros/${libro.id}`, { fetch: fetchUsado });
        const autorias = Array.isArray(detalle.autorias) ? detalle.autorias : [];
        const autores = autorias
          .slice()
          .sort((a, b) => a.orden - b.orden)
          .map((autoria) => ({ ...autoria.autor, rol: autoria.rol, orden: autoria.orden }));
        return { ...libro, autores };
      } catch (error) {
        return { ...libro, autores: null };
      }
    })
  );
}

function textoAutores(autores) {
  if (autores === null || autores === undefined) {
    return "No disponible";
  }
  if (autores.length === 0) {
    return "Sin autores";
  }
  return autores.map((autor) => autor.nombre).join(", ");
}

function textoGenero(genero) {
  return genero ? genero.nombre : "Sin clasificar";
}

function construirVistaFicha(libro) {
  return {
    id: libro.id,
    titulo: libro.titulo,
    isbn: libro.isbn,
    editorial: libro.editorial ? libro.editorial.nombre : "",
    genero: textoGenero(libro.genero),
    autores: textoAutores(libro.autores),
    precio: formatearPrecio(libro.precio),
  };
}

// ---------------------------------------------------------------------------
// Ejercicio 2: altas de libros y clientes
// ---------------------------------------------------------------------------

const ROLES_AUTOR = ["autor", "coautor", "traductor", "ilustrador"];

// Devuelve el entero positivo que representa el texto, o null si no lo es.
function parsearId(texto) {
  const limpio = String(texto ?? "").trim();
  return /^\d+$/.test(limpio) && Number(limpio) > 0 ? Number(limpio) : null;
}

function normalizarEmail(email) {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

// Lista de autores del libro en edición: [{ autorId, nombre, nacionalidad, rol }].
// El `orden` que pide la API no se guarda: es la posición en la lista (1..n).
function agregarAutor(lista, autor, rol) {
  if (!autor) {
    return { lista, error: "Verificá el autor antes de agregarlo." };
  }
  if (!ROLES_AUTOR.includes(rol)) {
    return { lista, error: "Elegí un rol válido para el autor." };
  }
  if (lista.some((item) => item.autorId === autor.id)) {
    return { lista, error: `«${autor.nombre}» ya está en la lista de autores.` };
  }
  const nuevo = { autorId: autor.id, nombre: autor.nombre, nacionalidad: autor.nacionalidad, rol };
  return { lista: [...lista, nuevo], error: null };
}

function quitarAutor(lista, autorId) {
  return lista.filter((item) => item.autorId !== autorId);
}

function precioValido(texto) {
  const limpio = String(texto ?? "").trim();
  return /^\d+(\.\d{1,2})?$/.test(limpio) && Number(limpio) > 0;
}

function stockValido(texto) {
  return /^\d+$/.test(String(texto ?? "").trim());
}

// Valida solo formato y obligatoriedad. La unicidad (ISBN, email) la decide el servidor.
function validarLibro(datos) {
  const errores = [];
  const autores = Array.isArray(datos.autores) ? datos.autores : [];

  if (String(datos.titulo ?? "").trim() === "") {
    errores.push("El título es obligatorio.");
  }
  if (String(datos.isbn ?? "").trim() === "") {
    errores.push("El ISBN es obligatorio.");
  }
  if (!precioValido(datos.precio)) {
    errores.push("El precio debe ser un número mayor que cero, con hasta 2 decimales.");
  }
  if (!stockValido(datos.stock)) {
    errores.push("El stock debe ser un número entero mayor o igual a 0.");
  }
  if (parsearId(datos.editorialId) === null) {
    errores.push("Seleccioná una editorial.");
  }
  if (autores.length < 1) {
    errores.push("Agregá al menos un autor.");
  } else if (new Set(autores.map((autor) => autor.autorId)).size !== autores.length) {
    errores.push("Hay autores repetidos.");
  }

  return errores;
}

function construirCuerpoLibro(datos) {
  return {
    isbn: String(datos.isbn).trim(),
    titulo: String(datos.titulo).trim(),
    precio: Number(String(datos.precio).trim()),
    stock: Number(String(datos.stock).trim()),
    editorial_id: parsearId(datos.editorialId),
    genero_id: parsearId(datos.generoId),
    autores: datos.autores.map((autor, indice) => ({
      autor_id: autor.autorId,
      rol: autor.rol,
      orden: indice + 1,
    })),
  };
}

function validarCliente(datos) {
  const errores = [];
  const email = String(datos.email ?? "").trim();

  if (String(datos.nombre ?? "").trim() === "") {
    errores.push("El nombre es obligatorio.");
  }
  if (email === "") {
    errores.push("El email es obligatorio.");
  } else if (!emailValido(email)) {
    errores.push("El email no tiene un formato válido.");
  }
  return errores;
}

function construirCuerpoCliente(datos) {
  return { nombre: String(datos.nombre).trim(), email: String(datos.email).trim() };
}

function obtenerEditoriales(fetchUsado) {
  return peticion(rutaConQuery("/editoriales/", { limit: LIMITE_SELECTORES }), { fetch: fetchUsado });
}

function obtenerGeneros(fetchUsado) {
  return peticion(rutaConQuery("/generos/", { limit: LIMITE_SELECTORES }), { fetch: fetchUsado });
}

function buscarAutor(id, fetchUsado) {
  return peticion(`/autores/${id}`, { fetch: fetchUsado });
}

function buscarCliente(id, fetchUsado) {
  return peticion(`/clientes/${id}`, { fetch: fetchUsado });
}

function registrarLibro(cuerpo, fetchUsado) {
  return peticion("/libros/", { metodo: "POST", cuerpo, fetch: fetchUsado });
}

function registrarCliente(cuerpo, fetchUsado) {
  return peticion("/clientes/", { metodo: "POST", cuerpo, fetch: fetchUsado });
}

function resumenLibroCreado(libro) {
  const autorias = Array.isArray(libro.autorias) ? libro.autorias : [];
  const autores = autorias.map((autoria) => `${autoria.autor.nombre} (${autoria.rol})`).join(", ");
  return [
    `Libro registrado: ID ${libro.id}, «${libro.titulo}».`,
    `ISBN: ${libro.isbn}. Precio: ${formatearPrecio(libro.precio)}. Stock: ${libro.stock}.`,
    `Editorial: ${libro.editorial ? libro.editorial.nombre : "—"}. Género: ${textoGenero(libro.genero)}.`,
    `Autores: ${autores || "—"}.`,
  ].join("\n");
}

function resumenClienteCreado(cliente) {
  return `Cliente registrado: ID ${cliente.id}, ${cliente.nombre} (${cliente.email}).`;
}

// ---------------------------------------------------------------------------
// Ejercicio 3: ventas e historial
// ---------------------------------------------------------------------------

function cantidadValida(valor) {
  return /^\d+$/.test(String(valor ?? "").trim()) && Number(String(valor).trim()) > 0;
}

function redondearImporte(valor) {
  return Math.round(valor * 100) / 100;
}

// Solo para el borrador en pantalla (estimado): el total real lo calcula el servidor.
function calcularSubtotal(cantidad, precioUnitario) {
  return redondearImporte(Number(cantidad) * Number(precioUnitario));
}

function calcularTotalEnCurso(renglones, catalogo) {
  let total = 0;
  for (const renglon of renglones) {
    const libro = catalogo.find((l) => l.id === renglon.libroId);
    if (libro && cantidadValida(renglon.cantidad)) {
      total += calcularSubtotal(renglon.cantidad, libro.precio);
    }
  }
  return redondearImporte(total);
}

// Borrador de la venta en memoria: [{ libroId (número), cantidad (texto) }].
// La cantidad queda como texto para conservar un valor inválido mientras se edita.
// `renglones` es siempre el mismo arreglo (se modifica in situ).
function crearBorrador() {
  const renglones = [];
  return {
    renglones,
    agregar(libroId, cantidad, catalogo) {
      const errores = [];
      const id = parsearId(libroId);
      if (String(libroId ?? "") === "") {
        errores.push("Seleccioná un libro.");
      } else if (id === null || !catalogo.some((libro) => libro.id === id)) {
        errores.push("El libro seleccionado no existe o no está disponible.");
      } else if (renglones.some((renglon) => renglon.libroId === id)) {
        errores.push("Ese libro ya está en la venta. Modificá la cantidad en su renglón en lugar de agregarlo otra vez.");
      }
      if (!cantidadValida(cantidad)) {
        errores.push("La cantidad debe ser un número entero mayor que cero.");
      }
      if (errores.length === 0) {
        renglones.push({ libroId: id, cantidad: String(Number(String(cantidad).trim())) });
      }
      return errores;
    },
    cambiarCantidad(libroId, valor) {
      const renglon = renglones.find((r) => r.libroId === libroId);
      if (renglon) {
        renglon.cantidad = String(valor);
      }
    },
    quitar(libroId) {
      const indice = renglones.findIndex((r) => r.libroId === libroId);
      if (indice !== -1) {
        renglones.splice(indice, 1);
      }
    },
    vaciar() {
      renglones.length = 0;
    },
  };
}

function validarVenta(clienteId, renglones) {
  const errores = [];
  if (parsearId(clienteId) === null) {
    errores.push("Seleccioná un cliente.");
  }
  if (renglones.length === 0) {
    errores.push("La venta no tiene renglones. Agregá al menos un libro.");
  } else if (renglones.some((renglon) => !cantidadValida(renglon.cantidad))) {
    errores.push("Hay renglones con cantidades inválidas: cada cantidad debe ser un número entero mayor que cero.");
  }
  return errores;
}

// El servidor calcula precios, subtotales y total: solo se envían ids y cantidades.
function construirCuerpoVenta(clienteId, renglones) {
  return {
    cliente_id: parsearId(clienteId),
    renglones: renglones.map((renglon) => ({
      libro_id: renglon.libroId,
      cantidad: Number(String(renglon.cantidad).trim()),
    })),
  };
}

function obtenerClientes({ limit = LIMITE_SELECTORES, offset } = {}, fetchUsado) {
  return peticion(rutaConQuery("/clientes/", { limit, offset }), { fetch: fetchUsado });
}

function obtenerVentas({ limit = LIMITE_PAGINA, offset = 0 } = {}, fetchUsado) {
  return peticion(rutaConQuery("/ventas/", { limit, offset }), { fetch: fetchUsado });
}

function obtenerVenta(id, fetchUsado) {
  return peticion(`/ventas/${id}`, { fetch: fetchUsado });
}

// Valida, envía y, solo si el servidor responde 201, vacía el borrador.
// Ante cualquier error (validación local, 409, 422, red) el borrador queda intacto.
async function confirmarBorrador(borrador, clienteId, fetchUsado) {
  const errores = validarVenta(clienteId, borrador.renglones);
  if (errores.length > 0) {
    throw new ErrorApi(0, errores.join("\n"), "validacion");
  }
  const cuerpo = construirCuerpoVenta(clienteId, borrador.renglones);
  const venta = await peticion("/ventas/", { metodo: "POST", cuerpo, fetch: fetchUsado });
  borrador.vaciar();
  return venta;
}

function formatearFecha(fechaIso) {
  const fecha = new Date(fechaIso);
  if (fechaIso === null || fechaIso === undefined || Number.isNaN(fecha.getTime())) {
    return "—";
  }
  return fecha.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

// Importes tal como los devolvió la API (strings decimales): solo se formatean, no se recalculan.
function filasDetalleVenta(venta) {
  return venta.renglones.map((renglon) => ({
    titulo: renglon.titulo,
    cantidad: String(renglon.cantidad),
    precioUnitario: formatearPrecio(renglon.precio_unitario),
    subtotal: formatearPrecio(renglon.subtotal),
  }));
}

function totalDeVenta(venta) {
  return formatearPrecio(venta.total);
}

function resumenVentaConfirmada(venta) {
  return `Venta ${venta.id} confirmada para ${venta.cliente.nombre} por un total de ${totalDeVenta(venta)}.`;
}

// ---------------------------------------------------------------------------
// Capa de pantalla (DOM). Solo se ejecuta en el navegador; la lógica de arriba se prueba en Node.
// ---------------------------------------------------------------------------

function porId(id) {
  return document.getElementById(id);
}

function crearOpcion(valor, texto) {
  const option = document.createElement("option");
  option.value = valor;
  option.textContent = texto;
  return option;
}

function crearCelda(texto) {
  const celda = document.createElement("td");
  celda.textContent = texto;
  return celda;
}

function textoError(error) {
  return error instanceof ErrorApi ? error.mensaje : "Ocurrió un error inesperado. Intentá de nuevo.";
}

// tipo: "ok" o "error". Aplica la clase del contrato CSS (mensaje--ok / mensaje--error).
function mostrarMensaje(contenedor, texto, tipo = "ok") {
  if (!contenedor) {
    return;
  }
  contenedor.classList.toggle("mensaje--error", tipo === "error");
  contenedor.classList.toggle("mensaje--ok", tipo !== "error");
  contenedor.hidden = false;
  contenedor.textContent = texto;
}

function ocultarMensaje(contenedor) {
  if (contenedor) {
    contenedor.hidden = true;
    contenedor.textContent = "";
  }
}

// Estados de carga/error con texto y, opcionalmente, un botón «Reintentar».
// El contenedor tiene la forma: <div .mensaje-estado><span .mensaje-estado-texto></span><button></button></div>
function mostrarEstado(id, tipo, texto, alReintentar) {
  const contenedor = porId(id);
  if (!contenedor) {
    return;
  }
  contenedor.classList.toggle("mensaje--cargando", tipo === "cargando");
  contenedor.classList.toggle("mensaje--error", tipo === "error");
  const boton = contenedor.querySelector("button");
  if (boton) {
    boton.hidden = !alReintentar;
    boton.onclick = alReintentar || null;
  }
  contenedor.hidden = false;
  contenedor.querySelector(".mensaje-estado-texto").textContent = texto;
}

function ocultarEstado(id) {
  const contenedor = porId(id);
  if (contenedor) {
    contenedor.hidden = true;
    contenedor.querySelector(".mensaje-estado-texto").textContent = "";
  }
}

// Mensajes informativos (.mensaje-vacio): el texto se escribe después de mostrarlos.
function mostrarInfo(id, texto) {
  const contenedor = porId(id);
  if (contenedor) {
    contenedor.hidden = false;
    contenedor.textContent = texto;
  }
}

function ocultarInfo(id) {
  ocultarMensaje(porId(id));
}

// Deshabilita todos los controles del formulario mientras se procesa y luego restaura el estado previo.
function bloquearFormulario(formulario, bloqueado) {
  const enfocado = document.activeElement;
  for (const control of formulario.elements) {
    if (bloqueado) {
      control.dataset.deshabilitadoAntes = control.disabled ? "1" : "";
      control.disabled = true;
    } else {
      control.disabled = control.dataset.deshabilitadoAntes === "1";
      delete control.dataset.deshabilitadoAntes;
    }
  }
  if (!bloqueado && enfocado && formulario.contains(enfocado) && !enfocado.disabled) {
    enfocado.focus();
  }
}

// Si el usuario estaba en un botón de paginación, el foco no se pierde al recargar la lista:
// vuelve al mismo botón y, si quedó deshabilitado (última/primera página), pasa al título de la vista.
function recordarFocoPaginacion(prefijo, idTitulo) {
  const activo = document.activeElement;
  const estabaEnPaginacion = Boolean(activo && (activo.id === `${prefijo}-anterior` || activo.id === `${prefijo}-siguiente`));
  const idBoton = estabaEnPaginacion ? activo.id : null;
  return () => {
    if (!idBoton) {
      return;
    }
    const boton = porId(idBoton);
    const destino = boton && !boton.disabled ? boton : porId(idTitulo);
    if (destino) {
      destino.focus();
    }
  };
}

function actualizarNotaLimite(id, cantidad, texto) {
  const nota = porId(id);
  if (!nota) {
    return;
  }
  nota.hidden = cantidad < LIMITE_SELECTORES;
  nota.textContent = nota.hidden ? "" : texto;
}

function actualizarPaginacion(prefijo, offset, paginacion, cargando) {
  const anterior = porId(`${prefijo}-anterior`);
  const siguiente = porId(`${prefijo}-siguiente`);
  const pagina = porId(`${prefijo}-pagina`);
  if (anterior) {
    anterior.disabled = cargando || !paginacion.hayAnterior;
  }
  if (siguiente) {
    siguiente.disabled = cargando || !paginacion.haySiguiente;
  }
  if (pagina) {
    pagina.textContent = `Página ${Math.floor(offset / LIMITE_PAGINA) + 1}`;
  }
}

// Datos compartidos entre vistas: se cargan una vez (limit=100) y alimentan tablas y selectores.
const datos = { libros: [], clientes: [] };
const secuenciaLibros = crearControlSecuencia();
const secuenciaClientes = crearControlSecuencia();

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

const estadoCatalogo = {
  titulo: "",
  offset: 0,
  paginacion: calcularPaginacion(0, LIMITE_PAGINA, 0),
  secuencia: crearControlSecuencia(),
};

function crearFicha(libro) {
  const vista = construirVistaFicha(libro);

  const articulo = document.createElement("article");
  articulo.className = "ficha";

  const titulo = document.createElement("h3");
  titulo.textContent = vista.titulo;
  articulo.appendChild(titulo);

  const listaDatos = document.createElement("dl");
  listaDatos.className = "lista-datos";
  const campos = [
    ["Título", vista.titulo],
    ["ISBN", vista.isbn],
    ["Editorial", vista.editorial],
    ["Género", vista.genero],
    ["Autores", vista.autores],
    ["Precio", vista.precio],
  ];
  for (const [etiqueta, valor] of campos) {
    const termino = document.createElement("dt");
    termino.textContent = etiqueta;
    const definicion = document.createElement("dd");
    definicion.textContent = valor;
    listaDatos.appendChild(termino);
    listaDatos.appendChild(definicion);
  }
  articulo.appendChild(listaDatos);

  const item = document.createElement("li");
  item.appendChild(articulo);
  return item;
}

function renderizarCatalogo(libros) {
  const lista = porId("lista-catalogo");
  lista.replaceChildren();
  for (const libro of libros) {
    lista.appendChild(crearFicha(libro));
  }
}

async function cargarCatalogo() {
  const restaurarFoco = recordarFocoPaginacion("catalogo", "titulo-catalogo");
  const token = estadoCatalogo.secuencia.iniciar();
  const { titulo, offset } = estadoCatalogo;
  const hayFiltro = titulo.trim() !== "";

  porId("lista-catalogo").replaceChildren();
  ocultarInfo("mensaje-catalogo-vacio");
  ocultarInfo("mensaje-catalogo-sin-resultados");
  ocultarEstado("estado-catalogo-error");
  mostrarEstado("estado-catalogo-cargando", "cargando", "Cargando libros…");
  actualizarPaginacion("catalogo", offset, estadoCatalogo.paginacion, true);

  try {
    const libros = await obtenerLibros({ titulo, limit: LIMITE_PAGINA, offset });
    const completos = await enriquecerConAutores(libros);
    if (!estadoCatalogo.secuencia.esVigente(token)) {
      return; // llegó tarde: ya hay una búsqueda más nueva en curso
    }
    ocultarEstado("estado-catalogo-cargando");
    renderizarCatalogo(completos);
    estadoCatalogo.paginacion = calcularPaginacion(offset, LIMITE_PAGINA, libros.length);

    const estado = estadoLista({ cargando: false, error: null, cantidad: libros.length, hayFiltro, offset });
    if (estado === "vacio") {
      mostrarInfo("mensaje-catalogo-vacio", "No hay libros en el catálogo.");
    } else if (estado === "sin-coincidencias") {
      mostrarInfo("mensaje-catalogo-sin-resultados", "No hay libros cuyo título coincida con la búsqueda.");
    } else if (estado === "fin") {
      mostrarInfo("mensaje-catalogo-sin-resultados", "No hay más libros en esta página. Volvé a la página anterior.");
    }
    actualizarPaginacion("catalogo", offset, estadoCatalogo.paginacion, false);
  } catch (error) {
    if (!estadoCatalogo.secuencia.esVigente(token)) {
      return;
    }
    ocultarEstado("estado-catalogo-cargando");
    mostrarEstado("estado-catalogo-error", "error", textoError(error), cargarCatalogo);
    actualizarPaginacion("catalogo", offset, calcularPaginacion(offset, LIMITE_PAGINA, 0), false);
  }
  restaurarFoco();
}

function inicializarCatalogo(buscador) {
  const buscarDiferido = debounce(() => {
    estadoCatalogo.titulo = buscador.value;
    estadoCatalogo.offset = 0; // al cambiar el filtro se vuelve a la primera página
    cargarCatalogo();
  }, ESPERA_BUSQUEDA_MS);
  buscador.addEventListener("input", buscarDiferido);

  porId("catalogo-anterior").addEventListener("click", () => {
    estadoCatalogo.offset = estadoCatalogo.paginacion.offsetAnterior;
    cargarCatalogo();
  });
  porId("catalogo-siguiente").addEventListener("click", () => {
    estadoCatalogo.offset = estadoCatalogo.paginacion.offsetSiguiente;
    cargarCatalogo();
  });

  cargarCatalogo();
}

// ---------------------------------------------------------------------------
// Datos compartidos: tablas de libros y clientes, selectores de venta
// ---------------------------------------------------------------------------

// Reconstruye un selector conservando la opción elegida si sigue existiendo.
function reconstruirSelector(select, textoVacio, elementos, obtenerTexto) {
  if (!select) {
    return;
  }
  const seleccionado = select.value;
  select.replaceChildren();
  select.appendChild(crearOpcion("", textoVacio));
  for (const elemento of elementos) {
    select.appendChild(crearOpcion(String(elemento.id), obtenerTexto(elemento)));
  }
  if (elementos.some((elemento) => String(elemento.id) === seleccionado)) {
    select.value = seleccionado;
  }
}

function renderizarTablaLibros() {
  const cuerpo = porId("tabla-libros-cuerpo");
  if (!cuerpo) {
    return;
  }
  cuerpo.replaceChildren();
  for (const libro of datos.libros) {
    const fila = document.createElement("tr");
    fila.appendChild(crearCelda(String(libro.id)));
    fila.appendChild(crearCelda(libro.titulo));
    fila.appendChild(crearCelda(libro.isbn));
    fila.appendChild(crearCelda(libro.editorial ? libro.editorial.nombre : ""));
    fila.appendChild(crearCelda(textoGenero(libro.genero)));
    fila.appendChild(crearCelda(formatearPrecio(libro.precio)));
    fila.appendChild(crearCelda(String(libro.stock)));
    cuerpo.appendChild(fila);
  }
}

function renderizarTablaClientes() {
  const cuerpo = porId("tabla-clientes-cuerpo");
  if (!cuerpo) {
    return;
  }
  cuerpo.replaceChildren();
  for (const cliente of datos.clientes) {
    const fila = document.createElement("tr");
    fila.appendChild(crearCelda(String(cliente.id)));
    fila.appendChild(crearCelda(cliente.nombre));
    fila.appendChild(crearCelda(cliente.email));
    cuerpo.appendChild(fila);
  }
}

function refrescarSelectoresVenta() {
  reconstruirSelector(
    porId("venta-libro"),
    "Seleccioná un libro",
    datos.libros,
    (libro) => `${libro.titulo} (${formatearPrecio(libro.precio)})`
  );
  reconstruirSelector(
    porId("venta-cliente"),
    "Seleccioná un cliente",
    datos.clientes,
    (cliente) => `${cliente.nombre} (${cliente.email})`
  );
}

// Tablas de libros y clientes: se llenan desde GET /libros/ y GET /clientes/ con limit=100
// (no con lo creado en la sesión), así lo que se ve siempre coincide con el servidor.
async function recargarLibros() {
  const token = secuenciaLibros.iniciar();
  ocultarInfo("mensaje-libros-vacio");
  mostrarEstado("estado-libros", "cargando", "Cargando libros…");
  try {
    const libros = await obtenerLibros({ limit: LIMITE_SELECTORES, offset: 0 });
    if (!secuenciaLibros.esVigente(token)) {
      return;
    }
    datos.libros = libros;
    ocultarEstado("estado-libros");
    renderizarTablaLibros();
    renderizarRenglonesVenta();
    refrescarSelectoresVenta();
    if (libros.length === 0) {
      mostrarInfo("mensaje-libros-vacio", "Todavía no hay libros registrados.");
    }
    actualizarNotaLimite(
      "nota-libros-limite",
      libros.length,
      `Se muestran solo los primeros ${LIMITE_SELECTORES} libros (por id). Los libros posteriores no aparecen en esta tabla ni en el selector de ventas.`
    );
  } catch (error) {
    if (secuenciaLibros.esVigente(token)) {
      mostrarEstado("estado-libros", "error", `No se pudieron cargar los libros. ${textoError(error)}`, recargarLibros);
    }
  }
}

async function recargarClientes() {
  const token = secuenciaClientes.iniciar();
  ocultarInfo("mensaje-clientes-vacio");
  mostrarEstado("estado-clientes", "cargando", "Cargando clientes…");
  try {
    const clientes = await obtenerClientes({ limit: LIMITE_SELECTORES });
    if (!secuenciaClientes.esVigente(token)) {
      return;
    }
    datos.clientes = clientes;
    ocultarEstado("estado-clientes");
    renderizarTablaClientes();
    refrescarSelectoresVenta();
    if (clientes.length === 0) {
      mostrarInfo("mensaje-clientes-vacio", "Todavía no hay clientes registrados.");
    }
    actualizarNotaLimite(
      "nota-clientes-limite",
      clientes.length,
      `Se muestran solo los primeros ${LIMITE_SELECTORES} clientes (por id). Los clientes posteriores no aparecen en esta tabla ni en el selector de ventas.`
    );
  } catch (error) {
    if (secuenciaClientes.esVigente(token)) {
      mostrarEstado("estado-clientes", "error", `No se pudieron cargar los clientes. ${textoError(error)}`, recargarClientes);
    }
  }
}

// ---------------------------------------------------------------------------
// Alta de libros
// ---------------------------------------------------------------------------

let autoresLibro = [];
let autorVerificado = null;

async function cargarOpcionesLibro() {
  mostrarEstado("estado-opciones-libro", "cargando", "Cargando editoriales y géneros…");
  try {
    const [editoriales, generos] = await Promise.all([obtenerEditoriales(), obtenerGeneros()]);
    reconstruirSelector(porId("libro-editorial"), "Seleccioná una editorial", editoriales, (e) => e.nombre);
    reconstruirSelector(porId("libro-genero"), "Sin género", generos, (g) => g.nombre);
    ocultarEstado("estado-opciones-libro");
  } catch (error) {
    mostrarEstado(
      "estado-opciones-libro",
      "error",
      `No se pudieron cargar las editoriales y los géneros. ${textoError(error)}`,
      cargarOpcionesLibro
    );
  }
}

function renderizarAutoresLibro() {
  const lista = porId("lista-autores-libro");
  lista.replaceChildren();
  autoresLibro.forEach((autor, indice) => {
    const item = document.createElement("li");
    const texto = document.createElement("span");
    texto.textContent = `${indice + 1}. ${autor.nombre} (${autor.nacionalidad}), rol: ${autor.rol} `;
    item.appendChild(texto);

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "btn btn--peligro";
    quitar.textContent = `Quitar a ${autor.nombre}`;
    quitar.addEventListener("click", () => {
      autoresLibro = quitarAutor(autoresLibro, autor.autorId);
      renderizarAutoresLibro();
      porId("libro-autor-id").focus(); // el botón quitado desaparece: el foco vuelve al campo de ID
    });
    item.appendChild(quitar);
    lista.appendChild(item);
  });
  porId("mensaje-autores-vacio").hidden = autoresLibro.length > 0;
}

function reiniciarVerificacionAutor() {
  autorVerificado = null;
  porId("btn-agregar-autor").disabled = true;
  ocultarMensaje(porId("autor-verificado"));
}

async function verificarAutor() {
  const campo = porId("libro-autor-id");
  const resultado = porId("autor-verificado");
  const id = parsearId(campo.value);
  if (id === null) {
    reiniciarVerificacionAutor();
    mostrarMensaje(resultado, "Ingresá un ID de autor válido (entero mayor que cero).", "error");
    return;
  }

  const boton = porId("btn-verificar-autor");
  boton.disabled = true;
  try {
    const autor = await buscarAutor(id);
    if (parsearId(campo.value) !== id) {
      return; // el usuario cambió el ID mientras se verificaba
    }
    autorVerificado = autor;
    porId("btn-agregar-autor").disabled = false;
    mostrarMensaje(resultado, `Autor encontrado: ${autor.nombre} (${autor.nacionalidad}).`);
  } catch (error) {
    reiniciarVerificacionAutor();
    mostrarMensaje(resultado, textoError(error), "error");
  } finally {
    boton.disabled = false;
  }
}

function agregarAutorDesdeFormulario() {
  const resultado = agregarAutor(autoresLibro, autorVerificado, porId("libro-autor-rol").value);
  if (resultado.error) {
    mostrarMensaje(porId("autor-verificado"), resultado.error, "error");
    return;
  }
  autoresLibro = resultado.lista;
  renderizarAutoresLibro();
  porId("libro-autor-id").value = "";
  reiniciarVerificacionAutor();
  porId("libro-autor-id").focus();
}

function inicializarFormularioLibro(formLibro) {
  const mensajeLibro = porId("mensaje-libro-resultado");
  const campoAutor = porId("libro-autor-id");

  renderizarAutoresLibro();
  reiniciarVerificacionAutor();
  cargarOpcionesLibro();

  const selectRol = porId("libro-autor-rol");
  selectRol.replaceChildren();
  for (const rol of ROLES_AUTOR) {
    selectRol.appendChild(crearOpcion(rol, rol));
  }

  porId("btn-verificar-autor").addEventListener("click", verificarAutor);
  porId("btn-agregar-autor").addEventListener("click", agregarAutorDesdeFormulario);
  campoAutor.addEventListener("input", reiniciarVerificacionAutor);
  // Enter en el campo de ID verifica el autor en lugar de enviar el formulario completo.
  campoAutor.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      verificarAutor();
    }
  });

  formLibro.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datosLibro = {
      titulo: porId("libro-titulo").value,
      isbn: porId("libro-isbn").value,
      precio: porId("libro-precio").value,
      stock: porId("libro-stock").value,
      editorialId: porId("libro-editorial").value,
      generoId: porId("libro-genero").value,
      autores: autoresLibro,
    };

    const errores = validarLibro(datosLibro);
    if (errores.length > 0) {
      mostrarMensaje(mensajeLibro, errores.join("\n"), "error");
      return;
    }

    bloquearFormulario(formLibro, true);
    let creado = null;
    try {
      creado = await registrarLibro(construirCuerpoLibro(datosLibro));
    } catch (error) {
      mostrarMensaje(mensajeLibro, textoError(error), "error"); // se conservan los datos cargados
    } finally {
      bloquearFormulario(formLibro, false);
    }

    if (creado) {
      // Se limpia después de desbloquear, para no pisar el estado de los botones.
      formLibro.reset();
      autoresLibro = [];
      renderizarAutoresLibro();
      reiniciarVerificacionAutor();
      mostrarMensaje(mensajeLibro, resumenLibroCreado(creado));
      recargarLibros(); // tabla y selector de ventas
      cargarCatalogo(); // catálogo
    }
  });
}

// ---------------------------------------------------------------------------
// Alta y consulta de clientes
// ---------------------------------------------------------------------------

async function buscarClientePorId() {
  const resultado = porId("resultado-buscar-cliente");
  const id = parsearId(porId("buscar-cliente-id").value);
  if (id === null) {
    mostrarMensaje(resultado, "Ingresá un ID de cliente válido (entero mayor que cero).", "error");
    return;
  }
  const boton = porId("btn-buscar-cliente");
  boton.disabled = true;
  try {
    const cliente = await buscarCliente(id);
    mostrarMensaje(resultado, `Cliente ${cliente.id}: ${cliente.nombre} (${cliente.email}).`);
  } catch (error) {
    mostrarMensaje(resultado, textoError(error), "error");
  } finally {
    boton.disabled = false;
  }
}

function inicializarFormularioCliente(formCliente) {
  const mensajeCliente = porId("mensaje-cliente-resultado");

  porId("btn-buscar-cliente").addEventListener("click", buscarClientePorId);
  porId("buscar-cliente-id").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      buscarClientePorId();
    }
  });

  formCliente.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datosCliente = {
      nombre: porId("cliente-nombre").value,
      email: porId("cliente-email").value,
    };
    const errores = validarCliente(datosCliente);
    if (errores.length > 0) {
      mostrarMensaje(mensajeCliente, errores.join("\n"), "error");
      return;
    }

    bloquearFormulario(formCliente, true);
    let creado = null;
    try {
      creado = await registrarCliente(construirCuerpoCliente(datosCliente));
    } catch (error) {
      mostrarMensaje(mensajeCliente, textoError(error), "error");
    } finally {
      bloquearFormulario(formCliente, false);
    }

    if (creado) {
      formCliente.reset();
      mostrarMensaje(mensajeCliente, resumenClienteCreado(creado));
      recargarClientes(); // tabla y selector de ventas
    }
  });
}

// ---------------------------------------------------------------------------
// Ventas: borrador, confirmación y comprobante
// ---------------------------------------------------------------------------

const borradorVenta = crearBorrador();
const renglonesVenta = borradorVenta.renglones;

function actualizarTotalVenta() {
  const salida = porId("venta-total");
  if (salida) {
    salida.textContent = formatearPrecio(calcularTotalEnCurso(renglonesVenta, datos.libros));
  }
}

function textoSubtotalEstimado(cantidad, precio) {
  return cantidadValida(cantidad) ? formatearPrecio(calcularSubtotal(cantidad, precio)) : "Cantidad inválida";
}

function crearFilaRenglonVenta(renglon) {
  const libro = datos.libros.find((l) => l.id === renglon.libroId);
  const titulo = libro ? libro.titulo : `Libro ${renglon.libroId}`;
  const precio = libro ? libro.precio : 0;

  const fila = document.createElement("tr");
  fila.appendChild(crearCelda(titulo));

  const inputCantidad = document.createElement("input");
  inputCantidad.type = "number";
  inputCantidad.min = "1";
  inputCantidad.step = "1";
  inputCantidad.className = "campo-control campo-control--compacto";
  inputCantidad.value = renglon.cantidad;
  inputCantidad.setAttribute("aria-label", `Cantidad de ${titulo}`);
  const celdaCantidad = document.createElement("td");
  celdaCantidad.appendChild(inputCantidad);
  fila.appendChild(celdaCantidad);

  fila.appendChild(crearCelda(formatearPrecio(precio)));
  const celdaSubtotal = crearCelda(textoSubtotalEstimado(renglon.cantidad, precio));
  fila.appendChild(celdaSubtotal);

  inputCantidad.addEventListener("input", () => {
    borradorVenta.cambiarCantidad(renglon.libroId, inputCantidad.value);
    inputCantidad.setAttribute("aria-invalid", String(!cantidadValida(inputCantidad.value)));
    celdaSubtotal.textContent = textoSubtotalEstimado(inputCantidad.value, precio);
    actualizarTotalVenta();
  });

  const botonQuitar = document.createElement("button");
  botonQuitar.type = "button";
  botonQuitar.className = "btn btn--peligro";
  botonQuitar.textContent = `Quitar ${titulo}`;
  botonQuitar.addEventListener("click", () => {
    borradorVenta.quitar(renglon.libroId);
    renderizarRenglonesVenta();
    porId("venta-libro").focus(); // el botón quitado desaparece: el foco vuelve al selector de libros
    mostrarMensaje(porId("mensaje-venta-resultado"), `Se quitó «${titulo}» de la venta.`);
  });
  const celdaAcciones = document.createElement("td");
  celdaAcciones.appendChild(botonQuitar);
  fila.appendChild(celdaAcciones);

  return fila;
}

function renderizarRenglonesVenta() {
  const cuerpo = porId("venta-renglones-cuerpo");
  if (!cuerpo) {
    return;
  }
  cuerpo.replaceChildren();
  for (const renglon of renglonesVenta) {
    cuerpo.appendChild(crearFilaRenglonVenta(renglon));
  }
  porId("mensaje-venta-vacia").hidden = renglonesVenta.length > 0;
  actualizarTotalVenta();
}

function agregarRenglonDesdeFormulario() {
  const selectLibro = porId("venta-libro");
  const inputCantidad = porId("venta-cantidad");
  const mensajeVenta = porId("mensaje-venta-resultado");

  const errores = borradorVenta.agregar(selectLibro.value, inputCantidad.value, datos.libros);
  if (errores.length > 0) {
    mostrarMensaje(mensajeVenta, errores.join("\n"), "error");
    return;
  }
  const libro = datos.libros.find((l) => String(l.id) === selectLibro.value);
  renderizarRenglonesVenta();
  selectLibro.value = "";
  inputCantidad.value = "1";
  selectLibro.focus();
  mostrarMensaje(mensajeVenta, `Se agregó «${libro.titulo}» a la venta.`);
}

// Arma el detalle de una venta (fecha, cliente, renglones, total) con los datos de la API.
function renderizarDetalleVenta(contenedor, venta) {
  contenedor.replaceChildren();

  const lista = document.createElement("dl");
  lista.className = "lista-datos";
  const terminoFecha = document.createElement("dt");
  terminoFecha.textContent = "Fecha";
  const definicionFecha = document.createElement("dd");
  const tiempo = document.createElement("time");
  tiempo.dateTime = venta.fecha;
  tiempo.textContent = formatearFecha(venta.fecha);
  definicionFecha.appendChild(tiempo);
  const terminoCliente = document.createElement("dt");
  terminoCliente.textContent = "Cliente";
  const definicionCliente = document.createElement("dd");
  definicionCliente.textContent = `${venta.cliente.nombre} (${venta.cliente.email})`;
  lista.append(terminoFecha, definicionFecha, terminoCliente, definicionCliente);
  contenedor.appendChild(lista);

  const envoltorio = document.createElement("div");
  envoltorio.className = "tabla-scroll";
  envoltorio.tabIndex = 0;
  envoltorio.setAttribute("role", "region");
  envoltorio.setAttribute("aria-label", `Renglones de la venta ${venta.id}`);
  const tabla = document.createElement("table");
  tabla.className = "tabla";
  const caption = document.createElement("caption");
  caption.textContent = `Renglones de la venta ${venta.id}`;
  tabla.appendChild(caption);
  const cabecera = document.createElement("thead");
  const filaCabecera = document.createElement("tr");
  for (const nombre of ["Libro", "Cantidad", "Precio unitario", "Subtotal"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = nombre;
    filaCabecera.appendChild(th);
  }
  cabecera.appendChild(filaCabecera);
  tabla.appendChild(cabecera);
  const cuerpo = document.createElement("tbody");
  for (const fila of filasDetalleVenta(venta)) {
    const tr = document.createElement("tr");
    tr.appendChild(crearCelda(fila.titulo));
    tr.appendChild(crearCelda(fila.cantidad));
    tr.appendChild(crearCelda(fila.precioUnitario));
    tr.appendChild(crearCelda(fila.subtotal));
    cuerpo.appendChild(tr);
  }
  tabla.appendChild(cuerpo);
  envoltorio.appendChild(tabla);
  contenedor.appendChild(envoltorio);

  const total = document.createElement("p");
  total.className = "resumen-total";
  total.append("Total de la venta: ");
  const fuerte = document.createElement("strong");
  fuerte.textContent = totalDeVenta(venta);
  total.appendChild(fuerte);
  contenedor.appendChild(total);
}

function mostrarComprobante(venta) {
  porId("titulo-venta-comprobante").textContent = `Comprobante de la venta ${venta.id}`;
  renderizarDetalleVenta(porId("venta-comprobante-contenido"), venta);
  porId("venta-comprobante").hidden = false;
  porId("titulo-venta-comprobante").focus();
}

function inicializarVentas(formVenta) {
  const mensajeVenta = porId("mensaje-venta-resultado");
  renderizarRenglonesVenta();

  porId("btn-agregar-renglon").addEventListener("click", agregarRenglonDesdeFormulario);

  // Enter dentro de un campo no confirma la venta: en «Cantidad» agrega el renglón.
  formVenta.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" || evento.target.tagName !== "INPUT") {
      return;
    }
    evento.preventDefault();
    if (evento.target.id === "venta-cantidad") {
      agregarRenglonDesdeFormulario();
    }
  });

  formVenta.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const clienteId = porId("venta-cliente").value;

    bloquearFormulario(formVenta, true);
    let venta = null;
    try {
      venta = await confirmarBorrador(borradorVenta, clienteId);
    } catch (error) {
      // Borrador intacto: el usuario puede corregir y reintentar.
      mostrarMensaje(mensajeVenta, `No se confirmó la venta.\n${textoError(error)}`, "error");
    } finally {
      bloquearFormulario(formVenta, false);
    }

    if (venta) {
      formVenta.reset();
      renderizarRenglonesVenta();
      mostrarMensaje(mensajeVenta, resumenVentaConfirmada(venta));
      mostrarComprobante(venta);
      cargarHistorial();
    }
  });
}

// ---------------------------------------------------------------------------
// Historial de ventas (orden ascendente por id, tal como lo devuelve la API)
// ---------------------------------------------------------------------------

const estadoHistorial = {
  offset: 0,
  paginacion: calcularPaginacion(0, LIMITE_PAGINA, 0),
  secuencia: crearControlSecuencia(),
  secuenciaDetalle: crearControlSecuencia(),
};

function renderizarHistorial(ventas) {
  const cuerpo = porId("historial-cuerpo");
  cuerpo.replaceChildren();
  for (const venta of ventas) {
    const fila = document.createElement("tr");
    fila.appendChild(crearCelda(String(venta.id)));

    const celdaFecha = document.createElement("td");
    const tiempo = document.createElement("time");
    tiempo.dateTime = venta.fecha;
    tiempo.textContent = formatearFecha(venta.fecha);
    celdaFecha.appendChild(tiempo);
    fila.appendChild(celdaFecha);

    fila.appendChild(crearCelda(venta.cliente.nombre));
    fila.appendChild(crearCelda(totalDeVenta(venta)));

    const botonDetalle = document.createElement("button");
    botonDetalle.type = "button";
    botonDetalle.className = "btn btn--secundario";
    botonDetalle.textContent = `Ver detalle de la venta ${venta.id}`;
    botonDetalle.addEventListener("click", () => abrirDetalleVenta(venta.id));
    const celdaDetalle = document.createElement("td");
    celdaDetalle.appendChild(botonDetalle);
    fila.appendChild(celdaDetalle);

    cuerpo.appendChild(fila);
  }
}

async function cargarHistorial() {
  const restaurarFoco = recordarFocoPaginacion("historial", "titulo-historial");
  const token = estadoHistorial.secuencia.iniciar();
  const { offset } = estadoHistorial;

  ocultarInfo("mensaje-historial-vacio");
  ocultarEstado("estado-historial");
  mostrarEstado("estado-historial", "cargando", "Cargando ventas…");
  actualizarPaginacion("historial", offset, estadoHistorial.paginacion, true);

  try {
    const ventas = await obtenerVentas({ limit: LIMITE_PAGINA, offset });
    if (!estadoHistorial.secuencia.esVigente(token)) {
      return;
    }
    ocultarEstado("estado-historial");
    renderizarHistorial(ventas);
    estadoHistorial.paginacion = calcularPaginacion(offset, LIMITE_PAGINA, ventas.length);

    const estado = estadoLista({ cargando: false, error: null, cantidad: ventas.length, hayFiltro: false, offset });
    if (estado === "vacio") {
      mostrarInfo("mensaje-historial-vacio", "Todavía no hay ventas registradas.");
    } else if (estado === "fin") {
      mostrarInfo("mensaje-historial-vacio", "No hay más ventas en esta página. Volvé a la página anterior.");
    }
    actualizarPaginacion("historial", offset, estadoHistorial.paginacion, false);
  } catch (error) {
    if (!estadoHistorial.secuencia.esVigente(token)) {
      return;
    }
    porId("historial-cuerpo").replaceChildren();
    mostrarEstado("estado-historial", "error", `No se pudo cargar el historial. ${textoError(error)}`, cargarHistorial);
    actualizarPaginacion("historial", offset, calcularPaginacion(offset, LIMITE_PAGINA, 0), false);
  }
  restaurarFoco();
}

// El detalle se pide siempre a GET /ventas/{id}: no depende de nada guardado en el navegador.
async function abrirDetalleVenta(id) {
  const token = estadoHistorial.secuenciaDetalle.iniciar();
  porId("detalle-venta").hidden = true;
  mostrarEstado("estado-detalle-venta", "cargando", `Cargando el detalle de la venta ${id}…`);
  try {
    const venta = await obtenerVenta(id);
    if (!estadoHistorial.secuenciaDetalle.esVigente(token)) {
      return;
    }
    ocultarEstado("estado-detalle-venta");
    const titulo = porId("titulo-detalle-venta");
    titulo.textContent = `Detalle de la venta ${venta.id}`;
    renderizarDetalleVenta(porId("detalle-venta-contenido"), venta);
    porId("detalle-venta").hidden = false;
    titulo.focus();
  } catch (error) {
    if (estadoHistorial.secuenciaDetalle.esVigente(token)) {
      mostrarEstado(
        "estado-detalle-venta",
        "error",
        `No se pudo cargar el detalle de la venta ${id}. ${textoError(error)}`,
        () => abrirDetalleVenta(id)
      );
    }
  }
}

function inicializarHistorial() {
  porId("historial-anterior").addEventListener("click", () => {
    estadoHistorial.offset = estadoHistorial.paginacion.offsetAnterior;
    cargarHistorial();
  });
  porId("historial-siguiente").addEventListener("click", () => {
    estadoHistorial.offset = estadoHistorial.paginacion.offsetSiguiente;
    cargarHistorial();
  });
  cargarHistorial();
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------

function inicializar() {
  const buscador = porId("busqueda-titulo");
  const formLibro = porId("form-libro");
  const formCliente = porId("form-cliente");
  const formVenta = porId("form-venta");
  const hayHistorial = Boolean(porId("historial-cuerpo"));

  if (!buscador && !formLibro && !formCliente && !formVenta && !hayHistorial) {
    return;
  }

  if (buscador) {
    inicializarCatalogo(buscador);
  }
  if (formLibro) {
    inicializarFormularioLibro(formLibro);
  }
  if (formCliente) {
    inicializarFormularioCliente(formCliente);
  }
  if (formVenta) {
    inicializarVentas(formVenta);
  }
  if (hayHistorial) {
    inicializarHistorial();
  }
  recargarLibros();
  recargarClientes();
}

if (typeof document !== "undefined") {
  inicializar();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    inicializar,
    API_BASE,
    LIMITE_PAGINA,
    LIMITE_SELECTORES,
    ESPERA_BUSQUEDA_MS,
    ROLES_AUTOR,
    ErrorApi,
    peticion,
    construirQuery,
    rutaConQuery,
    mensajeValidacion422,
    calcularPaginacion,
    estadoLista,
    crearControlSecuencia,
    debounce,
    formatearPrecio,
    formatearFecha,
    obtenerLibros,
    enriquecerConAutores,
    textoAutores,
    textoGenero,
    construirVistaFicha,
    parsearId,
    emailValido,
    agregarAutor,
    quitarAutor,
    validarLibro,
    construirCuerpoLibro,
    validarCliente,
    construirCuerpoCliente,
    obtenerEditoriales,
    obtenerGeneros,
    buscarAutor,
    buscarCliente,
    registrarLibro,
    registrarCliente,
    resumenLibroCreado,
    resumenClienteCreado,
    cantidadValida,
    crearBorrador,
    calcularSubtotal,
    calcularTotalEnCurso,
    validarVenta,
    construirCuerpoVenta,
    obtenerClientes,
    obtenerVentas,
    obtenerVenta,
    confirmarBorrador,
    filasDetalleVenta,
    totalDeVenta,
    resumenVentaConfirmada,
  };
}
