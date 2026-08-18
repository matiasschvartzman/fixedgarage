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

// Todos los cuadros del catálogo (en venta + vendidos), indexados por id
// como string. Lo llena cargarCatalogo() y lo usa el modal de detalle
// para saber qué mostrar cuando se hace click en una card o cuando se
// entra directo con ?cuadro=ID en la URL.
const cuadrosPorId = new Map();

document.addEventListener("DOMContentLoaded", () => {
  const detailModal = inicializarDetailModal();
  // No usamos await acá: cargarColeccion() no depende de esto y así
  // arranca en paralelo, igual que antes. El deep-link (?cuadro=ID) recién
  // puede resolverse una vez que el catálogo terminó de llegar.
  cargarCatalogo().then(() => abrirCuadroDesdeUrl(detailModal));
  cargarColeccion();
  setInterval(actualizarCotizacionEnPantalla, INTERVALO_ACTUALIZACION_COTIZACION_MS);
  inicializarLightbox();
  inicializarMusica();
});

/**
 * Botón flotante ♪ con la playlist de YouTube. Arranca sola al cargar
 * la página, pero MUTEADA — ningún navegador deja hacer autoplay con
 * sonido sin que haya habido antes una interacción real del usuario en
 * la página, no es algo que se pueda evitar desde acá. Para que el
 * visitante escuche música lo antes posible sin tener que buscar el
 * botón, la desmuteamos sola en el primer click/toque que haga en
 * CUALQUIER parte del sitio (no hace falta que sea el ♪).
 *
 * El botón sigue sirviendo para cerrarla del todo (corta el audio, no
 * la deja sonando de fondo escondida) o volver a abrirla — si la abre
 * a mano, arranca directamente con sonido, porque ese click ya es un
 * gesto válido para el navegador.
 */
