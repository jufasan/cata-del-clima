// Cata del Clima – lógica del panel
const TZ = "America/Argentina/Catamarca";

const LOCALIDADES = [
  // Catamarca
  { n: "S. F. V. de Catamarca", d: "Capital", lat: -28.469, lon: -65.785, prov: "CAT" },
  { n: "Valle Viejo", d: "Valle Viejo · Valle Central", lat: -28.48, lon: -65.72, prov: "CAT" },
  { n: "Recreo", d: "Dpto. La Paz · sudeste", lat: -29.28, lon: -65.06, prov: "CAT" },
  { n: "El Alto", d: "Dpto. El Alto · este", lat: -28.31, lon: -65.37, prov: "CAT" },
  { n: "Andalgalá", d: "Dpto. Andalgalá · centro-norte", lat: -27.58, lon: -66.317, prov: "CAT" },
  { n: "Pomán / Saujil", d: "Dpto. Pomán · centro-oeste", lat: -28.39, lon: -66.22, prov: "CAT" },
  { n: "Belén", d: "Dpto. Belén · oeste", lat: -27.65, lon: -67.03, prov: "CAT" },
  { n: "Santa María", d: "Dpto. Santa María · norte", lat: -26.696, lon: -66.048, prov: "CAT" },
  { n: "Tinogasta", d: "Dpto. Tinogasta · oeste", lat: -28.067, lon: -67.567, prov: "CAT" },
  { n: "Fiambalá", d: "Dpto. Tinogasta · oeste", lat: -27.687, lon: -67.615, prov: "CAT" },
  { n: "Antofagasta de la Sierra", d: "Puna · noroeste", lat: -26.06, lon: -67.41, prov: "CAT" },
  // Vecinas
  { n: "San Miguel de Tucumán", lat: -26.808, lon: -65.218, prov: "Tucumán" },
  { n: "Cafayate", lat: -26.073, lon: -65.976, prov: "Salta" },
  { n: "Santiago del Estero", lat: -27.795, lon: -64.261, prov: "Sgo. del Estero" },
  { n: "La Rioja", lat: -29.413, lon: -66.856, prov: "La Rioja" },
  { n: "Chilecito", lat: -29.163, lon: -67.498, prov: "La Rioja" },
  { n: "Deán Funes", lat: -30.42, lon: -64.35, prov: "Córdoba" },
];

const MODELOS = [
  { id: "ecmwf_ifs025", n: "ECMWF" },
  { id: "gfs_seamless", n: "GFS" },
  { id: "icon_seamless", n: "ICON" },
];
const VARS = ["precipitation", "weather_code", "wind_gusts_10m", "cape"];
const ORDEN = { verde: 0, amarillo: 1, naranja: 2, rojo: 3 };

let datosModelos = null;
let mapa, capaMarcadores, capaAlertas;

// ---------- utilidades ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtHora = (d) => new Date(d).toLocaleString("es-AR", { timeZone: TZ, weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const ahoraTxt = () => new Date().toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

