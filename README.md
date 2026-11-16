# Cata del Clima

Un proyecto del **Instituto Cecilia Grierson | La Carrillo**, asociación civil sin fines de lucro de Catamarca.

Panel ciudadano con:
1. **Alertas oficiales del SMN** para Catamarca (feed CAP oficial + avisos a corto plazo), con las zonas dibujadas en el mapa.
2. **Señales de 3 modelos** (ECMWF, GFS, ICON) en 11 localidades de Catamarca y 6 de provincias vecinas, indicando cuántos modelos coinciden.
3. **Satélite GOES-19** (infrarrojo y color), actualizado cada 10 minutos.
4. **Mapa animado** (Windy) y links a rayos en vivo (Blitzortung) y radares del SMN.

No emite alertas propias: cada bloque muestra su fuente.

## Archivos

```
index.html            página
styles.css            estilos
app.js                lógica (modelos, mapa, satélite)
functions/api/alertas.js   función de Cloudflare que lee el SMN (necesaria por CORS)
```

## Publicarlo gratis (Cloudflare Pages)

La función `/api/alertas` solo corre en Cloudflare Pages. Por eso conviene publicarlo desde GitHub o con Wrangler; **subir la carpeta arrastrándola no activa la función**.

**Opción A: con GitHub (recomendada)**
1. Creá un repositorio en GitHub y subí todo el contenido de esta carpeta (respetando `functions/api/`).
2. En Cloudflare: Workers & Pages → Create → Pages → *Connect to Git* → elegí el repo.
3. Framework preset: **None**. Build command: vacío. Build output directory: `/`.
4. Deploy. Te queda en `https://<nombre>.pages.dev`.

**Opción B: desde la terminal**
```
npm i -g wrangler
wrangler login
wrangler pages deploy . --project-name cata-del-clima
```

**Dominio propio:** en el proyecto de Pages → Custom domains → Set up a custom domain.

## Probarlo

- `https://<tu-sitio>/api/alertas` tiene que devolver un JSON con `alertas` y `avisosCortoPlazo`. Si aparece algo en `errores`, el SMN no respondió o cambió el formato del feed.
- La página muestra un mensaje con link a smn.gob.ar si el feed falla, así nunca queda en blanco.

## Ajustes fáciles

- Localidades: lista `LOCALIDADES` al principio de `app.js`.
- Umbrales de señal (CAPE, ráfagas, lluvia): función `analizar` en `app.js`, y su explicación en `index.html` (“¿Cómo se calcula la señal?”).

## Licencias y monetización

- **Open-Meteo**: gratis para uso **no comercial**. Si ponés anuncios o patrocinios, corresponde contratar su plan comercial (o usar tu propia API key). Atribución CC BY 4.0 ya incluida.
- **Windy embed**, **Blitzortung**: revisar sus condiciones antes de monetizar. Blitzortung en particular es un proyecto comunitario no comercial, por eso solo se enlaza.
- **SMN y NOAA**: datos públicos; se cita la fuente.