function inicializarMusica() {
  // Playlist guardada real (no un Mix): álbum "SKANKING & JACKING" de
  // STAND HIGH PATROL. Al ser una lista fija y ordenada, el índice al
  // azar de abajo funciona de verdad (a diferencia de un Mix "RD...",
  // que siempre arranca en la misma canción semilla sin importar qué
  // índice se le mande).
  const LIST_ID = "PL17alAg5CIXHx6L9sF3CK5_dA7rgBtthH";
  // No sabemos el largo exacto sin pegarle a la Data API de YouTube (de
  // más está para esto). Un álbum ronda esta cantidad de temas; si el
  // índice se pasa del largo real, YouTube lo clampea sin romper nada.
  const LARGO_APROX_PLAYLIST = 15;
  const toggle = document.getElementById("music-toggle");
  const player = document.getElementById("music-player");
  const iframe = document.getElementById("music-iframe");

  const armarSrc = (muteado) => {
    const indiceAlAzar = Math.floor(Math.random() * LARGO_APROX_PLAYLIST);
    return `https://www.youtube.com/embed/videoseries?list=${LIST_ID}&index=${indiceAlAzar}&autoplay=1&enablejsapi=1&playsinline=1&mute=${muteado ? 1 : 0}`;
  };

  const mostrarActivo = (activo) => {
    player.hidden = !activo;
    toggle.classList.toggle("is-active", activo);
    toggle.setAttribute("aria-expanded", String(activo));
  };

  const abrir = (muteado) => {
    iframe.src = armarSrc(muteado);
    mostrarActivo(true);
  };

  const cerrar = () => {
    iframe.src = "";
    mostrarActivo(false);
  };

  const desmutear = () => {
    if (player.hidden || !iframe.contentWindow) return;
    // Comando del IFrame Player de YouTube vía postMessage: no hace
    // falta cargar su librería JS completa para mandarle esto.
    const mandar = (func) =>
      iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args: [] }), "https://www.youtube.com");
    mandar("unMute");
    mandar("playVideo");
  };

  abrir(true); // arranca sola, muteada
  document.addEventListener("pointerdown", desmutear, { once: true });

  toggle.addEventListener("click", () => {
    if (player.hidden) {
      abrir(false); // gesto directo del usuario: arranca con sonido de una
    } else {
      cerrar();
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
 * Modal de detalle de un cuadro: fotos SIN recortar, ficha completa
 * (marca, modelo, talle, estado, descripción) y precio. Es un modal único
 * y fijo (#detail-modal en index.html), igual de espíritu que el
 * lightbox — se repuebla en JS cada vez que se abre.
 *
 * Además sincroniza la URL con history.pushState: abrir agrega
 * ?cuadro=ID, cerrar lo saca, y navegar con atrás/adelante del navegador
 * (evento popstate) abre o cierra el modal según corresponda. Así un
 * link tipo fixedgarage.netlify.app/?cuadro=5 sirve para compartir en
 * redes: quien lo abre llega directo a esa pieza (ver abrirCuadroDesdeUrl,
 * que se llama una sola vez al cargar la página).
 *
 * El carrusel de fotos reutiliza habilitarArrastreDesktop() tal cual —
 * es la misma función genérica que ya usan las cards del catálogo, no
 * hizo falta tocarla. El resto (armar slides, dots, flechas) es una
 * versión propia adaptada a que este modal se repuebla en cada apertura,
 * a diferencia de una card que arma su carrusel una sola vez.
 */
function inicializarDetailModal() {
  const modal = document.getElementById("detail-modal");
  const backdrop = modal.querySelector(".detail-modal-backdrop");
  const closeBtn = modal.querySelector(".detail-modal-close");
  const track = modal.querySelector(".detail-modal-photos-track");
  const prevBtn = modal.querySelector(".detail-modal-nav-btn.prev");
  const nextBtn = modal.querySelector(".detail-modal-nav-btn.next");
  const dotsContainer = modal.querySelector(".detail-modal-dots");
  const stamp = modal.querySelector(".detail-modal-stamp");
  const titleEl = modal.querySelector(".detail-modal-title");
  const brandEl = modal.querySelector(".detail-modal-brand");
  const modelEl = modal.querySelector(".detail-modal-model");
  const sizeEl = modal.querySelector(".detail-modal-size");
  const condicionEl = modal.querySelector(".detail-modal-condition");
  const descripcionEl = modal.querySelector(".detail-modal-description");
  const precioUsdEl = modal.querySelector(".detail-modal-price-usd");
  const precioArsEl = modal.querySelector(".detail-modal-price-ars");

  let totalFotos = 0;

  const irASlide = (indice) => {
    const indiceValido = Math.max(0, Math.min(indice, totalFotos - 1));
    track.scrollTo({ left: indiceValido * track.clientWidth, behavior: "smooth" });
  };

  const marcarDotActivo = () => {
    const indiceActual = Math.round(track.scrollLeft / track.clientWidth);
    [...dotsContainer.children].forEach((dot, indice) => dot.classList.toggle("active", indice === indiceActual));
  };

  // Estos handlers se enganchan UNA sola vez (el modal es un único
  // elemento fijo que se repuebla, no se clona): prev/next/track son
  // siempre los mismos nodos, solo cambian las fotos adentro.
  prevBtn.addEventListener("click", () => irASlide(Math.round(track.scrollLeft / track.clientWidth) - 1));
  nextBtn.addEventListener("click", () => irASlide(Math.round(track.scrollLeft / track.clientWidth) + 1));
  track.addEventListener("scroll", marcarDotActivo);
  habilitarArrastreDesktop(track);

  const renderFotos = (fotos, alt) => {
    track.innerHTML = "";
    dotsContainer.innerHTML = "";
    totalFotos = fotos.length;

    fotos.forEach((foto) => {
      const slide = document.createElement("div");
      slide.className = "detail-modal-photo-slide";
      const img = document.createElement("img");
      img.src = foto.url;
      img.alt = alt;
      img.loading = "lazy";
      slide.appendChild(img);
      track.appendChild(slide);
    });
    track.scrollLeft = 0;

    const hayVarias = totalFotos > 1;
    prevBtn.hidden = !hayVarias;
    nextBtn.hidden = !hayVarias;
    dotsContainer.hidden = !hayVarias;

    if (hayVarias) {
      fotos.forEach((_, indice) => {
        const dot = document.createElement("span");
        dot.className = "detail-modal-dot";
        if (indice === 0) dot.classList.add("active");
        dotsContainer.appendChild(dot);
      });
    }
  };

  const sincronizarUrl = (cuadroId) => {
    const url = new URL(window.location.href);
    if (cuadroId === null) {
      if (!url.searchParams.has("cuadro")) return; // ya estaba limpia, no ensuciamos el historial
      url.searchParams.delete("cuadro");
    } else {
      url.searchParams.set("cuadro", cuadroId);
    }
    history.pushState({ cuadroId }, "", url);
  };

  const abrir = (cuadro, { actualizarUrl = true } = {}) => {
    const alt = `${cuadro.brand} ${cuadro.model}`;
    renderFotos(cuadro.photos ?? [], alt);

    stamp.textContent = ESTADO_LABELS[cuadro.status] ?? cuadro.status;
    stamp.className = "detail-modal-stamp"; // limpia el status-* de la apertura anterior
    stamp.classList.add(`status-${cuadro.status}`);

    titleEl.textContent = alt;
    brandEl.textContent = cuadro.brand;
    modelEl.textContent = cuadro.model;
    sizeEl.textContent = cuadro.size ?? "";
    condicionEl.textContent =
      cuadro.condition !== null && cuadro.condition !== undefined ? `${Number(cuadro.condition).toFixed(2)}/10` : "";
    descripcionEl.textContent = cuadro.description ?? "";

    precioUsdEl.textContent = `${cuadro.currency} ${new Intl.NumberFormat("en-US").format(cuadro.price)}`;
    precioArsEl.textContent = cuadro.price_ars
      ? `≈ $${new Intl.NumberFormat("es-AR").format(cuadro.price_ars)} ARS`
      : "";

    modal.hidden = false;
    document.body.style.overflow = "hidden"; // evita el scroll de fondo con el modal abierto

    if (actualizarUrl) sincronizarUrl(cuadro.id);
  };

  const cerrar = ({ actualizarUrl = true } = {}) => {
    if (modal.hidden) return;
    modal.hidden = true;
    track.innerHTML = "";
    document.body.style.overflow = "";

    if (actualizarUrl) sincronizarUrl(null);
  };

  closeBtn.addEventListener("click", () => cerrar());
  backdrop.addEventListener("click", () => cerrar());

  document.addEventListener("keydown", (evento) => {
    if (modal.hidden) return;
    if (evento.key === "Escape") cerrar();
    if (evento.key === "ArrowLeft") irASlide(Math.round(track.scrollLeft / track.clientWidth) - 1);
    if (evento.key === "ArrowRight") irASlide(Math.round(track.scrollLeft / track.clientWidth) + 1);
  });

  // Click delegado en las cards del catálogo ("En venta" y "Vendidos"
  // comparten el mismo template .frame-card, así que ambas quedan
  // clickeables acá). Si el click cae dentro de .frame-card-photos (la
  // foto, sus flechas o los dots del carrusel chico), lo dejamos pasar
  // de largo: esa zona sigue siendo del lightbox de zoom, sin tocarlo.
  document.addEventListener("click", (evento) => {
    const card = evento.target.closest(".frame-card");
    if (!card) return;
    if (evento.target.closest(".frame-card-photos")) return;

    const cuadro = cuadrosPorId.get(card.dataset.cuadroId);
    if (!cuadro) return;
    abrir(cuadro);
  });

  // Atrás/adelante del navegador: si el usuario navega así, sincronizamos
  // el modal con lo que la URL diga en ese momento (sin volver a pushear).
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(window.location.search).get("cuadro");
    const cuadro = id ? cuadrosPorId.get(id) : null;
    if (cuadro) {
      abrir(cuadro, { actualizarUrl: false });
    } else {
      cerrar({ actualizarUrl: false });
    }
  });

  return { abrir, cerrar };
}

/**
 * Deep link: si la página se abrió con ?cuadro=ID en la URL (ej. un
 * sticker de link en una story de Instagram apuntando a una pieza
 * puntual), abre el modal de detalle de ESE cuadro apenas termina de
 * cargar el catálogo — sin que haga falta ningún click.
 *
 * Se llama una sola vez, después de que cargarCatalogo() resuelve (ver
 * DOMContentLoaded), porque hasta ese momento cuadrosPorId está vacío.
 * Si el id no viene, no existe, o el catálogo no pudo cargar, no hace
 * nada — la persona simplemente ve el catálogo general.
 */
function abrirCuadroDesdeUrl(detailModal) {
  const id = new URLSearchParams(window.location.search).get("cuadro");
  if (!id) return;

  const cuadro = cuadrosPorId.get(id);
  if (!cuadro) return;

  // No actualizamos la URL: ya trae el ?cuadro=ID puesto por quien
  // compartió el link, no hace falta pushear una entrada nueva encima.
  detailModal.abrir(cuadro, { actualizarUrl: false });
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

    // Guardamos TODOS los cuadros (en venta + vendidos) por id, para que
    // el modal de detalle pueda abrir cualquiera de los dos sin volver a
    // pedirle nada a la API — tanto desde un click en una card como desde
    // un link directo con ?cuadro=ID.
    cuadros.forEach((cuadro) => cuadrosPorId.set(String(cuadro.id), cuadro));

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

  // Id del cuadro en el propio DOM de la card: así el click delegado del
  // modal de detalle (ver inicializarDetailModal) sabe qué cuadro mostrar
  // sin tener que reconstruirlo a mano desde los textos ya pintados.
  node.querySelector(".frame-card").dataset.cuadroId = cuadro.id;

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
