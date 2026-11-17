// Cloudflare Pages Function: GET /api/modelos?<parámetros de Open-Meteo>
//
// Hace de intermediario con Open-Meteo y guarda la respuesta 30 minutos en la caché de Cloudflare.
// Así todos los visitantes reciben el mismo pronóstico y Open-Meteo recibe muy pocas consultas
// por día, aunque entren miles de personas (su plan gratuito tiene un límite diario).

const API = "https://api.open-meteo.com/v1/forecast";
const PERMITIDOS = ["latitude", "longitude", "hourly", "models", "timezone", "forecast_days", "wind_speed_unit"];
const DURACION = 1800; // segundos (30 minutos)

export async function onRequestGet(context) {
  const entrada = new URL(context.request.url).searchParams;

  // Solo pasamos los parámetros conocidos, ordenados, para que todos compartan la misma caché
  const p = new URLSearchParams();
  for (const k of PERMITIDOS) if (entrada.has(k)) p.set(k, entrada.get(k));
  if (!p.has("latitude") || !p.has("longitude")) return json({ error: "Faltan coordenadas" }, 400);

  const destino = `${API}?${p.toString()}`;
  const clave = new Request("https://cache.cataclima/modelos?" + p.toString());
  const cache = caches.default;

  const guardada = await cache.match(clave);
  if (guardada) return guardada;

  let r;
  try {
    r = await fetch(destino, { headers: { "user-agent": "CataDelClima/1.0 (Instituto Cecilia Grierson | La Carrillo)" } });
  } catch (e) {
    return json({ error: "No se pudo consultar Open-Meteo" }, 502);
  }
  if (!r.ok) return json({ error: "Open-Meteo respondió " + r.status }, 502);

  const cuerpo = await r.text();
  const resp = new Response(cuerpo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=300, s-maxage=${DURACION}`,
      "x-cata-cache": new Date().toISOString(),
    },
  });
  context.waitUntil(cache.put(clave, resp.clone()));
  return resp;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
