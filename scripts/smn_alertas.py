#!/usr/bin/env python3
"""
Cata del Clima – robot de alertas del SMN.

Corre en GitHub Actions cada ~10 minutos. Lee la lista oficial de avisos del SMN
(https://ssl.smn.gob.ar/CAP/AR.php), abre DE A UNA y con pausas solo las alertas
que todavía no conoce, y guarda las que afectan a Catamarca en un JSON que lee la app.

Uso: python smn_alertas.py <carpeta_datos>
  <carpeta_datos>/cache.json               alertas ya leídas (para no volver a abrirlas)
  <carpeta_datos>/alertas-catamarca.json   resultado que lee la app
"""
import json, os, re, sys, time, html, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

FEED = "https://ssl.smn.gob.ar/CAP/AR.php"
UA = "CataDelClima/1.0 (panel ciudadano sin fines de lucro, Instituto Cecilia Grierson | La Carrillo)"
PAUSA = 2.5            # segundos entre alertas
MAX_POR_CORRIDA = 120  # tope de alertas nuevas a abrir por corrida
MAX_429_SEGUIDOS = 4   # si el SMN nos frena varias veces seguidas, se corta y sigue la próxima corrida

# Contorno aproximado de la provincia de Catamarca (lat, lon). Sirve para decidir si una
# zona del SMN cae en Catamarca cuando el texto no nombra la provincia.
CATAMARCA = [
    (-25.15, -67.60), (-25.15, -66.95), (-26.25, -66.25), (-26.50, -66.00), (-27.00, -65.95),
    (-27.55, -65.75), (-28.00, -65.30), (-28.60, -65.22), (-29.00, -65.00), (-29.30, -64.85),
    (-30.10, -65.00), (-29.60, -65.50), (-29.00, -66.20), (-28.30, -66.60), (-28.25, -67.00),
    (-28.40, -67.60), (-28.70, -68.30), (-27.30, -68.60), (-26.00, -68.50), (-25.30, -68.30),
]


# Localidades de referencia: una alerta "afecta a Catamarca" si alguna queda dentro de su polígono.
LOCALIDADES = [
    ("San Fernando del Valle de Catamarca", -28.469, -65.785), ("Valle Viejo", -28.48, -65.72),
    ("Fray Mamerto Esquiú", -28.40, -65.70), ("Paclín", -28.22, -65.63), ("Ambato", -28.10, -65.85),
    ("Santa Rosa", -28.10, -65.32), ("El Alto", -28.31, -65.37), ("Ancasti", -28.81, -65.50),
    ("La Paz (Recreo)", -29.28, -65.06), ("Capayán (Huillapima)", -28.73, -65.98),
    ("Pomán", -28.39, -66.22), ("Andalgalá", -27.58, -66.317), ("Belén", -27.65, -67.03),
    ("Santa María", -26.696, -66.048), ("Tinogasta", -28.067, -67.567), ("Fiambalá", -27.687, -67.615),
    ("Antofagasta de la Sierra", -26.06, -67.41),
]


def grilla_catamarca(paso=0.2):
    pts = []
    lat = -30.1
    while lat <= -25.1:
        lon = -68.6
        while lon <= -64.8:
            if dentro(lat, lon):
                pts.append((lat, lon))
            lon += paso
        lat += paso
    return pts


def traer(url, reintentos=3):
    espera = 10
    for intento in range(reintentos + 1):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and intento < reintentos:
                time.sleep(espera)
                espera *= 2
                continue
            raise
        except urllib.error.URLError:
            if intento < reintentos:
                time.sleep(espera)
                continue
            raise


def tag(xml, nombre):
    m = re.search(r"<(?:\w+:)?%s[^>]*>([\s\S]*?)</(?:\w+:)?%s>" % (nombre, nombre), xml, re.I)
    if not m:
        return ""
    v = re.sub(r"^<!\[CDATA\[|\]\]>$", "", m.group(1).strip())
    return html.unescape(v).strip()


