// Cloudflare Pages Function: GET /api/alertas
//
// Las alertas del SMN las lee un robot en GitHub Actions (scripts/smn_alertas.py) cada ~10 min,
// de a una y con pausas, porque el SMN bloquea (error 429) las consultas rápidas desde Cloudflare.
// El robot guarda las alertas de Catamarca en la rama "datos" del repositorio, y esta función
// solo las lee de ahí, las filtra por vigencia y se las pasa a la app.

const REPO = "jufasan/cata-del-clima"; // usuario/repositorio en GitHub
const DATOS = `https://raw.githubusercontent.com/${REPO}/datos/alertas-catamarca.json`;
const MAX_ANTIGUEDAD_MIN = 45; // si el robot no corre hace más de esto, se avisa

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=60, s-maxage=120",
};

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const resultado = {
    actualizado: new Date().toISOString(),
    fuente: "Servicio Meteorológico Nacional (SMN) – feed CAP oficial",
    alertas: [],
    avisosCortoPlazo: [],
    estado: { alertas: "ok", cortoPlazo: "ok" },
    errores: [],
  };

  try {
    const r = await fetch(DATOS + "?t=" + Math.floor(Date.now() / 60000), {
      headers: { "user-agent": "CataDelClima/1.0" },
      cf: { cacheTtl: 60 },
    });
    if (!r.ok) throw new Error("HTTP " + r.status + " al leer los datos del robot");
    const d = await r.json();

    if (url.searchParams.has("debug")) {
      const { alertas, ...resto } = d;
      return new Response(JSON.stringify({ ...resto, cantidadAlertasCatamarca: (alertas || []).length, alertas }, null, 2), {
        headers: { ...HEADERS, "cache-control": "no-store" },
      });
    }

    const ahora = Date.now();
    resultado.revisado = d.revisado;
    resultado.completo = d.completo;
    resultado.alertas = (d.alertas || []).filter((a) => !a.fin || Date.parse(a.fin) > ahora);
    // Avisos a corto plazo: solo los de las últimas 3 horas (por si el robot quedó sin actualizar)
    resultado.avisosCortoPlazo = (d.avisosCortoPlazo || []).filter((a) => !a.fecha || ahora - Date.parse(a.fecha) < 3 * 3600e3);

    const minutos = (ahora - Date.parse(d.revisado)) / 60000;
    resultado.ultimoIntento = d.ultimoIntento || null;
    const smnFalla = d.errorSMN && d.ultimoIntento && Date.parse(d.ultimoIntento) > Date.parse(d.revisado);
    if (!(minutos <= MAX_ANTIGUEDAD_MIN) && smnFalla) {
      resultado.estado.alertas = "smn_caido";
      resultado.errores.push("El SMN no está respondiendo: " + d.errorSMN);
    } else if (!(minutos <= MAX_ANTIGUEDAD_MIN)) {
      resultado.estado.alertas = "desactualizado";
      resultado.errores.push(`Los datos del SMN tienen ${Math.round(minutos)} minutos sin actualizarse.`);
    } else if (d.completo === false) {
      resultado.estado.alertas = "parcial";
      resultado.errores.push(`Todavía se están leyendo alertas del SMN (${d.alertasLeidas} de ${d.alertasEnFeed}).`);
    }
  } catch (e) {
    resultado.estado.alertas = "error";
    resultado.estado.cortoPlazo = "error";
    resultado.errores.push("No se pudieron leer las alertas: " + e.message);
  }

  return new Response(JSON.stringify(resultado), { headers: HEADERS });
}
