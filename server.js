/**
 * server.js
 * API REST — Cotizador de departamentos CABA
 *
 * Endpoints:
 *   GET /api/barrios          → lista de barrios disponibles
 *   GET /api/cotizar          → cotización por barrio + metros
 *   GET /api/precios          → todos los precios del cache
 *   GET /api/status           → estado del cache y última actualización
 *   POST /api/scrape          → fuerza un scraping manual (requiere API_KEY)
 *
 * Variables de entorno (.env):
 *   PORT=3001
 *   API_KEY=tu_clave_secreta   (para proteger /api/scrape)
 *   DOLAR_MEP=1300             (tipo de cambio manual, sobreescribe el fetch dinámico)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const axios = require('axios');
const { scrapeAll } = require('./scraper');
const { initDB, cargarDatos, getStatus } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'dev-key-cambiar-en-produccion';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// DÓLAR MEP — fetch dinámico con cache en memoria
// Fuente: bluelytics.com.ar (API pública, sin auth)
// Se actualiza una vez por día via cron.
// Si falla, usa DOLAR_MEP del .env o el último valor conocido.
// ─────────────────────────────────────────────
let dolarCache = {
  mep: parseFloat(process.env.DOLAR_MEP) || 1400,
  oficial: null,
  blue: null,
  actualizadoAt: null,
};

async function actualizarDolar() {
  try {
    const { data } = await axios.get('https://api.bluelytics.com.ar/v2/latest', { timeout: 8000 });
    const mep = data?.oficial?.value_sell ?? null;
    const blue = data?.blue?.value_sell ?? null;
    const oficial = data?.oficial?.value_sell ?? null;

    // Bluelytics no tiene MEP/bolsa directamente; usamos el promedio blue-oficial
    // como aproximación del dólar financial. Si preferís otra fuente, cambiá acá.
    const mepCalc = blue && oficial ? Math.round((blue + oficial) / 2) : null;

    // Si hay DOLAR_MEP en .env, siempre tiene prioridad (útil para prod sin bluelytics)
    if (!process.env.DOLAR_MEP) {
      dolarCache.mep     = mepCalc || blue || oficial || dolarCache.mep;
    }
    dolarCache.oficial      = oficial;
    dolarCache.blue         = blue;
    dolarCache.actualizadoAt = new Date().toISOString();

    console.log(`[DÓLAR] Actualizado: oficial=$${oficial} blue=$${blue} → usando $${dolarCache.mep} (MEP estimado)`);
  } catch (err) {
    console.warn(`[DÓLAR] No se pudo actualizar: ${err.message} — manteniendo $${dolarCache.mep}`);
  }
}

function getDolarMep() {
  // Si hay override manual en .env, siempre gana
  if (process.env.DOLAR_MEP) return parseFloat(process.env.DOLAR_MEP);
  return dolarCache.mep;
}

// ─────────────────────────────────────────────
// DATOS FALLBACK (ZonaProp Index Feb 2026)
// ─────────────────────────────────────────────
const FALLBACK = {
  puerto_madero:    { nombre: 'Puerto Madero',    m2_mediana: 6152, m2_min: 4800, m2_max: 8200, region: 'Corredor Norte',    alq_ratio: 0.0042 },
  palermo:          { nombre: 'Palermo',          m2_mediana: 3390, m2_min: 2800, m2_max: 4200, region: 'Corredor Norte',    alq_ratio: 0.0045 },
  belgrano:         { nombre: 'Belgrano',         m2_mediana: 3050, m2_min: 2500, m2_max: 3800, region: 'Corredor Norte',    alq_ratio: 0.0044 },
  nuñez:            { nombre: 'Núñez',            m2_mediana: 3413, m2_min: 2800, m2_max: 4200, region: 'Corredor Norte',    alq_ratio: 0.0043 },
  recoleta:         { nombre: 'Recoleta',         m2_mediana: 3300, m2_min: 2700, m2_max: 4100, region: 'Corredor Norte',    alq_ratio: 0.0044 },
  barrio_norte:     { nombre: 'Barrio Norte',     m2_mediana: 3100, m2_min: 2500, m2_max: 3900, region: 'Corredor Norte',    alq_ratio: 0.0043 },
  colegiales:       { nombre: 'Colegiales',       m2_mediana: 2800, m2_min: 2250, m2_max: 3500, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  chacarita:        { nombre: 'Chacarita',        m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Corredor Noroeste', alq_ratio: 0.0047 },
  villa_urquiza:    { nombre: 'Villa Urquiza',    m2_mediana: 2450, m2_min: 1950, m2_max: 3050, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  villa_del_parque: { nombre: 'Villa del Parque', m2_mediana: 2350, m2_min: 1880, m2_max: 2950, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  retiro:           { nombre: 'Retiro',           m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Macrocentro',       alq_ratio: 0.0045 },
  san_nicolas:      { nombre: 'San Nicolás',      m2_mediana: 2150, m2_min: 1700, m2_max: 2700, region: 'Macrocentro',       alq_ratio: 0.0044 },
  monserrat:        { nombre: 'Monserrat',        m2_mediana: 2100, m2_min: 1650, m2_max: 2650, region: 'Macrocentro',       alq_ratio: 0.0044 },
  san_telmo:        { nombre: 'San Telmo',        m2_mediana: 2050, m2_min: 1600, m2_max: 2600, region: 'Macrocentro',       alq_ratio: 0.0044 },
  balvanera:        { nombre: 'Balvanera',        m2_mediana: 2050, m2_min: 1600, m2_max: 2600, region: 'Macrocentro',       alq_ratio: 0.0043 },
  villa_crespo:     { nombre: 'Villa Crespo',     m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Noroeste',          alq_ratio: 0.0046 },
  caballito:        { nombre: 'Caballito',        m2_mediana: 2350, m2_min: 1880, m2_max: 2950, region: 'Noroeste',          alq_ratio: 0.0046 },
  almagro:          { nombre: 'Almagro',          m2_mediana: 2215, m2_min: 1750, m2_max: 2750, region: 'Noroeste',          alq_ratio: 0.0045 },
  flores:           { nombre: 'Flores',           m2_mediana: 1930, m2_min: 1520, m2_max: 2430, region: 'Noroeste',          alq_ratio: 0.0045 },
  liniers:          { nombre: 'Liniers',          m2_mediana: 1850, m2_min: 1420, m2_max: 2330, region: 'Oeste',             alq_ratio: 0.0046 },
  mataderos:        { nombre: 'Mataderos',        m2_mediana: 1700, m2_min: 1300, m2_max: 2150, region: 'Oeste',             alq_ratio: 0.0046 },
  boedo:            { nombre: 'Boedo',            m2_mediana: 2250, m2_min: 1780, m2_max: 2830, region: 'Sur-Este',          alq_ratio: 0.0046 },
  barracas:         { nombre: 'Barracas',         m2_mediana: 1920, m2_min: 1480, m2_max: 2430, region: 'Sur-Este',          alq_ratio: 0.0046 },
  nueva_pompeya:    { nombre: 'Nueva Pompeya',    m2_mediana: 1478, m2_min: 1100, m2_max: 1900, region: 'Sur',               alq_ratio: 0.0048 },
  la_boca:          { nombre: 'La Boca',          m2_mediana: 1560, m2_min: 1150, m2_max: 2000, region: 'Sur',               alq_ratio: 0.0046 },
  lugano:           { nombre: 'Lugano',           m2_mediana: 1098, m2_min:  830, m2_max: 1420, region: 'Sur',               alq_ratio: 0.0048 },
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
async function getMergedData() {
  return { data: { ...FALLBACK }, cache: null, dolarMep: getDolarMep() };
}

// ─────────────────────────────────────────────
// AUTO-UPDATE MENSUAL — PDF ZonaProp
// ─────────────────────────────────────────────
async function actualizarDesdePDF() {
  const now = new Date();
  const reportDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year  = reportDate.getFullYear();
  const month = String(reportDate.getMonth() + 1).padStart(2, '0');
  const uploadYear  = now.getFullYear();
  const uploadMonth = String(now.getMonth() + 1).padStart(2, '0');

  const url = `https://www.zonaprop.com.ar/blog/wp-content/uploads/${uploadYear}/${uploadMonth}/INDEX_CABA_REPORTE_${year}-${month}.pdf`;
  console.log(`[PDF-UPDATE] Intentando descargar reporte ${year}-${month}...`);

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.zonaprop.com.ar/blog/zpindex/',
      },
    });

    const pdfParse = require('pdf-parse');
    const data = await pdfParse(response.data);
    const text = data.text;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const barriosExtraidos = {};

    const BARRIO_MAP = {
      'Puerto Madero': 'puerto_madero', 'Palermo': 'palermo', 'Belgrano': 'belgrano',
      'Nuñez': 'nuñez', 'Núñez': 'nuñez', 'Recoleta': 'recoleta',
      'Colegiales': 'colegiales', 'Chacarita': 'chacarita', 'Villa Urquiza': 'villa_urquiza',
      'Villa del Parque': 'villa_del_parque', 'Retiro': 'retiro', 'San Nicolás': 'san_nicolas',
      'San Nicolas': 'san_nicolas', 'Monserrat': 'monserrat', 'San Telmo': 'san_telmo',
      'Balvanera': 'balvanera', 'Villa Crespo': 'villa_crespo', 'Caballito': 'caballito',
      'Almagro': 'almagro', 'Flores': 'flores', 'Liniers': 'liniers',
      'Mataderos': 'mataderos', 'Boedo': 'boedo', 'Barracas': 'barracas',
      'Nueva Pompeya': 'nueva_pompeya', 'La Boca': 'la_boca', 'Lugano': 'lugano',
    };

    lines.forEach(line => {
      Object.entries(BARRIO_MAP).forEach(([nombre, key]) => {
        if (line.includes(nombre)) {
          const numMatch = line.match(/([\d]{1,2}[.,][\d]{3})/);
          if (numMatch) {
            const precio = parseFloat(numMatch[1].replace(/\./g,'').replace(',','.'));
            if (precio > 500 && precio < 10000) barriosExtraidos[key] = precio;
          }
        }
      });
    });

    if (Object.keys(barriosExtraidos).length > 3) {
      Object.entries(barriosExtraidos).forEach(([key, precio]) => {
        if (FALLBACK[key]) {
          FALLBACK[key].m2_mediana = precio;
          FALLBACK[key].m2_min = Math.round(precio * 0.85);
          FALLBACK[key].m2_max = Math.round(precio * 1.15);
        }
      });
      console.log(`[PDF-UPDATE] ✅ FALLBACK actualizado con datos ${year}-${month} (${Object.keys(barriosExtraidos).length} barrios)`);
    } else {
      console.log(`[PDF-UPDATE] ⚠️ Pocos barrios extraídos, manteniendo datos anteriores`);
    }
  } catch (err) {
    console.warn(`[PDF-UPDATE] No se pudo actualizar desde PDF: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// CRONS
// ─────────────────────────────────────────────

// Scraping diario — 06:00hs todos los días
// Después del scraping regenera las páginas estáticas con precios frescos
  console.log('[CRON] Scraping diario iniciado...');
// cron.schedule('0 10 5 * *', async () => {
  try {
    await scrapeAll();
    console.log('[CRON] Scraping completado — regenerando páginas SEO...');
    require('child_process').execFile('node', ['generate-pages.js'], { cwd: __dirname }, (err) => {
      if (err) console.error('[CRON] Error generando páginas:', err.message);
      else console.log('[CRON] Páginas SEO regeneradas con precios del día');
    });
  } catch (err) {
    console.error('[CRON] Error en scraping diario:', err.message);
  }
});

// Actualización dólar — cada día a las 09:00hs (después de la apertura de mercados)
cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] Actualizando tipo de cambio...');
  await actualizarDolar();
});

// Actualización PDF ZonaProp — día 5 de cada mes a las 10:00hs
cron.schedule('0 10 5 * *', async () => {
  console.log('[CRON] Actualizando datos desde ZonaProp PDF mensual...');
  await actualizarDesdePDF();
});

// ─────────────────────────────────────────────
// FACTORES DE AJUSTE
// ─────────────────────────────────────────────
const FACTORES_ANTIGUEDAD = {
  '0-5':        { label: 'Nuevo (0-5 años)',          factor: 1.25 },
  '6-15':       { label: 'Moderno (6-15 años)',        factor: 1.12 },
  '16-30':      { label: 'Intermedio (16-30 años)',    factor: 1.00 },
  '31-50':      { label: 'Antiguo (31-50 años)',       factor: 0.88 },
  '50+':        { label: 'Muy antiguo (+50 años)',     factor: 0.78 },
  'refaccionado': { label: 'Refaccionado/reciclado',  factor: 1.08 },
};

const AMENITIES_CONFIG = {
  pileta:       { label: 'Pileta',              impacto: 0.08, icono: '🏊' },
  gimnasio:     { label: 'Gimnasio',            impacto: 0.05, icono: '🏋️' },
  sum:          { label: 'SUM / Salón de usos', impacto: 0.03, icono: '🎉' },
  seguridad24:  { label: 'Seguridad 24hs',      impacto: 0.04, icono: '💂' },
  cochera:      { label: 'Cochera incluida',    impacto: 0.10, icono: '🚗' },
  terraza:      { label: 'Terraza / rooftop',   impacto: 0.04, icono: '🌆' },
  laundry:      { label: 'Laundry',             impacto: 0.02, icono: '🧺' },
  coworking:    { label: 'Coworking',           impacto: 0.03, icono: '💻' },
  quincho:      { label: 'Quincho/parrilla',    impacto: 0.03, icono: '🔥' },
  portero:      { label: 'Portero/encargado',   impacto: 0.02, icono: '🏢' },
  bicicletero:  { label: 'Bicicletero',         impacto: 0.01, icono: '🚲' },
  vista_al_rio: { label: 'Vista al río/parque', impacto: 0.06, icono: '🌊' },
};

function calcularFactorAmenities(amenitiesKeys) {
  if (!amenitiesKeys || amenitiesKeys.length === 0) return { factor: 1.0, impacto_total: 0, detalle: [] };

  const detalle = [];
  let impactoAcumulado = 0;

  const sorted = amenitiesKeys
    .filter(k => AMENITIES_CONFIG[k])
    .sort((a, b) => AMENITIES_CONFIG[b].impacto - AMENITIES_CONFIG[a].impacto);

  sorted.forEach((key, idx) => {
    const cfg = AMENITIES_CONFIG[key];
    const impactoEfectivo = cfg.impacto * Math.pow(0.85, idx);
    impactoAcumulado += impactoEfectivo;
    detalle.push({ key, label: cfg.label, icono: cfg.icono, impacto_nominal: cfg.impacto, impacto_efectivo: parseFloat(impactoEfectivo.toFixed(4)) });
  });

  const impactoFinal = Math.min(impactoAcumulado, 0.40);
  return { factor: parseFloat((1 + impactoFinal).toFixed(4)), impacto_total: parseFloat((impactoFinal * 100).toFixed(1)), detalle, cap_aplicado: impactoAcumulado > 0.40 };
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

app.get('/api/barrios', async (req, res) => {
  const { data } = await getMergedData();
  const barrios = Object.entries(data).map(([key, b]) => ({ key, nombre: b.nombre, region: b.region, m2_mediana: b.m2_mediana }));
  res.json({ ok: true, barrios });
});

app.get('/api/amenities', (req, res) => {
  res.json({
    ok: true,
    amenities: Object.entries(AMENITIES_CONFIG).map(([key, v]) => ({ key, ...v })),
    antiguedad: Object.entries(FACTORES_ANTIGUEDAD).map(([key, v]) => ({ key, ...v })),
  });
});

app.get('/api/cotizar', async (req, res) => {
  const { barrio: barrioKey, metros: metrosStr, tipo = 'depto', op = 'venta', antiguedad = '16-30', amenities: amenitiesStr = '' } = req.query;

  if (!barrioKey) return res.status(400).json({ ok: false, error: 'Parámetro barrio requerido' });
  const metros = parseFloat(metrosStr);
  if (!metros || metros < 10 || metros > 2000) return res.status(400).json({ ok: false, error: 'Metros debe ser entre 10 y 2000' });

  const { data, cache, dolarMep } = await getMergedData();
  const b = data[barrioKey];
  if (!b) return res.status(404).json({ ok: false, error: `Barrio '${barrioKey}' no encontrado` });

  const ajustesTipo = { depto: 1.0, ph: 0.90, estrenar: 1.12, pozo: 0.88 };
  const factorTipo = ajustesTipo[tipo] ?? 1.0;
  const cfgAntiguedad = FACTORES_ANTIGUEDAD[antiguedad] || FACTORES_ANTIGUEDAD['16-30'];
  const factorAntiguedad = cfgAntiguedad.factor;
  const amenitiesKeys = amenitiesStr ? amenitiesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const amenitiesResult = calcularFactorAmenities(amenitiesKeys);
  const factorAmenities = amenitiesResult.factor;
  const factorTotal = factorTipo * factorAntiguedad * factorAmenities;
  const factorBase  = factorTipo;

  const m2_base = Math.round(b.m2_mediana * factorBase);
  const m2      = Math.round(b.m2_mediana * factorTotal);
  const m2_min  = Math.round(b.m2_min * factorTotal);
  const m2_max  = Math.round(b.m2_max * factorTotal);

  const precioUSD    = Math.round(m2 * metros);
  const precioMinUSD = Math.round(m2_min * metros);
  const precioMaxUSD = Math.round(m2_max * metros);
  const precioPesos  = precioUSD * dolarMep;
  const precioBaseUSD = Math.round(m2_base * metros);
  const diferenciaPct = parseFloat(((precioUSD - precioBaseUSD) / precioBaseUSD * 100).toFixed(1));

  const ALQ_BASE_CABA_M2_MES = global.ALQ_BASE_CABA_M2_MES_ACTUALIZADO || 16200;
  const PROMEDIO_VENTA_CABA  = 2455;
  const factorZonal = b.m2_mediana / PROMEDIO_VENTA_CABA;
  const alqBaseM2Mes = Math.round(ALQ_BASE_CABA_M2_MES * factorZonal);
  const alqM2Mes    = b.alq_m2_mes     || alqBaseM2Mes;
  const alqM2MesMin = b.alq_m2_mes_min || Math.round(alqM2Mes * 0.88);
  const alqM2MesMax = b.alq_m2_mes_max || Math.round(alqM2Mes * 1.12);

  const alqMesPesos = Math.round(alqM2Mes * metros * factorTotal);
  const alqMinPesos = Math.round(alqM2MesMin * metros * factorTotal);
  const alqMaxPesos = Math.round(alqM2MesMax * metros * factorTotal);
  const alqRentabilidad = ((alqMesPesos * 12) / precioPesos * 100).toFixed(1);
  const añosRecupero    = (100 / parseFloat(alqRentabilidad)).toFixed(1);

  const promedioCABA = 2452;
  const diffVsPromedio = ((m2 - promedioCABA) / promedioCABA * 100).toFixed(1);

  const cotizacion = {
    barrio: { key: barrioKey, nombre: b.nombre, region: b.region },
    inputs: { metros, tipo, op, antiguedad, amenities: amenitiesKeys },
    ajustes: {
      factor_tipo:       { valor: factorTipo,       label: tipo,              impacto_pct: parseFloat(((factorTipo - 1) * 100).toFixed(1)) },
      factor_antiguedad: { valor: factorAntiguedad, label: cfgAntiguedad.label, impacto_pct: parseFloat(((factorAntiguedad - 1) * 100).toFixed(1)) },
      factor_amenities:  { valor: factorAmenities,  impacto_pct: amenitiesResult.impacto_total, detalle: amenitiesResult.detalle, cap_aplicado: amenitiesResult.cap_aplicado },
      factor_total:      parseFloat(factorTotal.toFixed(4)),
      precio_sin_ajustes_usd: precioBaseUSD,
      diferencia_vs_base_pct: diferenciaPct,
    },
    venta: {
      precio_usd:     precioUSD,
      precio_usd_min: precioMinUSD,
      precio_usd_max: precioMaxUSD,
      precio_pesos:   precioPesos,
      m2_usd:         m2,
      dolar_mep:      dolarMep,
    },
    alquiler: op === 'alquiler' || op === 'ambos' ? {
      estimado_mes_pesos: alqMesPesos,
      min_pesos: alqMinPesos,
      max_pesos: alqMaxPesos,
      rentabilidad_bruta_anual: parseFloat(alqRentabilidad),
      años_recupero: parseFloat(añosRecupero),
      fuente: b.alq_m2_mes ? 'scraping_tiempo_real' : 'estimacion_fallback',
      muestras: b.muestras_alquiler || 0,
    } : null,
    mercado: {
      promedio_caba_m2: promedioCABA,
      diferencia_vs_promedio_pct: parseFloat(diffVsPromedio),
      muestras_scraping: b.muestras || null,
      datos_desde: b.timestamp || 'ZonaProp-Index-Feb-2026',
      fuente_scraping: b.fuentes || null,
    },
  };

  res.json({ ok: true, cotizacion });
});

app.get('/api/precios', async (req, res) => {
  const { data, cache } = await getMergedData();
  res.json({ ok: true, ultima_actualizacion: cache?.ultima_actualizacion || 'ZonaProp-Index-Feb-2026', total_barrios: Object.keys(data).length, barrios: data });
});

app.get('/api/status', async (req, res) => {
  const status = await getStatus();
  res.json({
    ok: true,
    servidor: 'online',
    cache: status.existe ? {
      existe: true,
      ultima_actualizacion: status.ultima_actualizacion,
      barrios_cacheados: status.total_barrios,
      storage: status.storage,
    } : { existe: false, mensaje: 'Usando datos ZonaProp Index Feb 2026', storage: status.storage },
    dolar: {
      mep: getDolarMep(),
      oficial: dolarCache.oficial,
      blue: dolarCache.blue,
      actualizado_at: dolarCache.actualizadoAt,
      fuente: process.env.DOLAR_MEP ? 'variable-de-entorno' : 'bluelytics-api',
    },
    crons: {
      scraping_diario: '06:00hs todos los días',
      dolar: '09:00hs todos los días',
      pdf_mensual: 'día 5 de cada mes a las 10:00hs',
    },
  });
});

let ultimoScrapeManual = null;
const MINUTOS_ENTRE_SCRAPES = 120;

app.post('/api/scrape', async (req, res) => {
  const key = req.headers['x-api-key'] || req.body?.api_key;
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: 'Clave incorrecta' });

  if (ultimoScrapeManual) {
    const minutosPasados = (Date.now() - ultimoScrapeManual) / 1000 / 60;
    if (minutosPasados < MINUTOS_ENTRE_SCRAPES) {
      const minutosRestantes = Math.ceil(MINUTOS_ENTRE_SCRAPES - minutosPasados);
      return res.status(429).json({ ok: false, error: `Esperá ${minutosRestantes} minutos antes de volver a actualizar` });
    }
  }

  ultimoScrapeManual = Date.now();
  res.json({ ok: true, mensaje: 'Scraping iniciado. Los datos se actualizarán en 5-10 minutos.' });
  scrapeAll().catch(err => console.error('[Manual scrape]', err.message));
});

// ─────────────────────────────────────────────
// RUTAS SEO — páginas estáticas por barrio
// Generadas con: node generate-pages.js
// ─────────────────────────────────────────────

// GET /barrios → índice de todos los barrios
app.get('/barrios', (req, res) => {
  const file = path.join(__dirname, 'public', 'barrios.html');
  if (require('fs').existsSync(file)) {
    res.sendFile(file);
  } else {
    res.redirect('/');
  }
});

// GET /barrio/:key → página individual del barrio
app.get('/barrio/:key', (req, res) => {
  const file = path.join(__dirname, 'public', 'barrio', `${req.params.key}.html`);
  if (require('fs').existsSync(file)) {
    res.sendFile(file);
  } else {
    res.redirect('/barrios');
  }
});

// Catch-all → SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
initDB().then(async () => {
  app.listen(PORT, () => {
    console.log(`\n🏠 Cotizador CABA API corriendo en http://localhost:${PORT}`);
    console.log(`   Frontend: http://localhost:${PORT}`);
    console.log(`   API docs: http://localhost:${PORT}/api/status\n`);
  });

  // Al arrancar: actualizar dólar y PDF en paralelo, sin bloquear el servidor
  Promise.allSettled([
    actualizarDolar(),
  ]).then(results => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn(`[INICIO] tarea ${i}:`, r.reason?.message);
    });
  });

  // Generar páginas SEO siempre al arrancar (Railway borra archivos en cada deploy)
  console.log('[INICIO] Generando páginas SEO...');
  require('child_process').execFile('node', ['generate-pages.js'], { cwd: __dirname }, (err) => {
    if (err) console.error('[INICIO] Error generando páginas:', err.message);
    else console.log('[INICIO] Páginas SEO listas');
  });
});