def dentro(lat, lon, pol=CATAMARCA):
    adentro = False
    j = len(pol) - 1
    for i in range(len(pol)):
        yi, xi = pol[i]
        yj, xj = pol[j]
        if ((xi > lon) != (xj > lon)) and (lat < (yj - yi) * (lon - xi) / (xj - xi + 1e-12) + yi):
            adentro = not adentro
        j = i
    return adentro


def nivel_de(info):
    t = info.lower()
    if re.search(r"\brojo\b|\bred\b", t): return "rojo"
    if re.search(r"naranja|orange", t): return "naranja"
    if re.search(r"amarill|yellow", t): return "amarillo"
    sev = tag(info, "severity").lower()
    return {"extreme": "rojo", "severe": "naranja", "moderate": "amarillo"}.get(sev, "")


def parsear_cap(xml):
    salida = []
    for al in re.findall(r"<alert[\s\S]*?</alert>", xml, re.I):
        estado = tag(al, "status")
        if estado and not re.search(r"actual", estado, re.I):
            continue
        if re.search(r"cancel", tag(al, "msgType"), re.I):
            continue
        for info in re.findall(r"<info[\s\S]*?</info>", al, re.I):
            areas, poligonos, geocodes = [], [], []
            for ar in re.findall(r"<area[\s\S]*?</area>", info, re.I):
                d = tag(ar, "areaDesc")
                if d: areas.append(d)
                geocodes += [html.unescape(v) for v in re.findall(r"<value>([^<]*)</value>", ar, re.I)]
                for p in re.findall(r"<polygon>([\s\S]*?)</polygon>", ar, re.I):
                    pts = []
                    for par in p.strip().split():
                        try:
                            a, b = [float(x) for x in par.split(",")[:2]]
                            pts.append([a, b])
                        except ValueError:
                            pass
                    if len(pts) > 2:
                        # CAP usa "lat,lon"; si viniera invertido, lo corregimos
                        if abs(pts[0][0]) > 50 and abs(pts[0][1]) < 50:
                            pts = [[b, a] for a, b in pts]
                        paso = max(1, len(pts) // 120)  # simplificar para el mapa
                        poligonos.append(pts[::paso])
            salida.append({
                "evento": tag(info, "event"),
                "titulo": tag(info, "headline"),
                "descripcion": tag(info, "description"),
                "instruccion": tag(info, "instruction"),
                "severidad": tag(info, "severity"),
                "nivel": nivel_de(info),
                "inicio": tag(info, "onset") or tag(info, "effective") or tag(al, "sent"),
                "fin": tag(info, "expires"),
                "emitida": tag(al, "sent"),
                "areas": areas,
                "geocodes": geocodes[:20],
                "poligonos": poligonos,
                "web": tag(info, "web") or "https://www.smn.gob.ar/alertas",
            })
    return salida


def localidades_afectadas(a):
    """Devuelve (localidades dentro del polígono, puntos de la grilla de Catamarca dentro)."""
    locs, n_grilla = set(), 0
    for pol in a["poligonos"]:
        poly = [tuple(p) for p in pol]
        for nombre, la, lo in LOCALIDADES:
            if dentro(la, lo, poly):
                locs.add(nombre)
        n_grilla += sum(1 for la, lo in GRILLA if dentro(la, lo, poly))
    return [n for n, _, _ in LOCALIDADES if n in locs], n_grilla


def afecta_catamarca(a):
    texto = " ".join(a["areas"] + a["geocodes"] + [a["titulo"]]).lower()
    if "catamarca" in texto:
        return True
    locs, n_grilla = localidades_afectadas(a)
    return bool(locs) or n_grilla >= 2


def parse_fecha(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


GRILLA = []


def main():
    global GRILLA
    GRILLA = grilla_catamarca()
    carpeta = sys.argv[1] if len(sys.argv) > 1 else "datos"
    os.makedirs(carpeta, exist_ok=True)
    ruta_cache = os.path.join(carpeta, "cache.json")
    ruta_out = os.path.join(carpeta, "alertas-catamarca.json")
    cache = {}
    if os.path.exists(ruta_cache):
        try:
            cache = json.load(open(ruta_cache, encoding="utf-8"))
        except Exception:
            cache = {}

    ahora = datetime.now(timezone.utc)
    feed = traer(FEED)
    items = re.findall(r"<item>[\s\S]*?</item>", feed, re.I)

    alertas_links, avisos = [], []
    for it in items:
        link = tag(it, "link")
        if "/avisocortoplazo/" in link:
            desc = tag(it, "description")
            if "catamarca" in desc.lower() or "catamarca" in tag(it, "title").lower():
                m = re.search(r"(\d{4})_(\d{2})_(\d{2})_(\d{2})(\d{2})", link)
                fecha = datetime(*map(int, m.groups()), tzinfo=timezone.utc) if m else None
                if fecha is None or ahora - fecha < timedelta(hours=3):
                    # Solo la parte de Catamarca del texto
                    parte = re.search(r"CATAMARCA:[^.]*\.?", desc, re.I)
                    avisos.append({"titulo": tag(it, "title"), "descripcion": desc,
                                   "zonas": parte.group(0) if parte else "",
                                   "fecha": fecha.isoformat() if fecha else "", "link": link})
        elif link:
            alertas_links.append(link)

    # Abrir solo las alertas nuevas, despacio
    nuevas = [l for l in alertas_links if l not in cache][:MAX_POR_CORRIDA]
    abiertas, fallidas, seguidos_429 = 0, 0, 0
    for l in nuevas:
        try:
            doc = traer(l, reintentos=1)
            cache[l] = parsear_cap(doc)
            abiertas += 1
            seguidos_429 = 0
        except urllib.error.HTTPError as e:
            fallidas += 1
            seguidos_429 = seguidos_429 + 1 if e.code == 429 else 0
            print(f"falló {l}: HTTP {e.code}")
            if seguidos_429 >= MAX_429_SEGUIDOS:
                print("El SMN está frenando las consultas; sigo en la próxima corrida.")
                break
        except Exception as e:
            fallidas += 1
            print(f"falló {l}: {e}")
        time.sleep(PAUSA)

    # Olvidar las alertas que ya no están en la lista del SMN
    vigentes_en_feed = set(alertas_links)
    cache = {k: v for k, v in cache.items() if k in vigentes_en_feed}

    resultado, vistos, todas_areas = [], set(), set()
    for l in alertas_links:
        for a in cache.get(l, []):
            todas_areas.update(a["areas"])
            fin = parse_fecha(a["fin"])
            if fin and fin < ahora:
                continue
            if not afecta_catamarca(a):
                continue
            clave = (a["evento"], a["nivel"], a["inicio"], a["fin"], json.dumps(a["poligonos"])[:200])
            if clave in vistos:
                continue
            vistos.add(clave)
            a2 = {k: v for k, v in a.items() if k != "geocodes"}
            locs, _ = localidades_afectadas(a)
            a2["localidades"] = locs
            if not a2["areas"]:
                a2["areas"] = locs or ["Parte de la provincia de Catamarca"]
            resultado.append(a2)

    leidas = sum(1 for l in alertas_links if l in cache)
    out = {
        "revisado": ahora.isoformat(),
        "fuente": "Servicio Meteorológico Nacional (SMN) – feed CAP oficial, licencia CC BY 4.0",
        "alertasEnFeed": len(alertas_links),
        "alertasLeidas": leidas,
        "completo": leidas >= len(alertas_links),
        "alertas": resultado,
        "avisosCortoPlazo": avisos,
        "muestraDeAreas": sorted(todas_areas)[:60],
    }
    json.dump(cache, open(ruta_cache, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(out, open(ruta_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Feed: {len(alertas_links)} alertas, {len(avisos)} avisos corto plazo de Catamarca. "
          f"Abiertas ahora: {abiertas}, fallidas: {fallidas}, leídas en total: {leidas}. "
          f"Alertas para Catamarca: {len(resultado)}")


if __name__ == "__main__":
    main()