// ---------- 1. Alertas oficiales ----------
async function cargarOficial() {
  const box = $("#estado-oficial");
  const setHero = (clase, big, sub) => { box.className = "hero " + clase; $("#hero-big").innerHTML = big; $("#hero-sub").innerHTML = sub; };
  try {
    const r = await fetch("/api/alertas", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    $("#hora-oficial").textContent = ahoraTxt();
    const alertas = d.alertas || [];
    const avisos = d.avisosCortoPlazo || [];

    const feedOk = !d.estado || d.estado.alertas === "ok";
    const avisoCorto = d.estado && d.estado.cortoPlazo === "error"
      ? " <span style='opacity:.75'>(No se pudieron consultar los avisos a corto plazo.)</span>" : "";
    if (!alertas.length && !avisos.length) {
      if (!feedOk) {
        setHero("error", "Sin conexión con el SMN", "Consultá en <a href='https://www.smn.gob.ar/alertas' target='_blank' rel='noopener'>smn.gob.ar/alertas</a>");
      } else {
        setHero("verde", "Sin alertas vigentes", "El SMN no tiene alertas para Catamarca en este momento." + avisoCorto);
      }
    } else {
      const peor = alertas.reduce((m, a) => (ORDEN[a.nivel || "amarillo"] > ORDEN[m] ? a.nivel || "amarillo" : m), avisos.length ? "naranja" : "amarillo");
      const n = alertas.length + avisos.length;
      const eventos = [...new Set(alertas.map((a) => a.evento).filter(Boolean))].join(", ");
      const col = { amarillo: ["amarilla", "amarillas"], naranja: ["naranja", "naranja"], rojo: ["roja", "rojas"] }[peor];
      setHero(peor, n === 1 ? `1 alerta ${col[0]}` : `${n} alertas ${col[1]}`,
        `${esc(eventos || "Avisos a corto plazo")} · afecta a Catamarca`);
    }

    const lista = $("#lista-alertas");
    lista.innerHTML =
      avisos.map((a) => `
        <div class="alerta">
          <div class="al-top"><span class="nivel-pill naranja">Corto plazo</span><h4>${esc(a.titulo)}</h4></div>
          <p>${esc(a.descripcion)}</p>
          <p class="meta">Emitido ${a.fecha ? esc(fmtHora(a.fecha)) : "–"} ${a.link ? `· <a href="${esc(a.link)}" target="_blank" rel="noopener">ver en SMN</a>` : ""}</p>
        </div>`).join("") +
      alertas.map((a) => `
        <div class="alerta">
          <div class="al-top"><span class="nivel-pill ${esc(a.nivel || "amarillo")}">${esc(a.nivel || "alerta")}</span><h4>${esc(a.evento || a.titulo)}</h4></div>
          ${a.descripcion ? `<p>${esc(a.descripcion)}</p>` : ""}
          ${a.instruccion ? `<p><i>${esc(a.instruccion)}</i></p>` : ""}
          <p class="meta">📍 ${esc(a.areas.join(", ") || "–")}</p>
          <p class="meta">🕒 ${a.inicio ? esc(fmtHora(a.inicio)) : "–"} → ${a.fin ? esc(fmtHora(a.fin)) : "–"}</p>
        </div>`).join("");

    dibujarPoligonos(alertas);
  } catch (e) {
    setHero("error", "Sin conexión con el SMN", "Consultá en <a href='https://www.smn.gob.ar/alertas' target='_blank' rel='noopener'>smn.gob.ar/alertas</a>");
    console.warn(e);
  }
}

// ---------- 2. Modelos ----------
async function cargarModelos() {
  const base = "https://api.open-meteo.com/v1/forecast";
  const p = new URLSearchParams({
    latitude: LOCALIDADES.map((l) => l.lat).join(","),
    longitude: LOCALIDADES.map((l) => l.lon).join(","),
    hourly: VARS.join(","),
    models: MODELOS.map((m) => m.id).join(","),
    timezone: TZ,
    forecast_days: "3",
    wind_speed_unit: "kmh",
  });
  try {
    const r = await fetch(`${base}?${p}`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    let d = await r.json();
    if (!Array.isArray(d)) d = [d];
    datosModelos = d;
    $("#hora-modelos").textContent = ahoraTxt();
    renderModelos();
  } catch (e) {
    $("#resumen-modelos").className = "resumen error";
    $("#resumen-modelos").textContent = "No se pudieron cargar los modelos en este momento. Probá de nuevo en unos minutos.";
    console.warn(e);
  }
}

function analizar(loc, horas) {
  const h = loc.hourly;
  const ahora = Date.now();
  const idx = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = Date.parse(h.time[i] + ":00" + offsetTZ(loc));
    if (t >= ahora - 3600e3 && t <= ahora + horas * 3600e3) idx.push(i);
  }
  const porModelo = MODELOS.map((m) => {
    const g = (v) => h[`${v}_${m.id}`] || [];
    const pr = g("precipitation"), wc = g("weather_code"), gu = g("wind_gusts_10m"), ca = g("cape");
    let tormenta = false, granizo = false, primeraTormenta = null, lluviaTot = 0, lluviaMax = 0, rafMax = null, capeMax = null, hayDatos = false;
    for (const i of idx) {
      const p = pr[i], w = wc[i], gg = gu[i], c = ca[i];
      if (p != null || w != null) hayDatos = true;
      if (p != null) { lluviaTot += p; lluviaMax = Math.max(lluviaMax, p); }
      if (gg != null) rafMax = Math.max(rafMax ?? 0, gg);
      if (c != null) capeMax = Math.max(capeMax ?? 0, c);
      const esTormenta = (w != null && w >= 95) || (c != null && c >= 1500 && (p ?? 0) >= 0.5);
      if (esTormenta) {
        tormenta = true;
        if (!primeraTormenta) primeraTormenta = h.time[i];
        if (w === 96 || w === 99 || (c != null && c >= 2500)) granizo = true;
      }
    }
    return { modelo: m.n, hayDatos, tormenta, granizo, primeraTormenta, lluviaTot, lluviaMax, rafMax, capeMax };
  }).filter((x) => x.hayDatos);

  const n = porModelo.length || 1;
  const cuenta = (f) => porModelo.filter(f).length;
  const tor = cuenta((x) => x.tormenta);
  const gra = cuenta((x) => x.granizo);
  const vie = cuenta((x) => (x.rafMax ?? 0) >= 70);
  const vieF = cuenta((x) => (x.rafMax ?? 0) >= 90);
  const llu = cuenta((x) => x.lluviaMax >= 10 || x.lluviaTot >= 40);
  const max = (k) => Math.max(...porModelo.map((x) => x[k] ?? 0));
  const primeras = porModelo.map((x) => x.primeraTormenta).filter(Boolean).sort();

  // Nivel según cuántos modelos coinciden
  //  verde   = ningún modelo ve tormenta, viento fuerte ni lluvia fuerte
  //  amarillo= lo ve 1 solo modelo (posible, poca coincidencia)
  //  naranja = 2 o 3 modelos coinciden en tormenta, viento ≥70 o lluvia fuerte (probable)
  //  rojo    = 2 o 3 coinciden en tormenta Y además 2+ ven granizo o ráfagas ≥90 (probable y fuerte)
  const mayoria = Math.min(2, n);
  let nivel = "verde";
  if (tor >= 1 || vie >= 1 || llu >= 1) nivel = "amarillo";
  if (tor >= mayoria || vie >= mayoria || llu >= mayoria) nivel = "naranja";
  if ((tor >= mayoria && gra >= mayoria) || vieF >= mayoria) nivel = "rojo";

  return { n, tor, gra, vie, vieF, llu, nivel, porModelo,
    lluviaMax: max("lluviaTot"), rafMax: max("rafMax"), capeMax: max("capeMax"),
    primera: primeras[0] || null };
}

function offsetTZ(loc) {
  // Open-Meteo devuelve horas locales; usamos el offset que informa
  const s = loc.utc_offset_seconds ?? -10800;
  const sign = s <= 0 ? "-" : "+";
  const a = Math.abs(s);
  return `${sign}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String((a % 3600) / 60).padStart(2, "0")}`;
}

const lista = (arr) => arr.length > 1 ? arr.slice(0, -1).join(", ") + " y " + arr[arr.length - 1] : arr.join("");
function frase(a, horas) {
  const tor = a.tor, n = a.n;
  if (a.nivel === "verde") return `Ningún modelo ve tormentas, viento ni lluvia fuerte en las próximas ${horas} h.`;
  if (a.nivel === "amarillo") {
    const que = [a.tor && "tormenta", a.vie && "ráfagas fuertes", a.llu && "lluvia fuerte"].filter(Boolean);
    return `Solo 1 de ${n} modelos ve ${lista(que)}. Puede pasar, pero hay poca coincidencia.`;
  }
  if (a.nivel === "naranja") {
    const que = [a.tor >= 2 && "tormenta", a.vie >= 2 && "ráfagas fuertes", a.llu >= 2 && "lluvia fuerte"].filter(Boolean);
    return `${Math.max(tor, a.vie, a.llu)} de ${n} modelos coinciden en ${lista(que)}. Es probable.`;
  }
  return `${tor} de ${n} modelos coinciden en tormenta${a.gra >= 2 ? " con posible granizo" : ""}${a.vieF >= 2 ? " y ráfagas de 90 km/h o más" : ""}. Es probable y podría ser fuerte.`;
}

const TXT_NIVEL = { verde: "Tranquilo", amarillo: "Posible", naranja: "Probable", rojo: "Probable y fuerte" };

function renderModelos() {
  if (!datosModelos) return;
  const horas = +$("#horas").value;
  const res = LOCALIDADES.map((l, i) => ({ l, a: analizar(datosModelos[i], horas) }));

  const fila = ({ l, a }) => {
    const sen = [];
    if (a.tor) sen.push(`<span class="chip">⛈️ Tormenta ${a.tor}/${a.n}</span>`);
    if (a.gra) sen.push(`<span class="chip">🧊 Granizo ${a.gra}/${a.n}</span>`);
    if (a.vie) sen.push(`<span class="chip">💨 Ráfagas fuertes ${a.vie}/${a.n}</span>`);
    if (a.llu) sen.push(`<span class="chip">🌧️ Lluvia fuerte ${a.llu}/${a.n}</span>`);
    const si = a.porModelo.filter((x) => x.tormenta).map((x) => x.modelo);
    const no = a.porModelo.filter((x) => !x.tormenta).map((x) => x.modelo);
    const quien = a.tor ? `<div class="small">Ven tormenta: <b>${esc(lista(si))}</b>${no.length ? ` · no la ve${no.length > 1 ? "n" : ""}: ${esc(lista(no))}` : ""}</div>` : "";
    return `<div class="loc-card ${a.nivel}">
      <div class="loc-top">
        <div><div class="loc-n">${esc(l.n)}</div><div class="loc-p">${esc(l.prov !== "CAT" ? l.prov : l.d || "")}</div></div>
        <span class="pill">${TXT_NIVEL[a.nivel]}</span>
      </div>
      <div class="frase">${frase(a, horas)}</div>
      ${sen.length ? `<div class="chips">${sen.join("")}</div>` : ""}
      ${quien}
      ${a.primera ? `<div class="small">Primera señal de tormenta: <b>${esc(fmtHora(a.primera))}</b></div>` : ""}
      <div class="small">Máximos: lluvia ${a.lluviaMax.toFixed(0)} mm · ráfagas ${a.rafMax.toFixed(0)} km/h · energía (CAPE) ${a.capeMax.toFixed(0)}</div>
    </div>`;
  };
  const tabla = (filas) => `<p class="grid-nota">Los números (por ejemplo 2/3) indican cuántos de los 3 modelos ven ese fenómeno.</p><div class="grid">${filas.map(fila).join("")}</div>`;

  const cat = res.filter((x) => x.l.prov === "CAT");
  const vec = res.filter((x) => x.l.prov !== "CAT");
  $("#tabla-catamarca").innerHTML = tabla(cat);
  $("#tabla-vecinas").innerHTML = tabla(vec);

  const peor = cat.reduce((m, x) => (ORDEN[x.a.nivel] > ORDEN[m.a.nivel] ? x : m), cat[0]);
  const conTormenta = cat.filter((x) => x.a.tor >= 2).map((x) => x.l.n);
  const posibles = cat.filter((x) => x.a.nivel === "amarillo").map((x) => x.l.n);
  const box = $("#resumen-modelos");
  box.className = "resumen " + peor.a.nivel;
  renderTiles(cat, horas);
  box.innerHTML = conTormenta.length
    ? `En las próximas ${horas} h, al menos 2 de los 3 modelos ven tormentas en: <b>${esc(conTormenta.join(", "))}</b>.`
    : peor.a.nivel === "verde"
      ? `En las próximas ${horas} h, ningún modelo ve tormentas ni tiempo severo en Catamarca.`
      : `En las próximas ${horas} h no hay coincidencia entre modelos. Solo uno ve algo en: ${esc(posibles.join(", "))}.`;

  dibujarMarcadores(res);
}

function renderTiles(cat, horas) {
  const nTor = cat.filter((x) => x.a.tor >= 2).length;
  const nGra = cat.filter((x) => x.a.gra >= 2).length;
  const raf = Math.max(...cat.map((x) => x.a.rafMax));
  const llu = Math.max(...cat.map((x) => x.a.lluviaMax));
  const t = document.querySelectorAll("#tiles .tile");
  const set = (i, num, sub) => { t[i].querySelector(".t-num").innerHTML = num; t[i].querySelector(".t-lbl").innerHTML = sub; };
  set(0, `${nTor}<small>/${cat.length}</small>`, `Lugares con tormenta<div class="t-sub">2+ modelos · ${horas} h</div>`);
  set(1, `${nGra}<small>/${cat.length}</small>`, `Granizo posible<div class="t-sub">2+ modelos · ${horas} h</div>`);
  set(2, `${raf.toFixed(0)}<small>km/h</small>`, `Ráfaga máxima<div class="t-sub">en Catamarca</div>`);
  set(3, `${llu.toFixed(0)}<small>mm</small>`, `Lluvia máxima<div class="t-sub">acumulada · ${horas} h</div>`);
}

// ---------- Mapa ----------
function iniciarMapa() {
  if (typeof L === "undefined") { document.getElementById("mapa").style.display = "none"; return; }
  mapa = L.map("mapa", { scrollWheelZoom: false }).setView([-28.2, -66.2], 6);
  // Mapa base de OpenStreetMap (no requiere clave). Se oscurece con CSS para el modo oscuro.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 12,
    className: "tiles-oscuros",
  }).addTo(mapa);
  capaAlertas = L.layerGroup().addTo(mapa);
  capaMarcadores = L.layerGroup().addTo(mapa);
}

