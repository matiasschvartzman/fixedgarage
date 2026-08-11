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
const API_BASE_URL = "https://fixedgarage-production.up.railway.app";
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
  inicializarLightbox();
  inicializarMusica();
});

/**
 * Botón flotante ♪ que abre/cierra un reproductor chico con la playlist
 * de YouTube. El iframe arranca SIN src en el HTML a propósito — recién
 * le ponemos la URL (con autoplay=1) cuando el usuario clickea, porque:
 * 1) así no cargamos YouTube en cada visita si nadie prende la música.
 * 2) el autoplay con sonido necesita un gesto del usuario para que el
 *    navegador lo permita, y el click cuenta como ese gesto.
 * Al cerrar, sacamos el src en vez de solo ocultar el player, así el
 * audio corta de una en vez de seguir sonando de fondo escondido.
 */
function inicializarMusica() {
  const toggle = document.getElementById("music-toggle");
  const player = document.getElementById("music-player");
  const iframe = document.getElementById("music-iframe");

  toggle.addEventListener("click", () => {
    const estaAbierto = !player.hidden;

    if (estaAbierto) {
      iframe.src = "";
      player.hidden = true;
      toggle.classList.remove("is-active");
      toggle.setAttribute("aria-expanded", "false");
    } else {
      iframe.src = iframe.dataset.src;
      player.hidden = false;
      toggle.classList.add("is-active");
      toggle.setAttribute("aria-expanded", "true");
    }
  });
}

/**
 * Zoom de fotos: un solo lightbox compartido por todas las cards (de
 * cuadros y de colección), con un listener delegado en document en vez
 * de uno por <img> — así funciona también para las cards que se agregan
 * después de la carga inicial, sin tener que re-engancharlo cada vez.
 *
 * Además de abrir la foto en grande, guarda el resto de fotos de ESA
 * misma card para poder pasar de una a otra sin cerrar el zoom (con los
 * botones, las flechas del teclado, o deslizando).
 */
function inicializarLightbox() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = lightbox.querySelector(".lightbox-img");
  const closeBtn = lightbox.querySelector(".lightbox-close");
  const prevBtn = lightbox.querySelector(".lightbox-nav-btn.prev");
  const nextBtn = lightbox.querySelector(".lightbox-nav-btn.next");
  const counter = lightbox.querySelector(".lightbox-counter");

  let imagenesCard = []; // <img> de la card actualmente abierta
  let indiceActual = 0;

  const mostrarActual = () => {
    const img = imagenesCard[indiceActual];
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;

    const hayVarias = imagenesCard.length > 1;
    prevBtn.hidden = !hayVarias;
    nextBtn.hidden = !hayVarias;
    counter.hidden = !hayVarias;
    if (hayVarias) counter.textContent = `${indiceActual + 1} / ${imagenesCard.length}`;
  };

  const abrir = (imagenes, indiceInicial) => {
    imagenesCard = imagenes;
    indiceActual = indiceInicial;
    mostrarActual();
    lightbox.hidden = false;
  };

  const cerrar = () => {
    lightbox.hidden = true;
    lightboxImg.src = "";
    imagenesCard = [];
  };

  const anterior = () => {
    if (imagenesCard.length <= 1) return;
    indiceActual = (indiceActual - 1 + imagenesCard.length) % imagenesCard.length;
    mostrarActual();
  };

  const siguiente = () => {
    if (imagenesCard.length <= 1) return;
    indiceActual = (indiceActual + 1) % imagenesCard.length;
    mostrarActual();
  };

  document.addEventListener("click", (evento) => {
    const img = evento.target.closest(".frame-card-photo-slide img, .collection-card-photo img");
    if (!img) return;

    // Si el click viene de soltar un drag del carrusel, no es una
    // intención de hacer zoom — lo ignoramos.
    const track = img.closest(".frame-card-photos-track");
    if (track && track.dataset.arrastrado === "1") {
      track.dataset.arrastrado = "";
      return;
    }

    // Buscamos el resto de fotos de la MISMA card: si tiene carrusel
    // (frame-card), son las <img> hermanas dentro del mismo track; si
    // es una card de colección (una sola foto), es solo esta.
    const imagenes = track
      ? [...track.querySelectorAll(".frame-card-photo-slide img")]
      : [img];

    abrir(imagenes, imagenes.indexOf(img));
  });

  closeBtn.addEventListener("click", cerrar);
  prevBtn.addEventListener("click", anterior);
  nextBtn.addEventListener("click", siguiente);
  lightbox.addEventListener("click", (evento) => {
    if (evento.target === lightbox) cerrar(); // click en el fondo, no en la foto
  });
  document.addEventListener("keydown", (evento) => {
    if (lightbox.hidden) return;
    if (evento.key === "Escape") cerrar();
    if (evento.key === "ArrowLeft") anterior();
    if (evento.key === "ArrowRight") siguiente();
  });

  // Deslizar sobre la foto ampliada (mouse o touch, vía Pointer Events)
  // para pasar a la siguiente/anterior sin cerrar el zoom.
  let xInicialSwipe = null;
  lightboxImg.addEventListener("pointerdown", (evento) => {
    xInicialSwipe = evento.clientX;
  });
  lightboxImg.addEventListener("pointerup", (evento) => {
    if (xInicialSwipe === null) return;
    const delta = evento.clientX - xInicialSwipe;
    xInicialSwipe = null;
    if (Math.abs(delta) < 40) return; // movimiento chico: no cuenta como swipe
    if (delta < 0) siguiente();
    else anterior();
  });
}

