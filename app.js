// Cata del Clima – lógica del panel
const TZ = "America/Argentina/Catamarca";

const LOCALIDADES = [
  // Catamarca: una por cada uno de los 16 departamentos (cabecera) + Fiambalá
  { n: "S. F. V. de Catamarca", d: "Dpto. Capital", lat: -28.469, lon: -65.785, prov: "CAT" },
  { n: "Valle Viejo", d: "Dpto. Valle Viejo · Valle Central", lat: -28.48, lon: -65.72, prov: "CAT" },
  { n: "San José", d: "Dpto. Fray Mamerto Esquiú · Valle Central", lat: -28.39, lon: -65.70, prov: "CAT" },
  { n: "La Puerta", d: "Dpto. Ambato · Valle Central", lat: -28.17, lon: -65.79, prov: "CAT" },
  { n: "La Merced", d: "Dpto. Paclín · Valle Central", lat: -28.155, lon: -65.665, prov: "CAT" },
  { n: "Huillapima", d: "Dpto. Capayán · Valle Central", lat: -28.73, lon: -65.98, prov: "CAT" },
  { n: "Bañado de Ovanta", d: "Dpto. Santa Rosa · este", lat: -28.10, lon: -65.32, prov: "CAT" },
  { n: "El Alto", d: "Dpto. El Alto · este", lat: -28.31, lon: -65.37, prov: "CAT" },
  { n: "Ancasti", d: "Dpto. Ancasti · este", lat: -28.81, lon: -65.50, prov: "CAT" },
  { n: "Recreo", d: "Dpto. La Paz · sudeste", lat: -29.28, lon: -65.06, prov: "CAT" },
  { n: "Pomán / Saujil", d: "Dpto. Pomán · centro-oeste", lat: -28.39, lon: -66.22, prov: "CAT" },
  { n: "Andalgalá", d: "Dpto. Andalgalá · centro-norte", lat: -27.58, lon: -66.317, prov: "CAT" },
  { n: "Belén", d: "Dpto. Belén · oeste", lat: -27.65, lon: -67.03, prov: "CAT" },
  { n: "Santa María", d: "Dpto. Santa María · norte", lat: -26.696, lon: -66.048, prov: "CAT" },
  { n: "Tinogasta", d: "Dpto. Tinogasta · oeste", lat: -28.067, lon: -67.567, prov: "CAT" },
  { n: "Fiambalá", d: "Dpto. Tinogasta · oeste", lat: -27.687, lon: -67.615, prov: "CAT" },
  { n: "Antofagasta de la Sierra", d: "Dpto. Antofagasta de la Sierra · Puna", lat: -26.06, lon: -67.41, prov: "CAT" },
  // Provincias vecinas
  { n: "San Miguel de Tucumán", lat: -26.808, lon: -65.218, prov: "Tucumán" },
  { n: "Cafayate", lat: -26.073, lon: -65.976, prov: "Salta" },
  { n: "Santiago del Estero", lat: -27.795, lon: -64.261, prov: "Sgo. del Estero" },
  { n: "La Rioja", lat: -29.413, lon: -66.856, prov: "La Rioja" },
  { n: "Chilecito", lat: -29.163, lon: -67.498, prov: "La Rioja" },
  { n: "Deán Funes", lat: -30.42, lon: -64.35, prov: "Córdoba" },
];

LOCALIDADES.forEach((l) => { const m = (l.d || "").match(/Dpto\. ([^·]+)/); if (m) l.dep = m[1].trim(); });

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