const COLOR = { verde: "#7fe08a", amarillo: "#f6d24a", naranja: "#f47a5c", rojo: "#ef4b4b" };

function dibujarMarcadores(res) {
  if (!mapa) return;
  capaMarcadores.clearLayers();
  for (const { l, a } of res) {
    L.circleMarker([l.lat, l.lon], {
      radius: l.prov === "CAT" ? 9 : 7, color: "#0b1118", weight: 2,
      fillColor: COLOR[a.nivel], fillOpacity: 0.95,
    }).bindPopup(`<b>${esc(l.n)}</b><br>${TXT_NIVEL[a.nivel]}<br>Tormenta: ${a.tor}/${a.n} modelos<br>Granizo posible: ${a.gra}/${a.n}<br>Ráfagas máx.: ${a.rafMax.toFixed(0)} km/h`)
      .addTo(capaMarcadores);
  }
}

function dibujarPoligonos(alertas) {
  if (!mapa) return;
  capaAlertas.clearLayers();
  for (const a of alertas) {
    for (const pol of a.poligonos || []) {
      L.polygon(pol, { color: COLOR[a.nivel || "amarillo"], weight: 1, fillOpacity: 0.18 })
        .bindPopup(`<b>SMN: ${esc(a.evento)}</b><br>${esc(a.areas.join(", "))}`)
        .addTo(capaAlertas);
    }
  }
}