/**
 * Trae los cuadros en venta desde /catalogo/ y los pinta en la grilla.
 * Si la API falla (backend apagado, CORS, etc.), mostramos un mensaje
 * en vez de dejar la sección en blanco sin explicación.
 */
async function cargarCatalogo() {
  const grid = document.getElementById("for-sale-grid");
  const soldGrid = document.getElementById("sold-grid");
  const cotizacionInfo = document.getElementById("cotizacion-info");

  try {
    const [cuadros, cotizacion] = await Promise.all([
      obtenerJSON(`${API_BASE_URL}/catalogo/`),
      obtenerJSON(`${API_BASE_URL}/catalogo/cotizacion`),
    ]);

    if (cotizacion.disponible) {
      const formateado = new Intl.NumberFormat("es-AR").format(cotizacion.dolar_blue_venta);
      cotizacionInfo.textContent = `Dólar blue: $${formateado}`;
    }

    // Separamos vendidos del resto: "En venta" muestra disponibles/reservados,
    // "Vendidos" es una sección aparte con el sello puesto.
    const disponibles = cuadros.filter((cuadro) => cuadro.status !== "sold");
    const vendidos = cuadros.filter((cuadro) => cuadro.status === "sold");

    grid.innerHTML = "";
    if (disponibles.length === 0) {
      grid.innerHTML = `<p class="empty-msg">No hay cuadros disponibles en este momento. Volvé a chequear pronto.</p>`;
    } else {
      disponibles.forEach((cuadro) => grid.appendChild(crearFrameCard(cuadro)));
    }

    soldGrid.innerHTML = "";
    if (vendidos.length === 0) {
      soldGrid.innerHTML = `<p class="empty-msg">Todavía no hay cuadros vendidos para mostrar.</p>`;
    } else {
      vendidos.forEach((cuadro) => soldGrid.appendChild(crearFrameCard(cuadro)));
    }
  } catch (error) {
    console.error("Error cargando el catálogo:", error);
    grid.innerHTML = `<p class="empty-msg">No pudimos cargar el catálogo. Probá recargar la página en un momento.</p>`;
    soldGrid.innerHTML = "";
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

function habilitarArrastreDesktop(track) {
  let arrastrando = false;
  let capturado = false; // recién true cuando el movimiento confirma que es un drag
  let posicionInicialX = 0;
  let scrollInicial = 0;
  let pointerIdActual = null;

  track.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType !== "mouse") return;
    arrastrando = true;
    capturado = false;
    track.dataset.arrastrado = "";
    track.style.scrollBehavior = "auto";
    posicionInicialX = evento.clientX;
    scrollInicial = track.scrollLeft;
    pointerIdActual = evento.pointerId;
    // OJO: no llamamos setPointerCapture acá. Si lo hacemos en todo
    // pointerdown (incluyendo un simple click sin mover el mouse), el
    // navegador redirige el "click" posterior a `track` en vez de a la
    // <img> de abajo, y el lightbox nunca encuentra la foto para abrir.
    // Por eso esperamos a confirmar que hay arrastre real (ver abajo).
  });

  track.addEventListener("pointermove", (evento) => {
    if (!arrastrando) return;
    const delta = evento.clientX - posicionInicialX;

    if (!capturado) {
      if (Math.abs(delta) <= 5) return; // todavía no sabemos si es drag o click
      capturado = true;
      track.dataset.arrastrado = "1";
      track.classList.add("is-dragging");
      track.setPointerCapture(pointerIdActual);
    }

    track.scrollLeft = scrollInicial - delta;
  });

  const terminarArrastre = () => {
    if (!arrastrando) return;
    arrastrando = false;
    track.classList.remove("is-dragging");
    track.style.scrollBehavior = "smooth";
    const indiceMasCercano = Math.round(track.scrollLeft / track.clientWidth);
    track.scrollTo({ left: indiceMasCercano * track.clientWidth, behavior: "smooth" });
  };

  track.addEventListener("pointerup", terminarArrastre);
  track.addEventListener("pointerleave", terminarArrastre);
}

