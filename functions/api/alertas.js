// Cloudflare Pages Function: GET /api/alertas
// Lee los feeds oficiales del SMN (formato CAP y avisos a corto plazo),
// se queda solo con lo que afecta a Catamarca y lo devuelve en JSON.
// Hace falta porque el navegador no puede leer el feed del SMN directo (CORS).

const FEED_ALERTAS = "https://ssl.smn.gob.ar/CAP/AR.php";
const FEED_CORTO_PLAZO = "https://ssl.smn.gob.ar/feeds/CAP/avisocortoplazo/rss_acpCAP.xml";

// Caja aproximada de la provincia de Catamarca (lat/lon)
const BBOX = { latMin: -30.15, latMax: -25.1, lonMin: -69.2, lonMax: -64.8 };

const HEADERS_SALIDA = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=120, s-maxage=300",
};

export async function onRequestGet(context) {
  const resultado = {
    actualizado: new Date().toISOString(),
    fuente: "Servicio Meteorológico Nacional (SMN) – feeds CAP oficiales",
    alertas: [],
    avisosCortoPlazo: [],
    errores: [],
  };

  const [a, b] = await Promise.allSettled([
    leerAlertasCAP(),
    leerAvisosCortoPlazo(),
  ]);

  if (a.status === "fulfilled") resultado.alertas = a.value;
  else resultado.errores.push("No se pudo leer el feed de alertas del SMN: " + a.reason);

  if (b.status === "fulfilled") resultado.avisosCortoPlazo = b.value;
  else resultado.errores.push("No se pudo leer el feed de avisos a corto plazo del SMN: " + b.reason);

  return new Response(JSON.stringify(resultado), { headers: HEADERS_SALIDA });
}

async function traer(url) {
  const r = await fetch(url, {
    headers: { "user-agent": "CataDelClima/1.0 (panel ciudadano sin fines de alerta propia)" },
    cf: { cacheTtl: 180, cacheEverything: true },
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.text();
}

// ---------- Alertas CAP ----------
async function leerAlertasCAP() {
  const feed = await traer(FEED_ALERTAS);

  // Puede venir como feed (RSS/Atom con links a cada CAP) o con los <alert> embebidos.
  let documentos = [];
  if (/<alert[\s>]/i.test(feed)) documentos.push(feed);

  const links = extraerLinks(feed).slice(0, 60);
  const caps = await Promise.allSettled(links.map(traer));
  for (const c of caps) if (c.status === "fulfilled") documentos.push(c.value);

  const alertas = [];
  const vistos = new Set();
  for (const doc of documentos) {
    for (const alerta of parsearCAP(doc)) {
      if (!afectaCatamarca(alerta)) continue;
      const clave = alerta.evento + "|" + alerta.inicio + "|" + alerta.areas.join(",");
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      alertas.push(alerta);
    }
  }
  // Solo vigentes o futuras
  const ahora = Date.now();
  return alertas.filter((x) => !x.fin || Date.parse(x.fin) > ahora);
}

function extraerLinks(xml) {
  const urls = new Set();
  const items = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) || [];
  for (const it of items) {
    const l1 = it.match(/<link[^>]*>([^<]+)<\/link>/i);
    const l2 = it.match(/<link[^>]*href="([^"]+)"/i);
    const g = it.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i);
    for (const m of [l1, l2, g]) if (m) urls.add(decodificar(m[1].trim()));
  }
  return [...urls].filter((u) => /^https?:\/\//.test(u));
}

function parsearCAP(xml) {
  const salida = [];
  const alerts = xml.match(/<alert[\s\S]*?<\/alert>/gi) || [];
  for (const al of alerts) {
    const estado = tag(al, "status");
    if (estado && !/actual/i.test(estado)) continue; // ignora pruebas/ejercicios
    const msgType = tag(al, "msgType");
    if (/cancel/i.test(msgType)) continue;
    const infos = al.match(/<info[\s\S]*?<\/info>/gi) || [];
    for (const info of infos) {
      const areasXml = info.match(/<area[\s\S]*?<\/area>/gi) || [];
      const areas = [];
      const poligonos = [];
      for (const ar of areasXml) {
        const d = tag(ar, "areaDesc");
        if (d) areas.push(d);
        const polys = ar.match(/<polygon>([\s\S]*?)<\/polygon>/gi) || [];
        for (const p of polys) {
          const pts = p.replace(/<\/?polygon>/gi, "").trim().split(/\s+/)
            .map((par) => par.split(",").map(Number))
            .filter((x) => x.length === 2 && !isNaN(x[0]) && !isNaN(x[1]));
          if (pts.length > 2) poligonos.push(pts);
        }
      }
      salida.push({
        evento: tag(info, "event"),
        titulo: tag(info, "headline"),
        descripcion: tag(info, "description"),
        instruccion: tag(info, "instruction"),
        severidad: tag(info, "severity"),
        urgencia: tag(info, "urgency"),
        certeza: tag(info, "certainty"),
        nivel: nivelDesdeTexto(info),
        inicio: tag(info, "onset") || tag(info, "effective") || tag(al, "sent"),
        fin: tag(info, "expires"),
        emitida: tag(al, "sent"),
        areas,
        poligonos,
        web: tag(info, "web") || "https://www.smn.gob.ar/alertas",
      });
    }
  }
  return salida;
}

function nivelDesdeTexto(info) {
  // El SMN usa colores (amarillo/naranja/rojo). Se busca en parámetros o texto.
  const t = info.toLowerCase();
  if (/\brojo\b|\bred\b/.test(t)) return "rojo";
  if (/naranja|orange/.test(t)) return "naranja";
  if (/amarill|yellow/.test(t)) return "amarillo";
  return "";
}

function afectaCatamarca(a) {
  const texto = (a.areas.join(" ") + " " + a.titulo + " " + a.descripcion).toLowerCase();
  if (texto.includes("catamarca")) return true;
  for (const pol of a.poligonos) {
    for (const [lat, lon] of pol) {
      if (lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax) return true;
    }
  }
  return false;
}

// ---------- Avisos a corto plazo ----------
async function leerAvisosCortoPlazo() {
  const xml = await traer(FEED_CORTO_PLAZO);
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const ahora = Date.now();
  const res = [];
  for (const it of items) {
    const titulo = tag(it, "title");
    const desc = tag(it, "description");
    const fecha = tag(it, "pubDate");
    const link = tag(it, "link");
    if (!(titulo + " " + desc).toLowerCase().includes("catamarca")) continue;
    const t = Date.parse(fecha);
    if (!isNaN(t) && ahora - t > 6 * 3600 * 1000) continue; // solo últimas 6 h
    res.push({ titulo, descripcion: limpiarHTML(desc), fecha, link });
  }
  return res;
}

// ---------- utilidades ----------
function tag(xml, nombre) {
  const re = new RegExp("<(?:\\w+:)?" + nombre + "[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?" + nombre + ">", "i");
  const m = xml.match(re);
  if (!m) return "";
  return decodificar(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
}

function decodificar(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}

function limpiarHTML(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Exportado solo para pruebas locales
export const _test = { parsearCAP, afectaCatamarca, extraerLinks };
