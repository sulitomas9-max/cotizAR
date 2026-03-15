# CotizAR — Cotizador de Departamentos CABA

Scraper + API REST + Frontend para cotizar departamentos en Buenos Aires
en tiempo real, con datos de ZonaProp y Argenprop.

---

## Estructura del proyecto

```
cotizar-caba/
├── backend/
│   ├── server.js        ← API Express + cron de scraping
│   ├── scraper.js       ← Playwright (ZonaProp) + Axios/Cheerio (Argenprop)
│   ├── cache.json       ← generado automáticamente tras el primer scrape
│   ├── .env.example     ← copiar a .env y editar
│   └── package.json
└── frontend/
    └── public/
        └── index.html   ← SPA servida por el backend
```

---

## Requisitos previos

- **Node.js** v18 o superior → https://nodejs.org
- **Git** (opcional)

---

## Instalación

### 1. Instalar dependencias del backend

```bash
cd backend
npm install
npx playwright install chromium
```

> `playwright install chromium` descarga el navegador headless (~130MB).
> Solo se hace una vez.

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editá `.env` y ajustá:
- `PORT` → puerto del servidor (default 3001)
- `API_KEY` → clave para proteger el endpoint de scraping manual
- `DOLAR_MEP` → tipo de cambio actual (actualizalo manualmente o conectalo a una API)

### 3. Primer scraping (obtener datos frescos)

```bash
node scraper.js
```

Esto tarda ~5-10 minutos y genera `cache.json` con los precios actuales.
Mientras el scraper corre, podés iniciar el servidor en otra terminal —
va a usar los datos fallback (ZonaProp Index Sep 2025) hasta que el cache esté listo.

### 4. Iniciar el servidor

```bash
node server.js
# o con hot-reload:
npm run dev
```

Abrí http://localhost:3001 en el navegador.

---

## API Endpoints

### `GET /api/barrios`
Lista de barrios disponibles con precio mediano actual.

```json
{
  "ok": true,
  "barrios": [
    { "key": "palermo", "nombre": "Palermo", "region": "Corredor Norte", "m2_mediana": 3362 }
  ]
}
```

### `GET /api/cotizar`
Cotización para un barrio y superficie específicos.

**Parámetros:**
| Param   | Tipo   | Requerido | Descripción                                      |
|---------|--------|-----------|--------------------------------------------------|
| barrio  | string | Sí        | Key del barrio (ej: `palermo`, `caballito`)     |
| metros  | number | Sí        | Superficie en m² (10-2000)                      |
| tipo    | string | No        | `depto` (def), `ph`, `estrenar`, `pozo`         |
| op      | string | No        | `venta` (def), `alquiler`, `ambos`              |

**Ejemplo:**
```
GET /api/cotizar?barrio=palermo&metros=65&tipo=depto&op=ambos
```

**Respuesta:**
```json
{
  "ok": true,
  "cotizacion": {
    "barrio": { "key": "palermo", "nombre": "Palermo", "region": "Corredor Norte" },
    "inputs": { "metros": 65, "tipo": "depto", "op": "ambos" },
    "venta": {
      "precio_usd": 218530,
      "precio_usd_min": 200847,
      "precio_usd_max": 236013,
      "precio_pesos": 284089000,
      "m2_usd": 3362,
      "dolar_mep": 1300
    },
    "alquiler": {
      "estimado_mes_pesos": 1027170,
      "min_pesos": 873095,
      "max_pesos": 1181246,
      "rentabilidad_bruta_anual": 4.3,
      "años_recupero": 23.2
    },
    "mercado": {
      "promedio_caba_m2": 2452,
      "diferencia_vs_promedio_pct": 37.1,
      "muestras_scraping": 84,
      "datos_desde": "2025-03-15T06:00:00.000Z"
    }
  }
}
```

### `GET /api/precios`
Todos los barrios con sus precios actuales del cache.

### `GET /api/status`
Estado del servidor y del cache.

### `POST /api/scrape`
Fuerza un scraping manual.
Requiere header `x-api-key: tu_clave` o body `{ "api_key": "tu_clave" }`.

---

## Scraping automático

El servidor ejecuta un scraping automático **todos los días a las 6:00am**
usando `node-cron`. Los resultados se guardan en `cache.json`.

Para cambiar la frecuencia, editá esta línea en `server.js`:
```js
cron.schedule('0 6 * * *', ...)
// Formato: minuto hora día-mes mes día-semana
// Cada 12hs: '0 6,18 * * *'
// Cada hora: '0 * * * *'
```

---

## Actualizar el tipo de cambio automáticamente

Podés conectar el tipo de cambio a una API gratuita. Agregá esto al inicio de `server.js`:

```js
const axios = require('axios');

async function actualizarDolar() {
  try {
    // API gratuita de tipo de cambio Argentina
    const { data } = await axios.get('https://dolarapi.com/v1/dolares/bolsa');
    process.env.DOLAR_MEP = data.venta;
    console.log(`[Dólar] MEP actualizado: $${data.venta}`);
  } catch (err) {
    console.warn('[Dólar] No se pudo actualizar:', err.message);
  }
}

// Actualizar al inicio y cada hora
actualizarDolar();
cron.schedule('0 * * * *', actualizarDolar);
```

---

## Deploy en producción

### Con PM2 (recomendado)
```bash
npm install -g pm2
pm2 start server.js --name cotizar-caba
pm2 save
pm2 startup
```

### Con Docker
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y chromium
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
RUN npx playwright install chromium --with-deps
COPY backend/ .
COPY frontend/ ../frontend/
ENV PORT=3001
CMD ["node", "server.js"]
```

---

## Notas importantes

- **Respetá los términos de uso** de ZonaProp y Argenprop.
- El scraper incluye pausas entre requests para no sobrecargar los servidores.
- Si los sitios cambian su markup, los selectores en `scraper.js` pueden necesitar actualización.
- Los precios son de **oferta publicada** — el precio real de cierre suele ser 5-10% menor.

---

## Licencia

MIT — Libre para uso personal y comercial.