/** Clona el <template id="frame-card-template"> y lo completa con los datos de un cuadro. */
function crearFrameCard(cuadro) {
  const template = document.getElementById("frame-card-template");
  const node = template.content.cloneNode(true);

  const photosContainer = node.querySelector(".frame-card-photos");
  const track = node.querySelector(".frame-card-photos-track");
  const prevBtn = node.querySelector(".frame-card-nav-btn.prev");
  const nextBtn = node.querySelector(".frame-card-nav-btn.next");
  const dotsContainer = node.querySelector(".frame-card-dots");
  const fotos = cuadro.photos ?? [];

  if (fotos.length === 0) {
    photosContainer.style.display = "none";
  } else {
    fotos.forEach((foto) => {
      const slide = document.createElement("div");
      slide.className = "frame-card-photo-slide";

      const img = document.createElement("img");
      img.src = foto.url;
      img.alt = `${cuadro.brand} ${cuadro.model}`;
      img.loading = "lazy";

      slide.appendChild(img);
      track.appendChild(slide);
    });

    if (fotos.length > 1) {
      const dots = fotos.map((_, indice) => {
        const dot = document.createElement("span");
        dot.className = "frame-card-dot";
        if (indice === 0) dot.classList.add("active");
        dotsContainer.appendChild(dot);
        return dot;
      });

      const marcarDotActivo = () => {
        const indiceActual = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((dot, indice) => dot.classList.toggle("active", indice === indiceActual));
      };

      const irASlide = (indice) => {
        const indiceValido = Math.max(0, Math.min(indice, fotos.length - 1));
        track.scrollTo({ left: indiceValido * track.clientWidth, behavior: "smooth" });
      };

      prevBtn.addEventListener("click", () => {
        irASlide(Math.round(track.scrollLeft / track.clientWidth) - 1);
      });
      nextBtn.addEventListener("click", () => {
        irASlide(Math.round(track.scrollLeft / track.clientWidth) + 1);
      });
      track.addEventListener("scroll", marcarDotActivo);

      habilitarArrastreDesktop(track);
    } else {
      prevBtn.style.display = "none";
      nextBtn.style.display = "none";
    }
  }

  const stamp = node.querySelector(".frame-stamp");
  stamp.textContent = ESTADO_LABELS[cuadro.status] ?? cuadro.status;
  stamp.classList.add(`status-${cuadro.status}`);

  node.querySelector(".frame-brand").textContent = cuadro.brand;
  node.querySelector(".frame-model").textContent = cuadro.model;
  node.querySelector(".frame-size").textContent = cuadro.size ?? "";

  const condicionEl = node.querySelector(".frame-condition");
  if (cuadro.condition !== null && cuadro.condition !== undefined) {
    condicionEl.textContent = `${Number(cuadro.condition).toFixed(2)}/10`;
  }
  node.querySelector(".frame-description").textContent = cuadro.description;

  node.querySelector(".frame-price-usd").textContent =
    `${cuadro.currency} ${new Intl.NumberFormat("en-US").format(cuadro.price)}`;

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