// Describe cuándo rige una alerta, en palabras: "rige ahora hasta…" o "desde hoy 00:00"
function cuando(a) {
  const ahora = Date.now();
  const ini = a.inicio ? Date.parse(a.inicio) : NaN;
  const fin = a.fin ? Date.parse(a.fin) : NaN;
  const dia = (t) => {
    const f = (d) => new Date(d).toLocaleDateString("es-AR", { timeZone: TZ });
    if (f(t) === f(ahora)) return "hoy";
    if (f(t) === f(ahora + 864e5)) return "mañana";
    return new Date(t).toLocaleDateString("es-AR", { timeZone: TZ, weekday: "long", day: "numeric" });
  };
  const hora = (t) => {
    const h = new Date(t).toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return h === "00:00" ? "00:00 (medianoche)" : h;
  };
  if (!isNaN(ini) && ini > ahora) {
    return { activa: false, corto: `desde ${dia(ini)} ${hora(ini)}`, largo: `Empieza ${dia(ini)} a las ${hora(ini)}${!isNaN(fin) ? ` y sigue hasta ${dia(fin)} a las ${hora(fin)}` : ""}.` };
  }
  return { activa: true, corto: !isNaN(fin) ? `vigente hasta ${dia(fin)} ${hora(fin)}` : "vigente", largo: `Rige ahora${!isNaN(fin) ? ` hasta ${dia(fin)} a las ${hora(fin)}` : ""}.` };
}

// ---------- Departamentos: unir alertas del SMN con las tarjetas ----------
const DEPTOS = ["Capital", "Valle Viejo", "Fray Mamerto Esquiú", "Ambato", "Paclín", "Capayán", "Santa Rosa", "El Alto",
  "Ancasti", "La Paz", "Pomán", "Andalgalá", "Belén", "Santa María", "Tinogasta", "Antofagasta de la Sierra"];
const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function deptosEn(texto) {
  const t = " " + norm(texto).replace(/[^a-z0-9]+/g, " ") + " ";
  const res = DEPTOS.filter((d) => t.includes(" " + norm(d) + " "));
  if (/ san fernando /.test(t) && !res.includes("Capital")) res.push("Capital");
  return res;
}
// Zonas de un aviso a corto plazo: "CATAMARCA: Ancasti - Capayan - La Paz." → ["Ancasti", "Capayán", "La Paz"]
function zonasAviso(a) {
  const txt = String(a.zonas || "").replace(/^\s*catamarca\s*:\s*/i, "").replace(/\.\s*$/, "");
  return txt.split(/\s+-\s+|,\s*/).map((z) => deptosEn(z)[0] || z.trim()).filter(Boolean);
}
function deptosAlerta(a) {
  return [...new Set(deptosEn([...(a.localidades || []), ...(a.areas || [])].join(" , ")))];
}
const oracion = (t) => { const x = String(t || "").toLowerCase(); return x.charAt(0).toUpperCase() + x.slice(1); };
let OFICIAL = {}; // departamento → { nivel, tipo }
const nivelAviso = (avs) => (avs.some((a) => /sever/i.test(a.titulo)) ? "rojo" : "naranja");