// ---------- Descripciones de cada vista ----------
const DESC_SAT = {
  "13": {
    t: "Infrarrojo: qué tan altas y frías son las nubes",
    p: "Muestra la temperatura del tope de las nubes, de día y de noche. Lo gris o blanco son nubes bajas o medias. Los colores (verde, amarillo, rojo y violeta) marcan nubes muy altas y frías, típicas de tormentas: cuanto más intenso el color, más fuerte suele ser la tormenta. Si una mancha de color crece rápido de una imagen a la siguiente, hay una tormenta en desarrollo.",
  },
  GEOCOLOR: {
    t: "Color: como se vería desde el espacio",
    p: "De día muestra las nubes en blanco sobre el suelo y la cordillera, parecido a una foto. De noche se ven las luces de las ciudades y las nubes bajas en tonos celestes. Sirve para ubicar dónde hay nubosidad, pero para seguir tormentas conviene el infrarrojo.",
  },
};
const DESC_WINDY = {
  rain: {
    t: "Lluvia: cuánto y dónde se espera que llueva",
    p: "Pronóstico de lluvia del modelo europeo ECMWF, en milímetros por hora. Los tonos claros son lluvia débil; a medida que el color se vuelve más intenso (amarillo, rojo, violeta), la lluvia es más fuerte, típica de tormenta. La escala de colores está en el borde del mapa. No es un radar: es lo que el modelo espera que pase.",
  },
  gust: {
    t: "Ráfagas: los golpes de viento más fuertes",
    p: "Ráfagas pronosticadas en km/h: no es el viento promedio, sino los golpes más fuertes. En general, por encima de 70 km/h pueden caer ramas, carteles o cables, y por encima de 90 km/h el daño es mayor. Los colores más intensos marcan ráfagas más fuertes (fijate la escala en el borde del mapa). Las líneas animadas muestran hacia dónde sopla el viento.",
  },
  cape: {
    t: "Energía: el “combustible” de las tormentas",
    p: "Muestra la energía disponible para tormentas (CAPE), en J/kg. Por debajo de 1000 hay poco potencial; entre 1000 y 2500 pueden formarse tormentas; por encima de 2500 el ambiente favorece tormentas fuertes, con granizo y ráfagas. Que haya energía no garantiza que llueva: hace falta algo que dispare la tormenta, como un frente o el relieve.",
  },
};
function ponerDesc(id, d) {
  const el = document.getElementById(id);
  if (el && d) el.innerHTML = `<b>${esc(d.t)}</b><p>${esc(d.p)}</p>`;
}

