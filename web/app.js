/**
 * Fixed Garage — frontend vanilla JS.
 *
 * Nada de frameworks acá a propósito: es un sitio chico, y así podés
 * leer y modificar el código sin depender de build tools. El patrón es
 * simple: fetch a la API → clonar un <template> del HTML → completar
 * los datos → insertarlo en la grilla. Los <template> viven en index.html.
 */

// Cambiá esto por la URL de tu backend cuando lo deployes (Railway/Render).
// Mientras desarrollás local, apunta a tu servidor de uvicorn.
const API_BASE_URL = "http://localhost:8000";
const INTERVALO_ACTUALIZACION_COTIZACION_MS = 60 * 1000; // 1 minuto

const ESTADO_LABELS = {
  available: "Disponible",
  reserved: "Reservado",
  sold: "Vendido",
};

// Guardamos referencia a cada elemento "USD X ARS" que ya renderizamos,
// junto con el precio en USD de ese cuadro. Así, cuando llega una
// cotización nueva, recalculamos los pesos SIN volver a pedir todo el
// catálogo — solo hacemos una cuenta en el navegador y actualizamos texto.
const elementosDePrecioARS = [];

document.addEventListener("DOMContentLoaded", () => {
  cargarCatalogo();
  cargarColeccion();
  setInterval(actualizarCotizacionEnPantalla, INTERVALO_ACTUALIZACION_COTIZACION_MS);
});

/**
 * Trae los cuadros en venta desde /catalogo/ y los pinta en la grilla.
 * Si la API falla (backend apagado, CORS, etc.), mostramos un mensaje
 * en vez de dejar la sección en blanco sin explicación.
 */
async function cargarCatalogo() {
  const grid = document.getElementById("for-sale-grid");
  const cotizacionInfo = document.getElementById("cotizacion-info");

  try {
    const [cuadros, cotizacion] = await Promise.all([
      obtenerJSON(`${API_BASE_URL}/catalogo/?status=available`),
      obtenerJSON(`${API_BASE_URL}/catalogo/cotizacion`),
    ]);

    if (cotizacion.disponible) {
      const formateado = new Intl.NumberFormat("es-AR").format(cotizacion.dolar_blue_venta);
      cotizacionInfo.textContent = `Dólar blue: $${formateado}`;
    }

    grid.innerHTML = "";

    if (cuadros.length === 0) {
      grid.innerHTML = `<p class="empty-msg">No hay cuadros disponibles en este momento. Volvé a chequear pronto.</p>`;
      return;
    }

    cuadros.forEach((cuadro) => grid.appendChild(crearFrameCard(cuadro)));
  } catch (error) {
    console.error("Error cargando el catálogo:", error);
    grid.innerHTML = `<p class="empty-msg">No pudimos cargar el catálogo. Probá recargar la página en un momento.</p>`;
  }
}

/**
 * Trae la colección personal desde /coleccion/. Es informativa nomás,
 * sin precios ni acciones de compra.
 */
async function cargarColeccion() {
  const grid = document.getElementById("collection-grid");

  try {
    const items = await obtenerJSON(`${API_BASE_URL}/coleccion/`);
    grid.innerHTML = "";

    if (items.length === 0) {
      grid.innerHTML = `<p class="empty-msg">Todavía no hay piezas cargadas en la colección.</p>`;
      return;
    }

    items.forEach((item) => grid.appendChild(crearCollectionCard(item)));
  } catch (error) {
    console.error("Error cargando la colección:", error);
    grid.innerHTML = `<p class="empty-msg">No pudimos cargar la colección.</p>`;
  }
}

/** Wrapper de fetch que tira un error legible si la respuesta no es 2xx. */
async function obtenerJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} respondió ${response.status}`);
  }
  return response.json();
}

/**
 * Se llama cada 1 minuto (ver setInterval en DOMContentLoaded). Pide SOLO
 * la cotización (liviano, cacheado 1h del lado del backend — no golpea la
 * API externa en cada llamada) y recalcula los precios en ARS ya
 * renderizados, sin volver a pedir todo el catálogo ni recargar la página.
 */
async function actualizarCotizacionEnPantalla() {
  try {
    const cotizacion = await obtenerJSON(`${API_BASE_URL}/catalogo/cotizacion`);
    if (!cotizacion.disponible) return;

    const cotizacionInfo = document.getElementById("cotizacion-info");
    const formateado = new Intl.NumberFormat("es-AR").format(cotizacion.dolar_blue_venta);
    cotizacionInfo.textContent = `Dólar blue: $${formateado}`;

    elementosDePrecioARS.forEach(({ priceUsd, arsEl }) => {
      const nuevoValorArs = Math.round(priceUsd * cotizacion.dolar_blue_venta);
      arsEl.textContent = `≈ $${new Intl.NumberFormat("es-AR").format(nuevoValorArs)} ARS`;
    });
  } catch (error) {
    // Si esta actualización puntual falla (ej. sin internet un instante),
    // dejamos el último precio válido en pantalla en vez de romper nada.
    console.error("No se pudo actualizar la cotización:", error);
  }
}

/** Clona el <template id="frame-card-template"> y lo completa con los datos de un cuadro. */
function crearFrameCard(cuadro) {
  const template = document.getElementById("frame-card-template");
  const node = template.content.cloneNode(true);

  const foto = node.querySelector(".frame-card-photo img");
  const primeraFoto = cuadro.photos?.[0];
  if (primeraFoto) {
    foto.src = primeraFoto.url;
    foto.alt = `${cuadro.brand} ${cuadro.model}`;
  } else {
    foto.closest(".frame-card-photo").style.display = "none";
  }

  const stamp = node.querySelector(".frame-stamp");
  stamp.textContent = ESTADO_LABELS[cuadro.status] ?? cuadro.status;
  stamp.classList.add(`status-${cuadro.status}`);

  node.querySelector(".frame-brand").textContent = cuadro.brand;
  node.querySelector(".frame-model").textContent = cuadro.model;
  node.querySelector(".frame-size").textContent = cuadro.size ?? "";
  node.querySelector(".frame-description").textContent = cuadro.description;

  node.querySelector(".frame-price-usd").textContent =
    `USD ${new Intl.NumberFormat("en-US").format(cuadro.price)}`;

  const arsEl = node.querySelector(".frame-price-ars");
  if (cuadro.price_ars) {
    arsEl.textContent = `≈ $${new Intl.NumberFormat("es-AR").format(cuadro.price_ars)} ARS`;
  }
  // Guardamos la referencia para poder actualizar este precio en ARS
  // cada vez que llegue una cotización nueva (ver actualizarCotizacionEnPantalla).
  elementosDePrecioARS.push({ priceUsd: Number(cuadro.price), arsEl });

  return node;
}

/** Clona el <template id="collection-card-template"> para una pieza de colección. */
function crearCollectionCard(item) {
  const template = document.getElementById("collection-card-template");
  const node = template.content.cloneNode(true);

  const foto = node.querySelector(".collection-card-photo img");
  const primeraFoto = item.photos?.[0];
  if (primeraFoto) {
    foto.src = primeraFoto.url;
    foto.alt = `${item.brand} ${item.model}`;
  } else {
    foto.closest(".collection-card-photo").style.display = "none";
  }

  node.querySelector(".collection-brand-model").textContent = `${item.brand} · ${item.model}`;
  node.querySelector(".collection-caption").textContent = item.caption ?? "";

  return node;
}