// ---------- 1. Alertas oficiales ----------
async function cargarOficial() {
  const box = $("#estado-oficial");
  const setHero = (clase, big, sub, zonas = "") => {
    box.className = "hero " + clase; $("#hero-big").innerHTML = big; $("#hero-sub").innerHTML = sub;
    const z = $("#hero-zonas"); if (z) { z.innerHTML = zonas; z.style.display = zonas ? "" : "none"; }
  };
  try {
    const r = await fetch("/api/alertas", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    $("#hora-oficial").textContent = ahoraTxt();
    const alertas = (d.alertas || []).slice().sort((x, y) => (Date.parse(x.inicio) || 0) - (Date.parse(y.inicio) || 0));
    const avisos = d.avisosCortoPlazo || [];

    const est = (d.estado && d.estado.alertas) || "ok";
    const avisoCorto = "";
    const notaCorto = document.getElementById("nota-corto");
    if (notaCorto) notaCorto.style.display = d.estado && d.estado.cortoPlazo === "error" ? "" : "none";
    if (d.revisado) $("#hora-oficial").textContent = new Date(d.revisado).toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const linkSMN = "<a href='https://www.smn.gob.ar/alertas' target='_blank' rel='noopener'>mapa de alertas del SMN</a>";
    if (!alertas.length && !avisos.length) {
      if (est === "error") {
        setHero("error", "Sin conexión con el SMN", "Consultá el " + linkSMN + ".");
      } else if (est === "parcial") {
        setHero("error", "Revisando alertas del SMN…", "Todavía no terminamos de leer todas las alertas. Mientras tanto, consultá el " + linkSMN + ".");
      } else if (est === "smn_caido") {
        const h = (t) => new Date(t).toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
        setHero("error", "El SMN no está respondiendo",
          `Su sistema de alertas no responde desde las ${d.revisado ? h(d.revisado) : "–"}. Lo seguimos intentando cada 10 minutos${d.ultimoIntento ? ` (último intento: ${h(d.ultimoIntento)})` : ""}. Mientras tanto, revisá el ` + linkSMN + " o las redes del SMN.");
      } else if (est === "desactualizado") {
        setHero("error", "Datos del SMN desactualizados", "Hace un rato que no pudimos actualizar las alertas. Consultá el " + linkSMN + ".");
      } else {
        setHero("neutro", "El feed del SMN no informa alertas para Catamarca", "Ojo: el feed abierto del SMN a veces no incluye todas las alertas de su mapa. Confirmalo siempre en el " + linkSMN + ".");
      }
    } else {
      const peor = alertas.reduce((m, a) => (ORDEN[a.nivel || "amarillo"] > ORDEN[m] ? a.nivel || "amarillo" : m), avisos.length ? nivelAviso(avisos) : "amarillo");
      const n = alertas.length + avisos.length;
      const eventos = [...new Set([...avisos.map((a) => oracion(a.titulo)), ...alertas.map((a) => a.evento)].filter(Boolean))].join(" · ");
      const col = { amarillo: ["amarilla", "amarillas"], naranja: ["naranja", "naranja"], rojo: ["roja", "rojas"] }[peor];
      const activas = alertas.filter((a) => cuando(a).activa);
      const prox = alertas.find((a) => !cuando(a).activa);
      let cuandoTxt;
      if (avisos.length) cuandoTxt = "Aviso a corto plazo: rige ahora";
      else if (activas.length) cuandoTxt = `Rige ahora · ${cuando(activas[0]).corto.replace("vigente ", "")}`;
      else if (prox) cuandoTxt = `Todavía no empezó · rige ${cuando(prox).corto}`;
      const zonas = [...new Set([...avisos.flatMap(zonasAviso), ...alertas.flatMap(deptosAlerta)])];
      setHero(peor, n === 1 ? `1 alerta ${col[0]}` : `${n} alertas ${col[1]}`,
        `${esc(eventos)}${cuandoTxt ? `<br><b>${esc(cuandoTxt)}</b>` : ""}`,
        zonas.length ? `📍 ${zonas.map(esc).join(" · ")}` : "");
    }

    // Unir con las tarjetas: cada departamento con alerta oficial
    OFICIAL = {};
    const marcar = (dep, nivel, tipo) => { if (!OFICIAL[dep] || ORDEN[nivel] > ORDEN[OFICIAL[dep].nivel]) OFICIAL[dep] = { nivel, tipo }; };
    avisos.forEach((a) => zonasAviso(a).forEach((dep) => marcar(dep, nivelAviso([a]), "aviso a corto plazo")));
    alertas.forEach((a) => deptosAlerta(a).forEach((dep) => marcar(dep, a.nivel || "amarillo", `alerta ${a.nivel || ""} por ${String(a.evento || "").toLowerCase()}`.replace(/\s+/g, " "))));
    if (datosModelos) renderModelos();

    // Si el SMN emite una alerta para Catamarca, el bloque oficial pasa arriba de todo
    const hayAlerta = alertas.length > 0 || avisos.length > 0;
    const secOf = $("#oficial"), secCiu = $("#ciudades");
    const oficialEstaArriba = !!(secOf.compareDocumentPosition(secCiu) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (hayAlerta && !oficialEstaArriba) secCiu.before(secOf);
    if (!hayAlerta && oficialEstaArriba) $("#modelos").after(secOf);
    secOf.classList.toggle("compacto", !hayAlerta);
    // El botón central de la barra toma el color del estado oficial
    const navAl = document.getElementById("nav-alertas");
    if (navAl) {
      const niv = hayAlerta ? alertas.reduce((m, a) => (ORDEN[a.nivel || "amarillo"] > ORDEN[m] ? a.nivel || "amarillo" : m), avisos.length ? "naranja" : "amarillo") : "";
      navAl.classList.remove("alerta-amarillo", "alerta-naranja", "alerta-rojo");
      if (niv) navAl.classList.add("alerta-" + niv);
      navAl.setAttribute("aria-label", hayAlerta ? `Alerta ${niv} del SMN para Catamarca` : "Alertas oficiales del SMN");
    }

    const lista = $("#lista-alertas");
    lista.innerHTML =
      avisos.map((a) => `
        <div class="alerta">
          <div class="al-top"><span class="nivel-pill ${nivelAviso([a])}">Corto plazo</span><span class="estado-al ahora">Rige ahora</span></div>
          <h4 class="al-titulo">${esc(oracion(a.titulo))}</h4>
          <p class="zonas-al">📍 ${esc(zonasAviso(a).join(" · ") || a.descripcion)}</p>
          <p class="meta">Emitido ${a.fecha ? esc(fmtHora(a.fecha)) : "–"} ${a.link ? `· <a href="${esc(a.link)}" target="_blank" rel="noopener">ver en SMN</a>` : ""}</p>
        </div>`).join("") +
      alertas.map((a) => `
        <div class="alerta">
          <div class="al-top"><span class="nivel-pill ${esc(a.nivel || "amarillo")}">${esc(a.nivel || "alerta")}</span><h4>${esc(a.evento || a.titulo)}</h4><span class="estado-al ${cuando(a).activa ? "ahora" : "prox"}">${cuando(a).activa ? "Rige ahora" : "Próxima"}</span></div>
          <p class="zonas-al">📍 ${esc((deptosAlerta(a).length ? deptosAlerta(a) : a.areas).join(" · ") || "Catamarca")}</p>
          <p class="cuando">🕒 ${esc(cuando(a).largo)}</p>
          ${a.descripcion ? `<p>${esc(a.descripcion)}</p>` : ""}
          ${a.instruccion ? `<p><i>${esc(a.instruccion)}</i></p>` : ""}
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
    // Primero por nuestra función (guarda el pronóstico 30 min para todos); si falla, directo a Open-Meteo
    let r;
    try { r = await fetch(`/api/modelos?${p}`); if (!r.ok) throw new Error(); }
    catch { r = await fetch(`${base}?${p}`); }
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
  const ene = cuenta((x) => (x.capeMax ?? 0) >= 1500);   // energía para tormentas
  const eneF = cuenta((x) => (x.capeMax ?? 0) >= 2500);  // energía muy alta
  const max = (k) => Math.max(...porModelo.map((x) => x[k] ?? 0));
  const primeras = porModelo.map((x) => x.primeraTormenta).filter(Boolean).sort();

  // Nivel según cuántos modelos coinciden
  //  verde   = ningún modelo ve tormenta, viento fuerte ni lluvia fuerte
  //  amarillo= lo ve 1 solo modelo (posible, poca coincidencia)
  //  naranja = 2 o 3 modelos coinciden en tormenta, viento ≥70 o lluvia fuerte (probable)
  //  rojo    = 2 o 3 coinciden en tormenta Y además 2+ ven granizo o ráfagas ≥90 (probable y fuerte)
  const mayoria = Math.min(2, n);
  let nivel = "verde";
  if (tor >= 1 || vie >= 1 || llu >= 1 || eneF >= 1 || ene >= mayoria) nivel = "amarillo";
  if (tor >= mayoria || vie >= mayoria || llu >= mayoria) nivel = "naranja";
  if ((tor >= mayoria && gra >= mayoria) || vieF >= mayoria) nivel = "rojo";

  return { n, tor, gra, vie, vieF, llu, ene, eneF, nivel, porModelo,
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
  const n = a.n;
  if (a.nivel === "verde") {
    const lluvia = a.lluviaMax >= 1 ? ` Puede llover (hasta ${a.lluviaMax.toFixed(0)} mm en total), sin llegar a lluvia fuerte.` : "";
    return `Ningún modelo ve tormentas ni ráfagas fuertes en las próximas ${horas} h, y la energía para tormentas es baja.${lluvia}`;
  }
  if (a.nivel === "amarillo") {
    const que = [a.tor && "tormenta", a.vie && "ráfagas fuertes", a.llu && "lluvia fuerte"].filter(Boolean);
    if (que.length) return `Solo 1 de ${n} modelos ve ${lista(que)}. Puede pasar, pero hay poca coincidencia.`;
    return `Hay ${a.eneF ? "mucha " : ""}energía para tormentas (${a.eneF ? a.eneF : a.ene} de ${n} modelos), pero ningún modelo ve que la tormenta llegue a formarse. Conviene estar atento.`;
  }
  if (a.nivel === "naranja") {
    const que = [a.tor >= 2 && "tormenta", a.vie >= 2 && "ráfagas fuertes", a.llu >= 2 && "lluvia fuerte"].filter(Boolean);
    return `${Math.max(a.tor, a.vie, a.llu)} de ${n} modelos coinciden en ${lista(que)}. Es probable.`;
  }
  return `${a.tor} de ${n} modelos coinciden en tormenta${a.gra >= 2 ? " con posible granizo" : ""}${a.vieF >= 2 ? " y ráfagas de 90 km/h o más" : ""}. Es probable y podría ser fuerte.`;
}

// Frase de la tarjeta cuando hay alerta oficial: el SMN manda, los modelos complementan
function fraseConOficial(a, horas) {
  if (!a.oficial) return frase(a, horas);
  const nm = a.nivelModelos || a.nivel;
  if (nm === "verde") return `Los modelos todavía no muestran tormenta acá, pero el SMN emitió la alerta. <b>Seguí la indicación oficial.</b>`;
  if (nm === "amarillo") return `Los modelos muestran una señal débil y el SMN emitió la alerta. <b>Seguí la indicación oficial.</b>`;
  return `Los modelos coinciden con el SMN: ${frase({ ...a, nivel: nm }, horas).charAt(0).toLowerCase()}${frase({ ...a, nivel: nm }, horas).slice(1)}`;
}

const TXT_NIVEL = { verde: "Sin tormentas", amarillo: "Posible", naranja: "Probable", rojo: "Probable y fuerte" };

// De más complicada a menos: nivel, después coincidencias de tormenta, granizo, viento, lluvia y energía
function ordenarPorRiesgo(lista) {
  const puntaje = ({ a }) => [a.oficial ? 1 + ORDEN[a.oficial.nivel] : 0, ORDEN[a.nivel], a.tor, a.gra, a.vieF, a.vie, a.llu, a.eneF, a.ene, a.rafMax, a.lluviaMax];
  return lista.slice().sort((x, y) => {
    const px = puntaje(x), py = puntaje(y);
    for (let i = 0; i < px.length; i++) if (py[i] !== px[i]) return py[i] - px[i];
    return 0;
  });
}

function renderModelos() {
  if (!datosModelos) return;
  const horas = +$("#horas").value;
  const res = LOCALIDADES.map((l, i) => ({ l, a: analizar(datosModelos[i], horas) }));
  // El SMN pesa más que los modelos: un departamento con alerta oficial sube a ese nivel
  res.forEach(({ l, a }) => {
    const of = l.dep && OFICIAL[l.dep];
    if (!of) return;
    a.oficial = of;
    a.nivelModelos = a.nivel;
    if (ORDEN[of.nivel] > ORDEN[a.nivel]) a.nivel = of.nivel;
  });

  const fila = ({ l, a }) => {
    const sen = [];
    if (a.tor) sen.push(`<span class="chip">⛈️ Tormenta ${a.tor}/${a.n}</span>`);
    if (a.gra) sen.push(`<span class="chip">🧊 Granizo ${a.gra}/${a.n}</span>`);
    if (a.vie) sen.push(`<span class="chip">💨 Ráfagas fuertes ${a.vie}/${a.n}</span>`);
    if (a.llu) sen.push(`<span class="chip">🌧️ Lluvia fuerte ${a.llu}/${a.n}</span>`);
    if (a.ene) sen.push(`<span class="chip">⚡ Energía ${a.eneF ? "muy alta" : "alta"} ${a.eneF || a.ene}/${a.n}</span>`);
    const si = a.porModelo.filter((x) => x.tormenta).map((x) => x.modelo);
    const no = a.porModelo.filter((x) => !x.tormenta).map((x) => x.modelo);
    const quien = a.tor ? `<div class="small">Ven tormenta: <b>${esc(lista(si))}</b>${no.length ? ` · no la ve${no.length > 1 ? "n" : ""}: ${esc(lista(no))}` : ""}</div>` : "";
    return `<div class="loc-card ${a.nivel}">
      <div class="loc-top">
        <div><div class="loc-n">${esc(l.n)}</div><div class="loc-p">${esc(l.prov !== "CAT" ? l.prov : l.d || "")}</div></div>
        <span class="pill">${a.oficial ? "Alerta SMN" : TXT_NIVEL[a.nivel]}</span>
      </div>
      ${a.oficial ? `<div class="oficial-banner">⚠️ <b>Alerta oficial del SMN</b> · ${esc(a.oficial.tipo)}</div>` : ""}
      <div class="frase">${fraseConOficial(a, horas)}</div>
      <div class="detalle">
        ${sen.length ? `<div class="chips">${sen.join("")}</div>` : ""}
        ${quien}
        ${a.primera ? `<div class="small">Primera señal de tormenta: <b>${esc(fmtHora(a.primera))}</b></div>` : ""}
        <div class="small">Máximos: lluvia ${a.lluviaMax.toFixed(0)} mm · ráfagas ${a.rafMax.toFixed(0)} km/h · energía ${a.capeMax.toFixed(0)} J/kg</div>
      </div>
      <button class="ver-detalle" type="button">Ver detalle ▾</button>
    </div>`;
  };
  const tabla = (filas) => `<div class="grid">${filas.map(fila).join("")}</div>`;

  const cat = res.filter((x) => x.l.prov === "CAT");
  const vec = res.filter((x) => x.l.prov !== "CAT");
  // Capital y Valle Viejo arriba; el resto en el desplegable
  $("#tabla-principal").innerHTML = cat.slice(0, 2).map(fila).join("");
  $("#tabla-catamarca").innerHTML = tabla(ordenarPorRiesgo(cat.slice(2)));
  const otrasOficial = cat.slice(2).filter((x) => x.a.oficial).length;
  const otrasAlerta = cat.slice(2).filter((x) => !x.a.oficial && (x.a.nivel === "naranja" || x.a.nivel === "rojo")).map((x) => x.l.n);
  const resumenMas = document.querySelector("#mas-localidades summary span");
  const partes = [otrasOficial && `${otrasOficial} con alerta del SMN`, otrasAlerta.length && `${otrasAlerta.length} con tormenta probable`].filter(Boolean);
  if (resumenMas) resumenMas.innerHTML = partes.length
    ? `Ver otras localidades · <b>${esc(partes.join(" · "))}</b>`
    : "Ver otras localidades de Catamarca y provincias vecinas";
  $("#tabla-vecinas").innerHTML = tabla(ordenarPorRiesgo(vec));

  const peor = cat.reduce((m, x) => (ORDEN[x.a.nivel] > ORDEN[m.a.nivel] ? x : m), cat[0]);
  const conTormenta = cat.filter((x) => x.a.nivel === "naranja" || x.a.nivel === "rojo").map((x) => x.l.n);
  const posibles = cat.filter((x) => x.a.nivel === "amarillo").map((x) => x.l.n);
  const box = $("#resumen-modelos");
  box.className = "resumen " + peor.a.nivel;
  renderTiles(cat, horas);
  box.innerHTML = "<span>" + (conTormenta.length
    ? `En las próximas ${horas} h, al menos 2 de los 3 modelos coinciden en tormenta, viento o lluvia fuerte en: <b>${esc(lista(conTormenta))}</b>.`
    : peor.a.nivel === "verde"
      ? `En las próximas ${horas} h, ningún modelo ve tormentas ni tiempo severo en Catamarca.`
      : `En las próximas ${horas} h no hay tormentas en las que coincidan 2 o más modelos. Señales de tormenta posible en: ${esc(lista(posibles))}.`) + "</span>";

  dibujarMarcadores(res);
}

function renderTiles(cat, horas) {
  const nTor = cat.filter((x) => x.a.tor >= 2).length; // misma regla que "Probable"
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
    p: "Muestra la energía disponible para tormentas (CAPE), en J/kg. Por debajo de 1000 hay poco potencial; entre 1000 y 2500 pueden formarse tormentas; por encima de 2500 el ambiente favorece tormentas fuertes, con granizo y ráfagas. Que haya energía no garantiza que llueva: hace falta algo que dispare la tormenta, como un frente o el relieve. Por eso, en las tarjetas, la energía alta sola marca “Posible”, y sube a “Probable” cuando además los modelos ven la tormenta.",
  },
};
function ponerDesc(id, d, extra = "") {
  const el = document.getElementById(id);
  if (el && d) el.innerHTML = `<b>${esc(d.t)}</b><p>${esc(d.p)}</p>${extra}`;
}
const NOTA_WINDY = `<p class="desc-nota">Este mapa usa solo el modelo europeo (ECMWF) y muestra la hora elegida en su línea de tiempo. Las tarjetas de arriba comparan 3 modelos y toman el valor máximo del período elegido, por eso los números pueden no coincidir exactamente.</p>`;

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

function abrirVisor() {
  const img = $("#sat-img");
  if (!img.src) return;
  const v = $("#visor");
  $("#visor-img").src = img.src;
  $("#visor-img").classList.remove("zoom");
  v.hidden = false;
  document.body.style.overflow = "hidden";
  document.querySelector(".bottom-nav").style.display = "none";
}
function cerrarVisor() {
  $("#visor").hidden = true;
  document.body.style.overflow = "";
  document.querySelector(".bottom-nav").style.display = "";
}

// ---------- 4. Windy ----------
function cargarWindy(overlay) {
  ponerDesc("windy-desc", DESC_WINDY[overlay], NOTA_WINDY);
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
  $("#tabla-principal").addEventListener("click", (e) => {
    const b = e.target.closest(".ver-detalle"); if (!b) return;
    const c = b.closest(".loc-card"); c.classList.toggle("abierta");
    b.textContent = c.classList.contains("abierta") ? "Ocultar detalle ▴" : "Ver detalle ▾";
  });
  $("#sat-img").addEventListener("click", abrirVisor);
  $("#visor-cerrar").addEventListener("click", cerrarVisor);
  $("#visor").addEventListener("click", (e) => { if (e.target.id === "visor") cerrarVisor(); });
  $("#visor-img").addEventListener("click", (e) => e.currentTarget.classList.toggle("zoom"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarVisor(); });
  $("#refrescar").addEventListener("click", (e) => {
    const b = e.currentTarget; b.classList.remove("girando"); void b.offsetWidth; b.classList.add("girando");
    cargarOficial(); cargarModelos(); cargarSatelite(document.querySelector("[data-sat].activo").dataset.sat);
  });
  // Resalta la sección visible en la barra inferior
  const navLinks = [...document.querySelectorAll(".bottom-nav a")];
  const ids = ["ciudades", "modelos", "oficial", "mapa-localidades", "satelite", "mapa-vivo", "info"];
  const mapaNav = { modelos: "ciudades", "mapa-localidades": "ciudades" }; // secciones sin ícono propio
  const marcar = (id) => { id = mapaNav[id] || id; navLinks.forEach((a) => a.classList.toggle("activo", a.getAttribute("href") === "#" + id)); };
  let bloqueo = 0;
  navLinks.forEach((a) => a.addEventListener("click", () => {
    marcar(a.getAttribute("href").slice(1));
    bloqueo = Date.now() + 1200; // deja terminar el scroll suave sin pisar la selección
  }));
  const alScroll = () => {
    if (Date.now() < bloqueo) return;
    const fin = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    const orden = ids.map((id) => document.getElementById(id)).filter(Boolean).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top);
    if (window.scrollY < 40) return marcar(orden[0].id);
    if (fin) return marcar(orden[orden.length - 1].id);
    let actual = orden[0].id;
    for (const el of orden) if (el.getBoundingClientRect().top <= window.innerHeight * 0.35) actual = el.id;
    marcar(actual);
  };
  window.addEventListener("scroll", alScroll, { passive: true });
  alScroll();

  // Refresco automático
  setInterval(cargarOficial, 5 * 60e3);
  setInterval(cargarModelos, 30 * 60e3);
  setInterval(() => cargarSatelite(document.querySelector("[data-sat].activo").dataset.sat), 10 * 60e3);
});