// ---------- 3. Satélite ----------
function cargarSatelite(banda) {
  ponerDesc("sat-desc", DESC_SAT[banda]);
  const img = $("#sat-img");
  const base = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/ssa/${banda}/`;
  const opciones = ["latest.jpg", "1800x1800.jpg", "900x900.jpg"];
  let k = 0;
  img.onerror = () => { k++; if (k < opciones.length) img.src = base + opciones[k] + "?t=" + Date.now(); };
  img.src = base + opciones[0] + "?t=" + Date.now();
}

// ---------- 4. Windy ----------
function cargarWindy(overlay) {
  ponerDesc("windy-desc", DESC_WINDY[overlay]);
  const p = new URLSearchParams({
    lat: "-28.2", lon: "-66.3", detailLat: "-28.469", detailLon: "-65.785",
    zoom: "6", level: "surface", overlay, product: "ecmwf", menu: "", message: "true",
    marker: "true", calendar: "now", pressure: "", type: "map", location: "coordinates",
    detail: "", metricWind: "km/h", metricTemp: "°C", radarRange: "-1",
  });
  $("#windy").src = "https://embed.windy.com/embed.html?" + p;
}

// ---------- Tabs ----------
function tabs(selector, attr, fn) {
  document.querySelectorAll(selector).forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(selector).forEach((x) => x.classList.remove("activo"));
    b.classList.add("activo");
    fn(b.dataset[attr]);
  }));
}

// ---------- Inicio ----------
document.addEventListener("DOMContentLoaded", () => {
  iniciarMapa();
  cargarOficial();
  cargarModelos();
  cargarSatelite("13");
  cargarWindy("rain");
  tabs("[data-sat]", "sat", cargarSatelite);
  tabs("[data-windy]", "windy", cargarWindy);
  $("#horas").addEventListener("change", renderModelos);
  $("#refrescar").addEventListener("click", (e) => {
    const b = e.currentTarget; b.classList.remove("girando"); void b.offsetWidth; b.classList.add("girando");
    cargarOficial(); cargarModelos(); cargarSatelite(document.querySelector("[data-sat].activo").dataset.sat);
  });
  // Resalta la sección visible en la barra inferior
  const navLinks = [...document.querySelectorAll(".bottom-nav a")];
  const ids = ["oficial", "modelos", "satelite", "mapa-vivo", "info"];
  const marcar = (id) => navLinks.forEach((a) => a.classList.toggle("activo", a.getAttribute("href") === "#" + id));
  let bloqueo = 0;
  navLinks.forEach((a) => a.addEventListener("click", () => {
    marcar(a.getAttribute("href").slice(1));
    bloqueo = Date.now() + 1200; // deja terminar el scroll suave sin pisar la selección
  }));
  const alScroll = () => {
    if (Date.now() < bloqueo) return;
    const fin = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (window.scrollY < 40) return marcar(ids[0]);
    if (fin) return marcar(ids[ids.length - 1]);
    let actual = ids[0];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.35) actual = id;
    }
    marcar(actual);
  };
  window.addEventListener("scroll", alScroll, { passive: true });
  alScroll();

  // Refresco automático
  setInterval(cargarOficial, 5 * 60e3);
  setInterval(cargarModelos, 30 * 60e3);
  setInterval(() => cargarSatelite(document.querySelector("[data-sat].activo").dataset.sat), 10 * 60e3);
});
