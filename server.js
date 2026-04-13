/**
 * server.js
 * API REST — Cotizador de departamentos CABA
 *
 * Endpoints:
 *   GET /api/barrios          → lista de barrios disponibles
 *   GET /api/cotizar          → cotización por barrio + metros
 *   GET /api/precios          → todos los precios del cache
 *   GET /api/status           → estado del cache y última actualización
 *   GET /api/noticias         → noticias scrapeadas de RSS (sin API externa)
 *   GET /api/dolar            → tipo de cambio MEP en tiempo real
 *   POST /api/alerta          → guardar alerta de precio (server-side log)
 *   POST /api/scrape          → fuerza un scraping manual (requiere API_KEY)
 *
 * Variables de entorno (.env):
 *   PORT=3001
 *   API_KEY=tu_clave_secreta
 *   DOLAR_MEP=1400             (tipo de cambio manual, opcional)
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const path    = require('path');
const axios   = require('axios');
const { scrapeAll }                       = require('./scraper');
const { initDB, cargarDatos, getStatus }  = require('./db');

const app     = express();
const PORT    = process.env.PORT    || 3001;
const API_KEY = process.env.API_KEY || 'dev-key-cambiar-en-produccion';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// DATOS FALLBACK — 48 barrios oficiales CABA
// Precios USD/m² basados en ZonaProp Index 2025
// Rangos calibrados por mercado real por zona
// ─────────────────────────────────────────────
const FALLBACK = {
  // ── CORREDOR NORTE ──
  puerto_madero:    { nombre: 'Puerto Madero',    m2_mediana: 6152, m2_min: 4800, m2_max: 8200, region: 'Corredor Norte',    alq_ratio: 0.0042 },
  palermo:          { nombre: 'Palermo',          m2_mediana: 3390, m2_min: 2800, m2_max: 4200, region: 'Corredor Norte',    alq_ratio: 0.0045 },
  belgrano:         { nombre: 'Belgrano',         m2_mediana: 3050, m2_min: 2500, m2_max: 3800, region: 'Corredor Norte',    alq_ratio: 0.0044 },
  nunez:            { nombre: 'Núñez',            m2_mediana: 3413, m2_min: 2800, m2_max: 4200, region: 'Corredor Norte',    alq_ratio: 0.0043 },
  recoleta:         { nombre: 'Recoleta',         m2_mediana: 3300, m2_min: 2700, m2_max: 4100, region: 'Corredor Norte',    alq_ratio: 0.0044 },
  barrio_norte:     { nombre: 'Barrio Norte',     m2_mediana: 3100, m2_min: 2500, m2_max: 3900, region: 'Corredor Norte',    alq_ratio: 0.0043 },
  saavedra:         { nombre: 'Saavedra',         m2_mediana: 2580, m2_min: 2050, m2_max: 3200, region: 'Corredor Norte',    alq_ratio: 0.0045 },
  // ── CORREDOR NOROESTE ──
  colegiales:       { nombre: 'Colegiales',       m2_mediana: 2800, m2_min: 2250, m2_max: 3500, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  chacarita:        { nombre: 'Chacarita',        m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Corredor Noroeste', alq_ratio: 0.0047 },
  villa_urquiza:    { nombre: 'Villa Urquiza',    m2_mediana: 2450, m2_min: 1950, m2_max: 3050, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  villa_del_parque: { nombre: 'Villa del Parque', m2_mediana: 2350, m2_min: 1880, m2_max: 2950, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  villa_pueyrredon: { nombre: 'Villa Pueyrredón', m2_mediana: 2280, m2_min: 1820, m2_max: 2860, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  villa_devoto:     { nombre: 'Villa Devoto',     m2_mediana: 2320, m2_min: 1850, m2_max: 2900, region: 'Corredor Noroeste', alq_ratio: 0.0046 },
  la_paternal:      { nombre: 'La Paternal',      m2_mediana: 2150, m2_min: 1700, m2_max: 2700, region: 'Corredor Noroeste', alq_ratio: 0.0047 },
  agronomia:        { nombre: 'Agronomía',        m2_mediana: 2100, m2_min: 1650, m2_max: 2650, region: 'Corredor Noroeste', alq_ratio: 0.0047 },
  // ── MACROCENTRO ──
  retiro:           { nombre: 'Retiro',           m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Macrocentro',       alq_ratio: 0.0045 },
  san_nicolas:      { nombre: 'San Nicolás',      m2_mediana: 2150, m2_min: 1700, m2_max: 2700, region: 'Macrocentro',       alq_ratio: 0.0044 },
  monserrat:        { nombre: 'Monserrat',        m2_mediana: 2100, m2_min: 1650, m2_max: 2650, region: 'Macrocentro',       alq_ratio: 0.0044 },
  san_telmo:        { nombre: 'San Telmo',        m2_mediana: 2050, m2_min: 1600, m2_max: 2600, region: 'Macrocentro',       alq_ratio: 0.0044 },
  balvanera:        { nombre: 'Balvanera',        m2_mediana: 2050, m2_min: 1600, m2_max: 2600, region: 'Macrocentro',       alq_ratio: 0.0043 },
  constitucion:     { nombre: 'Constitución',     m2_mediana: 1980, m2_min: 1540, m2_max: 2500, region: 'Macrocentro',       alq_ratio: 0.0044 },
  congreso:         { nombre: 'Congreso',         m2_mediana: 2080, m2_min: 1620, m2_max: 2620, region: 'Macrocentro',       alq_ratio: 0.0044 },
  // ── CENTRO-OESTE ──
  villa_crespo:     { nombre: 'Villa Crespo',     m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Centro-Oeste',      alq_ratio: 0.0046 },
  caballito:        { nombre: 'Caballito',        m2_mediana: 2350, m2_min: 1880, m2_max: 2950, region: 'Centro-Oeste',      alq_ratio: 0.0046 },
  almagro:          { nombre: 'Almagro',          m2_mediana: 2215, m2_min: 1750, m2_max: 2750, region: 'Centro-Oeste',      alq_ratio: 0.0045 },
  boedo:            { nombre: 'Boedo',            m2_mediana: 2250, m2_min: 1780, m2_max: 2830, region: 'Centro-Oeste',      alq_ratio: 0.0046 },
  parque_chacabuco: { nombre: 'Parque Chacabuco', m2_mediana: 2180, m2_min: 1730, m2_max: 2740, region: 'Centro-Oeste',      alq_ratio: 0.0046 },
  parque_patricios: { nombre: 'Parque Patricios', m2_mediana: 2050, m2_min: 1590, m2_max: 2580, region: 'Centro-Oeste',      alq_ratio: 0.0046 },
  // ── OESTE ──
  flores:           { nombre: 'Flores',           m2_mediana: 1930, m2_min: 1520, m2_max: 2430, region: 'Oeste',             alq_ratio: 0.0045 },
  floresta:         { nombre: 'Floresta',         m2_mediana: 1870, m2_min: 1460, m2_max: 2360, region: 'Oeste',             alq_ratio: 0.0046 },
  monte_castro:     { nombre: 'Monte Castro',     m2_mediana: 1820, m2_min: 1420, m2_max: 2300, region: 'Oeste',             alq_ratio: 0.0046 },
  velez_sarsfield:  { nombre: 'Vélez Sársfield',  m2_mediana: 1800, m2_min: 1400, m2_max: 2270, region: 'Oeste',             alq_ratio: 0.0047 },
  villa_real:       { nombre: 'Villa Real',       m2_mediana: 1760, m2_min: 1370, m2_max: 2220, region: 'Oeste',             alq_ratio: 0.0047 },
  versalles:        { nombre: 'Versalles',        m2_mediana: 1790, m2_min: 1390, m2_max: 2260, region: 'Oeste',             alq_ratio: 0.0047 },
  villa_santa_rita: { nombre: 'Villa Santa Rita', m2_mediana: 1840, m2_min: 1440, m2_max: 2320, region: 'Oeste',             alq_ratio: 0.0047 },
  liniers:          { nombre: 'Liniers',          m2_mediana: 1850, m2_min: 1420, m2_max: 2330, region: 'Oeste',             alq_ratio: 0.0046 },
  mataderos:        { nombre: 'Mataderos',        m2_mediana: 1700, m2_min: 1300, m2_max: 2150, region: 'Oeste',             alq_ratio: 0.0046 },
  villa_luro:       { nombre: 'Villa Luro',       m2_mediana: 1780, m2_min: 1390, m2_max: 2250, region: 'Oeste',             alq_ratio: 0.0047 },
  villa_general_mitre: { nombre: 'Villa Gral. Mitre', m2_mediana: 2050, m2_min: 1600, m2_max: 2580, region: 'Oeste',        alq_ratio: 0.0046 },
  // ── SUR ──
  barracas:         { nombre: 'Barracas',         m2_mediana: 1920, m2_min: 1480, m2_max: 2430, region: 'Sur',               alq_ratio: 0.0046 },
  la_boca:          { nombre: 'La Boca',          m2_mediana: 1560, m2_min: 1150, m2_max: 2000, region: 'Sur',               alq_ratio: 0.0046 },
  nueva_pompeya:    { nombre: 'Nueva Pompeya',    m2_mediana: 1478, m2_min: 1100, m2_max: 1900, region: 'Sur',               alq_ratio: 0.0048 },
  villa_soldati:    { nombre: 'Villa Soldati',    m2_mediana: 1180, m2_min:  880, m2_max: 1520, region: 'Sur',               alq_ratio: 0.0048 },
  villa_riachuelo:  { nombre: 'Villa Riachuelo',  m2_mediana: 1150, m2_min:  860, m2_max: 1480, region: 'Sur',               alq_ratio: 0.0049 },
  villa_lugano:     { nombre: 'Villa Lugano',     m2_mediana: 1098, m2_min:  830, m2_max: 1420, region: 'Sur',               alq_ratio: 0.0048 },
  // ── COMUNAS MIXTAS (barrios con nombre propio diferenciado) ──
  palermo_soho:     { nombre: 'Palermo Soho',     m2_mediana: 3550, m2_min: 2900, m2_max: 4400, region: 'Corredor Norte',    alq_ratio: 0.0046 },
  palermo_hollywood:{ nombre: 'Palermo Hollywood',m2_mediana: 3480, m2_min: 2850, m2_max: 4300, region: 'Corredor Norte',    alq_ratio: 0.0045 },
  las_canitas:      { nombre: 'Las Cañitas',      m2_mediana: 3200, m2_min: 2600, m2_max: 4000, region: 'Corredor Norte',    alq_ratio: 0.0045 },
};

// ─────────────────────────────────────────────
// DÓLAR MEP EN TIEMPO REAL
// ─────────────────────────────────────────────
let dolarCache    = null;
let dolarCacheTs  = null;
const DOLAR_TTL   = 30 * 60 * 1000; // 30 minutos

async function fetchDolarMep() {
  // Intenta ArgentinaDatos primero, luego dolarapi.com como fallback
  const fuentes = [
    async () => {
      const { data } = await axios.get('https://api.argentinadatos.com/v1/cotizaciones/dolares/mep', {
        timeout: 8000, headers: { 'Accept': 'application/json' }
      });
      if (Array.isArray(data) && data.length > 0) {
        const ultimo = data[data.length - 1];
        return { valor: parseFloat(ultimo.venta || ultimo.compra || ultimo.promedio), fuente: 'ArgentinaDatos' };
      }
      throw new Error('Sin datos');
    },
    async () => {
      const { data } = await axios.get('https://dolarapi.com/v1/dolares/bolsa', {
        timeout: 8000, headers: { 'Accept': 'application/json' }
      });
      if (data?.venta) return { valor: parseFloat(data.venta), fuente: 'DolarAPI' };
      throw new Error('Sin datos');
    },
  ];

  for (const fn of fuentes) {
    try {
      const result = await fn();
      if (result.valor && result.valor > 100) {
        console.log(`[DOLAR MEP] ${result.valor} (${result.fuente})`);
        return result;
      }
    } catch(e) {
      console.warn('[DOLAR MEP] Fuente falló:', e.message);
    }
  }

  // Fallback al .env o 1400
  const manual = parseFloat(process.env.DOLAR_MEP) || 1400;
  console.warn('[DOLAR MEP] Usando fallback manual:', manual);
  return { valor: manual, fuente: 'manual' };
}

async function getDolarMepActualizado() {
  const ahora = Date.now();
  if (dolarCache && dolarCacheTs && (ahora - dolarCacheTs < DOLAR_TTL)) {
    return dolarCache.valor;
  }
  const result = await fetchDolarMep();
  dolarCache = result;
  dolarCacheTs = ahora;
  return result.valor;
}

// Compatibilidad con código existente
function getDolarMep() {
  return dolarCache?.valor || parseFloat(process.env.DOLAR_MEP) || 1400;
}

// Actualizar dólar cada 30 minutos
cron.schedule('*/30 * * * *', async () => {
  const result = await fetchDolarMep();
  dolarCache = result;
  dolarCacheTs = Date.now();
  console.log('[DOLAR MEP] Cache actualizado:', result.valor);
});

// ─────────────────────────────────────────────
// FACTOR AMBIENTES
// ─────────────────────────────────────────────
function obtenerFactorAmbientes(ambientes, metros = 0) {
  if (ambientes === null || ambientes === undefined || ambientes <= 0 || isNaN(ambientes)) {
    return { factor: 1.00, label: 'No especificado', ajuste_superficie: false, impacto_pct: 0 };
  }

  const ESCALA = {
    1: { factor: 1.12, label: 'Monoambiente' },
    2: { factor: 1.00, label: '2 ambientes'  },
    3: { factor: 0.94, label: '3 ambientes'  },
    4: { factor: 0.89, label: '4 ambientes'  },
  };

  const amb = Math.min(Math.max(Math.round(ambientes), 1), 5);
  const base = amb >= 5
    ? { factor: 0.85, label: '5 o más ambientes' }
    : ESCALA[amb];

  let factorFinal = base.factor;
  let ajusteSuperficie = false;

  if (amb === 3 && metros > 0 && metros < 55) {
    factorFinal = parseFloat((factorFinal * 0.98).toFixed(4));
    ajusteSuperficie = true;
  }
  if (amb === 2 && metros > 55) {
    factorFinal = parseFloat((factorFinal * 0.98).toFixed(4));
    ajusteSuperficie = true;
  }

  return {
    factor:            parseFloat(factorFinal.toFixed(4)),
    label:             base.label,
    ajuste_superficie: ajusteSuperficie,
    impacto_pct:       parseFloat(((factorFinal - 1) * 100).toFixed(1)),
  };
}

// ─────────────────────────────────────────────
// FUENTES RSS DE NOTICIAS
// ─────────────────────────────────────────────
const RSS_SOURCES = [
  { id: 'reporte',      nombre: 'Reporte Inmobiliario', url: 'https://www.reporteinmobiliario.com/feed',                                    max: 6 },
  { id: 'ambito',       nombre: 'Ámbito',               url: 'https://www.ambito.com/rss/pages/economia.xml',                              max: 5 },
  { id: 'infobae',      nombre: 'Infobae',              url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/economia/',            max: 5 },
  { id: 'cronista',     nombre: 'El Cronista',          url: 'https://www.cronista.com/arc/outboundfeeds/rss/',                            max: 4 },
  { id: 'lanacion',     nombre: 'La Nación',            url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/economia/',       max: 4 },
  { id: 'iprofesional', nombre: 'iProfesional',         url: 'https://www.iprofesional.com/rss/home.xml',                                  max: 4 },
];

const KEYWORDS_INMOBILIARIO = [
  'inmobili', 'departamento', 'depto', 'alquiler', 'alquileres', 'vivienda', 'propied',
  'hipoteca', 'crédito hipotecario', 'credito hipotecario', 'uva', 'escritura', 'compraventa',
  'real estate', 'm²', 'metro cuadrado', 'construcción', 'construcci', 'desarrolladora',
  'desarrollos', 'fideicomiso', 'inquilino', 'locatario', 'locador', 'propiedad horizontal',
  'barrio cerrado', 'country', 'procrear', 'acceso a la vivienda', 'mercado inmobiliario',
  'oferta inmobiliaria', 'renta inmobiliaria', 'inversión inmobiliaria', 'inversion inmobiliaria',
  'terreno', 'lote ', 'loteo', 'parcela', 'suelo urbano',
  'dólar', 'dolar', 'tipo de cambio', 'cepo', 'blanqueo', 'brecha cambiaria',
  'reservas del bcra', 'devaluaci', 'ley de alquileres', 'dnu', 'decreto',
  'proyecto de ley', 'regulaci', 'código urbanístico', 'codigo urbanistico',
  'plusvalía', 'plusvalia', 'impuesto inmobiliario', 'bienes raíces', 'bienes raices',
  'registro de la propiedad', 'reforma tributaria', 'banco hipotecario', 'tasa hipotecaria',
  'préstamo uva', 'prestamo uva', 'financiamiento',
  'inflaci', 'tasas de interés', 'tasas de interes', 'riesgo país', 'riesgo pais', 'bcra',
];

function esRelevante(titulo, descripcion) {
  const texto = (titulo + ' ' + (descripcion || '')).toLowerCase();
  return KEYWORDS_INMOBILIARIO.some(kw => texto.includes(kw.toLowerCase()));
}

function parsearRSS(xmlStr, source) {
  const items = [];
  const bloques = xmlStr.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  bloques.slice(0, source.max * 3).forEach(bloque => {
    try {
      const getText = (tag) => {
        const cdataMatch = bloque.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
        if (cdataMatch) return cdataMatch[1].trim();
        const plainMatch = bloque.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
        if (plainMatch) return plainMatch[1].trim();
        return '';
      };
      const getLink = () => {
        const hrefMatch = bloque.match(/<link[^>]+href=["']([^"']+)["']/i);
        if (hrefMatch) return hrefMatch[1];
        const textMatch = bloque.match(/<link[^>]*>([^<]+)<\/link>/i);
        if (textMatch) return textMatch[1].trim();
        return '';
      };
      const titulo      = getText('title');
      const link        = getLink();
      const descripcion = getText('description') || getText('summary') || '';
      const pubDate     = getText('pubDate') || getText('published') || getText('updated') || '';
      if (!titulo || !link) return;
      if (!esRelevante(titulo, descripcion)) return;
      const descLimpia = descripcion
        .replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
        .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
        .replace(/\s+/g,' ').trim().slice(0, 220);
      items.push({
        titulo:      titulo.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim().slice(0, 120),
        link, descripcion: descLimpia, pubDate,
        fuente: source.nombre, sourceId: source.id,
      });
    } catch(e) {}
  });
  return items.slice(0, source.max);
}

async function fetchRSS(source) {
  try {
    const { data } = await axios.get(source.url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CotizarCABA/1.0; RSS Reader)', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      responseType: 'text',
    });
    const items = parsearRSS(data, source);
    console.log(`[RSS] ${source.nombre}: ${items.length} noticias relevantes`);
    return items;
  } catch (err) {
    console.warn(`[RSS] ${source.nombre}: error — ${err.message}`);
    return [];
  }
}

let noticiasCache    = null;
let noticiasCacheTs  = null;
const CACHE_TTL_MS   = 2 * 60 * 60 * 1000;

async function fetchTodasNoticias() {
  console.log('[RSS] Actualizando noticias desde RSS...');
  const resultados = await Promise.allSettled(RSS_SOURCES.map(fetchRSS));
  const todas = [];
  resultados.forEach(r => { if (r.status === 'fulfilled') todas.push(...r.value); });
  todas.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate) : 0;
    const db = b.pubDate ? new Date(b.pubDate) : 0;
    return db - da;
  });
  console.log(`[RSS] Total: ${todas.length} noticias cargadas`);
  return todas;
}

cron.schedule('0 */2 * * *', async () => {
  const noticias = await fetchTodasNoticias();
  if (noticias.length > 0) { noticiasCache = noticias; noticiasCacheTs = Date.now(); }
});

app.get('/api/noticias', async (req, res) => {
  const cacheValido = noticiasCache && noticiasCacheTs && (Date.now() - noticiasCacheTs < CACHE_TTL_MS);
  if (cacheValido) return res.json({ ok: true, noticias: noticiasCache, desde_cache: true, total: noticiasCache.length });
  try {
    const noticias = await fetchTodasNoticias();
    if (noticias.length > 0) { noticiasCache = noticias; noticiasCacheTs = Date.now(); }
    if (!noticias.length && noticiasCache) return res.json({ ok: true, noticias: noticiasCache, desde_cache: true, aviso: 'Cache anterior' });
    if (!noticias.length) return res.status(503).json({ ok: false, error: 'No se pudieron cargar noticias de ninguna fuente. Reintentá en unos minutos.' });
    res.json({ ok: true, noticias, desde_cache: false, total: noticias.length });
  } catch (err) {
    console.error('[RSS] Error general:', err.message);
    if (noticiasCache) return res.json({ ok: true, noticias: noticiasCache, desde_cache: true });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
async function getMergedData() {
  const cache = await cargarDatos();
  const merged = { ...FALLBACK };
  if (cache?.barrios) {
    for (const [key, data] of Object.entries(cache.barrios)) {
      if (merged[key]) merged[key] = { ...merged[key], ...data, alq_ratio: merged[key].alq_ratio };
    }
  }
  const dolarMep = await getDolarMepActualizado();
  return { data: merged, cache, dolarMep };
}

// ─────────────────────────────────────────────
// ENDPOINT: DÓLAR MEP
// ─────────────────────────────────────────────
app.get('/api/dolar', async (req, res) => {
  try {
    const valor = await getDolarMepActualizado();
    res.json({
      ok: true,
      mep: valor,
      fuente: dolarCache?.fuente || 'manual',
      ultima_actualizacion: dolarCacheTs ? new Date(dolarCacheTs).toISOString() : null,
    });
  } catch(err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// ESCRITURAS CABA
// ─────────────────────────────────────────────
let escriturasCache   = null;
let escriturasCacheTs = null;
const ESCRITURAS_TTL  = 24 * 60 * 60 * 1000;

async function fetchEscrituras() {
  try {
    const { data } = await axios.get('https://api.argentinadatos.com/v1/finanzas/escrituras', {
      timeout: 10000,
      headers: { 'Accept': 'application/json' },
    });
    if (Array.isArray(data) && data.length > 0) {
      const ultimos = data.slice(-12).map(d => ({
        periodo: d.periodo || d.fecha || d.mes,
        cantidad: d.cantidad || d.escrituras || d.total,
        variacion_anual: d.variacion_anual || d.var_anual || null,
      }));
      console.log(`[ESCRITURAS] ${ultimos.length} períodos cargados`);
      return { ok: true, datos: ultimos, fuente: 'ArgentinaDatos / Escribanos CABA' };
    }
    throw new Error('Respuesta vacía');
  } catch (err) {
    console.warn(`[ESCRITURAS] Error con ArgentinaDatos: ${err.message}`);
    return {
      ok: true,
      datos: [
        { periodo: '2024-03', cantidad: 4821, variacion_anual: +12.3 },
        { periodo: '2024-04', cantidad: 5102, variacion_anual: +18.1 },
        { periodo: '2024-05', cantidad: 5340, variacion_anual: +22.4 },
        { periodo: '2024-06', cantidad: 4980, variacion_anual: +15.7 },
        { periodo: '2024-07', cantidad: 4755, variacion_anual: +9.8  },
        { periodo: '2024-08', cantidad: 5218, variacion_anual: +21.2 },
        { periodo: '2024-09', cantidad: 5490, variacion_anual: +24.6 },
        { periodo: '2024-10', cantidad: 5870, variacion_anual: +28.3 },
        { periodo: '2024-11', cantidad: 6102, variacion_anual: +31.5 },
        { periodo: '2024-12', cantidad: 6540, variacion_anual: +35.2 },
        { periodo: '2025-01', cantidad: 4230, variacion_anual: +8.4  },
        { periodo: '2025-02', cantidad: 4680, variacion_anual: +14.7 },
      ],
      fuente: 'Datos históricos · Colegio de Escribanos CABA',
      es_fallback: true,
    };
  }
}

app.get('/api/escrituras', async (req, res) => {
  const cacheValido = escriturasCache && escriturasCacheTs && (Date.now() - escriturasCacheTs < ESCRITURAS_TTL);
  if (cacheValido) return res.json({ ...escriturasCache, desde_cache: true });
  const result = await fetchEscrituras();
  if (result.ok) { escriturasCache = result; escriturasCacheTs = Date.now(); }
  res.json({ ...result, desde_cache: false });
});

cron.schedule('0 9 * * *', async () => {
  const result = await fetchEscrituras();
  if (result.ok) { escriturasCache = result; escriturasCacheTs = Date.now(); console.log('[ESCRITURAS] Cache actualizado'); }
});

// ─────────────────────────────────────────────
// ALERTAS DE PRECIO — con nodemailer
//
// Variables de entorno necesarias (.env):
//   ALERT_EMAIL_FROM=tu@gmail.com
//   ALERT_EMAIL_PASS=tu_app_password_gmail
//   ALERT_EMAIL_TO=  (opcional, para notificarte a vos también)
//
// Para Gmail: activar "Contraseñas de aplicación" en
// myaccount.google.com/security → Verificación en 2 pasos → Contraseñas de app
// ─────────────────────────────────────────────
let nodemailer;
try { nodemailer = require('nodemailer'); } catch(e) { console.warn('[ALERTAS] nodemailer no instalado. Corré: npm install nodemailer'); }

const alertasDB = []; // en producción reemplazar con persistencia a archivo/DB

function crearTransporter() {
  if (!nodemailer) return null;
  if (!process.env.ALERT_EMAIL_FROM || !process.env.ALERT_EMAIL_PASS) {
    console.warn('[ALERTAS] Faltan ALERT_EMAIL_FROM y ALERT_EMAIL_PASS en .env');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.ALERT_EMAIL_FROM, pass: process.env.ALERT_EMAIL_PASS },
  });
}

async function enviarEmailAlerta(alerta, precioActual) {
  const transporter = crearTransporter();
  if (!transporter) {
    console.log(`[ALERTAS] (simulado) Email a ${alerta.email}: ${alerta.barrioNombre} bajó a USD ${precioActual}/m²`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"CotizAR" <${process.env.ALERT_EMAIL_FROM}>`,
      to: alerta.email,
      subject: `📉 Alerta: ${alerta.barrioNombre} bajó de tu objetivo`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#faf8f4">
          <h2 style="font-size:24px;margin-bottom:8px;color:#0f0e0c">Bajó el precio en ${alerta.barrioNombre}</h2>
          <p style="color:#4a4840;margin-bottom:24px">El precio/m² actual está por debajo de tu objetivo.</p>
          <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e1d8;margin-bottom:24px">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px">
              <span style="color:#9a9790;font-size:13px">Tu objetivo</span>
              <span style="font-weight:500">USD ${alerta.precio_objetivo.toLocaleString('es-AR')}/m²</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:#9a9790;font-size:13px">Precio actual</span>
              <span style="font-weight:600;color:#1a6640">USD ${precioActual.toLocaleString('es-AR')}/m²</span>
            </div>
          </div>
          <a href="https://cotizar-production.up.railway.app?barrio=${alerta.barrio}" 
             style="display:block;background:#c8521a;color:white;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:500">
            Ver cotización →
          </a>
          <p style="font-size:11px;color:#9a9790;margin-top:20px;text-align:center">
            CotizAR · Para cancelar esta alerta respondé este email con "cancelar"
          </p>
        </div>
      `,
    });
    console.log(`[ALERTAS] Email enviado a ${alerta.email} — ${alerta.barrioNombre}`);
    return true;
  } catch(err) {
    console.error('[ALERTAS] Error enviando email:', err.message);
    return false;
  }
}

async function enviarEmailConfirmacion(email, barrioNombre, precioObjetivo) {
  const transporter = crearTransporter();
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: `"CotizAR" <${process.env.ALERT_EMAIL_FROM}>`,
      to: email,
      subject: `✅ Alerta creada — ${barrioNombre}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#faf8f4">
          <h2 style="font-size:24px;margin-bottom:8px;color:#0f0e0c">Alerta creada 🎯</h2>
          <p style="color:#4a4840;margin-bottom:24px">
            Te vamos a avisar cuando el precio en <strong>${barrioNombre}</strong> 
            baje de <strong>USD ${precioObjetivo.toLocaleString('es-AR')}/m²</strong>.
          </p>
          <p style="font-size:11px;color:#9a9790;text-align:center">
            CotizAR · cotizar-production.up.railway.app
          </p>
        </div>
      `,
    });
  } catch(err) {
    console.error('[ALERTAS] Error en email de confirmación:', err.message);
  }
}

// Cron: revisar alertas cada 6 horas
cron.schedule('0 */6 * * *', async () => {
  if (!alertasDB.length) return;
  console.log(`[ALERTAS] Revisando ${alertasDB.length} alertas activas...`);
  const { data } = await getMergedData();
  for (const alerta of alertasDB.filter(a => a.activa)) {
    const barrio = data[alerta.barrio];
    if (!barrio) continue;
    if (barrio.m2_mediana < alerta.precio_objetivo) {
      await enviarEmailAlerta(alerta, barrio.m2_mediana);
      alerta.ultima_notificacion = Date.now();
    }
  }
});

app.post('/api/alerta', async (req, res) => {
  const { email, barrio, precio_objetivo } = req.body;

  if (!email || !email.includes('@'))
    return res.status(400).json({ ok: false, error: 'Email inválido' });
  if (!barrio)
    return res.status(400).json({ ok: false, error: 'Barrio requerido' });
  if (!precio_objetivo || precio_objetivo < 500)
    return res.status(400).json({ ok: false, error: 'Precio objetivo inválido' });

  // Verificar que el barrio existe
  const { data } = await getMergedData();
  const barrioData = data[barrio];
  if (!barrioData)
    return res.status(404).json({ ok: false, error: 'Barrio no encontrado' });

  // Evitar alertas duplicadas
  const existe = alertasDB.find(a => a.email === email && a.barrio === barrio && a.activa);
  if (existe) {
    existe.precio_objetivo = parseInt(precio_objetivo);
    return res.json({ ok: true, mensaje: 'Alerta actualizada', email_configurado: !!process.env.ALERT_EMAIL_FROM });
  }

  const alerta = {
    email,
    barrio,
    barrioNombre: barrioData.nombre,
    precio_objetivo: parseInt(precio_objetivo),
    activa: true,
    creada: new Date().toISOString(),
    ultima_notificacion: null,
  };
  alertasDB.push(alerta);
  console.log(`[ALERTAS] Nueva alerta: ${email} → ${barrioData.nombre} < USD ${precio_objetivo}/m²`);

  // Enviar confirmación por email
  await enviarEmailConfirmacion(email, barrioData.nombre, parseInt(precio_objetivo));

  // Verificar si ya cumple la condición ahora mismo
  const precioActual = barrioData.m2_mediana;
  const yaActiva = precioActual < parseInt(precio_objetivo);

  res.json({
    ok: true,
    mensaje: 'Alerta creada. Te llegará un email de confirmación.',
    email_configurado: !!process.env.ALERT_EMAIL_FROM,
    precio_actual: precioActual,
    ya_cumple: yaActiva,
    aviso: yaActiva ? `El precio actual (USD ${precioActual}/m²) ya está por debajo de tu objetivo.` : null,
  });
});

// ─────────────────────────────────────────────
// ENDPOINT: EXPORTAR COTIZACIÓN EN PDF
// ─────────────────────────────────────────────
const { execFile } = require('child_process');
const os   = require('os');
const fs   = require('fs');

app.post('/api/cotizacion-pdf', async (req, res) => {
  const { cotizacion } = req.body;
  if (!cotizacion) return res.status(400).json({ ok: false, error: 'Falta cotizacion en el body' });

  const tmpOut = path.join(os.tmpdir(), `cotizar_${Date.now()}.pdf`);
  const jsonStr = JSON.stringify(cotizacion);
  const scriptPath = path.join(__dirname, 'generar_pdf.py');

  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ ok: false, error: 'generar_pdf.py no encontrado en el directorio raíz' });
  }

  execFile('python3', [scriptPath, jsonStr, tmpOut], { timeout: 15000 }, (err) => {
    if (err) {
      console.error('[PDF]', err.message);
      return res.status(500).json({ ok: false, error: 'Error generando PDF: ' + err.message });
    }
    if (!fs.existsSync(tmpOut)) {
      return res.status(500).json({ ok: false, error: 'El PDF no fue creado' });
    }
    const barrio  = cotizacion?.barrio?.nombre?.replace(/\s+/g,'-') || 'cotizacion';
    const fecha   = new Date().toISOString().slice(0, 10);
    const nombre  = `CotizAR_${barrio}_${fecha}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    const stream = fs.createReadStream(tmpOut);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(tmpOut, () => {}));
    stream.on('error', () => res.status(500).end());
  });
});


app.get('/api/barrios', async (req, res) => {
  const { data } = await getMergedData();
  const barrios = Object.entries(data).map(([key, b]) => ({
    key, nombre: b.nombre, region: b.region, m2_mediana: b.m2_mediana,
  }));
  res.json({ ok: true, barrios });
});

const FACTORES_ANTIGUEDAD = {
  '0-5':          { label: 'Nuevo (0-5 años)',          factor: 1.25 },
  '6-15':         { label: 'Moderno (6-15 años)',        factor: 1.12 },
  '16-30':        { label: 'Intermedio (16-30 años)',    factor: 1.00 },
  '31-50':        { label: 'Antiguo (31-50 años)',       factor: 0.88 },
  '50+':          { label: 'Muy antiguo (+50 años)',     factor: 0.78 },
  'refaccionado': { label: 'Refaccionado/reciclado',     factor: 1.08 },
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

app.get('/api/amenities', (req, res) => {
  res.json({
    ok: true,
    amenities:  Object.entries(AMENITIES_CONFIG).map(([key, v]) => ({ key, ...v })),
    antiguedad: Object.entries(FACTORES_ANTIGUEDAD).map(([key, v]) => ({ key, ...v })),
  });
});

// GET /api/cotizar
app.get('/api/cotizar', async (req, res) => {
  const {
    barrio: barrioKey,
    metros: metrosStr,
    tipo       = 'depto',
    op         = 'venta',
    antiguedad = '16-30',
    amenities: amenitiesStr = '',
    ambientes: ambientesStr = '',
  } = req.query;

  if (!barrioKey) return res.status(400).json({ ok: false, error: 'Parámetro barrio requerido' });

  const metros = parseFloat(metrosStr);
  if (!metros || metros < 10 || metros > 2000)
    return res.status(400).json({ ok: false, error: 'Metros debe ser entre 10 y 2000' });

  const ambientesNum = ambientesStr ? parseInt(ambientesStr, 10) : null;

  const { data, dolarMep } = await getMergedData();
  const b = data[barrioKey];
  if (!b) return res.status(404).json({ ok: false, error: `Barrio '${barrioKey}' no encontrado` });

  const ajustesTipo      = { depto: 1.0, ph: 0.90, estrenar: 1.12, pozo: 0.88 };
  const factorTipo       = ajustesTipo[tipo] ?? 1.0;
  const cfgAntiguedad    = FACTORES_ANTIGUEDAD[antiguedad] || FACTORES_ANTIGUEDAD['16-30'];
  const factorAntiguedad = cfgAntiguedad.factor;

  const amenitiesKeys   = amenitiesStr ? amenitiesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const amenitiesResult = calcularFactorAmenities(amenitiesKeys);
  const factorAmenities = amenitiesResult.factor;

  const ambientesResult = obtenerFactorAmbientes(ambientesNum, metros);
  const factorAmbientes = ambientesResult.factor;

  const factorTotal = factorTipo * factorAntiguedad * factorAmenities * factorAmbientes;
  const factorBase  = factorTipo;

  const m2      = Math.round(b.m2_mediana * factorTotal);
  const m2_min  = Math.round(b.m2_min    * factorTotal);
  const m2_max  = Math.round(b.m2_max    * factorTotal);
  const m2_base = Math.round(b.m2_mediana * factorBase);

  const precioUSD     = Math.round(m2 * metros);
  const precioMinUSD  = Math.round(m2_min * metros);
  const precioMaxUSD  = Math.round(m2_max * metros);
  const precioPesos   = precioUSD * dolarMep;
  const precioBaseUSD = Math.round(m2_base * metros);
  const diferenciaPct = parseFloat(((precioUSD - precioBaseUSD) / precioBaseUSD * 100).toFixed(1));

  const ALQ_BASE_CABA_M2_MES = global.ALQ_BASE_CABA_M2_MES_ACTUALIZADO || 16200;
  const PROMEDIO_VENTA_CABA  = 2455;
  const factorZonal   = b.m2_mediana / PROMEDIO_VENTA_CABA;
  const alqBaseM2Mes  = Math.round(ALQ_BASE_CABA_M2_MES * factorZonal);
  const alqM2Mes      = b.alq_m2_mes      || alqBaseM2Mes;
  const alqM2MesMin   = b.alq_m2_mes_min  || Math.round(alqM2Mes * 0.88);
  const alqM2MesMax   = b.alq_m2_mes_max  || Math.round(alqM2Mes * 1.12);
  const alqMesPesos   = Math.round(alqM2Mes    * metros * factorTotal);
  const alqMinPesos   = Math.round(alqM2MesMin * metros * factorTotal);
  const alqMaxPesos   = Math.round(alqM2MesMax * metros * factorTotal);
  const alqRentabilidad = ((alqMesPesos * 12) / precioPesos * 100).toFixed(1);
  const añosRecupero    = (100 / parseFloat(alqRentabilidad)).toFixed(1);
  const promedioCABA    = 2452;

  const cotizacion = {
    barrio:  { key: barrioKey, nombre: b.nombre, region: b.region },
    inputs:  { metros, tipo, op, antiguedad, amenities: amenitiesKeys, ambientes: ambientesNum },
    ajustes: {
      factor_tipo:       { valor: factorTipo,       label: tipo,                impacto_pct: parseFloat(((factorTipo - 1) * 100).toFixed(1)) },
      factor_antiguedad: { valor: factorAntiguedad, label: cfgAntiguedad.label, impacto_pct: parseFloat(((factorAntiguedad - 1) * 100).toFixed(1)) },
      factor_amenities:  { valor: factorAmenities,  impacto_pct: amenitiesResult.impacto_total, detalle: amenitiesResult.detalle, cap_aplicado: amenitiesResult.cap_aplicado },
      factor_ambientes:  {
        valor:             ambientesResult.factor,
        label:             ambientesResult.label,
        impacto_pct:       ambientesResult.impacto_pct,
        ajuste_superficie: ambientesResult.ajuste_superficie,
        ambientes_num:     ambientesNum,
      },
      factor_total:               parseFloat(factorTotal.toFixed(4)),
      precio_sin_ajustes_usd:     precioBaseUSD,
      diferencia_vs_base_pct:     diferenciaPct,
    },
    venta: {
      precio_usd: precioUSD, precio_usd_min: precioMinUSD, precio_usd_max: precioMaxUSD,
      precio_pesos: precioPesos, m2_usd: m2, dolar_mep: dolarMep,
    },
    alquiler: op === 'alquiler' || op === 'ambos' ? {
      estimado_mes_pesos: alqMesPesos, min_pesos: alqMinPesos, max_pesos: alqMaxPesos,
      rentabilidad_bruta_anual: parseFloat(alqRentabilidad),
      años_recupero: parseFloat(añosRecupero),
      fuente:   b.alq_m2_mes ? 'scraping_tiempo_real' : 'estimacion_fallback',
      muestras: b.muestras_alquiler || 0,
    } : null,
    mercado: {
      promedio_caba_m2:           promedioCABA,
      diferencia_vs_promedio_pct: parseFloat(((m2 - promedioCABA) / promedioCABA * 100).toFixed(1)),
      muestras_scraping:          b.muestras || null,
      datos_desde:                b.timestamp || 'ZonaProp-Index-Feb-2026',
    },
  };

  res.json({ ok: true, cotizacion });
});

// GET /api/precios
app.get('/api/precios', async (req, res) => {
  const { data, cache } = await getMergedData();
  res.json({
    ok: true,
    ultima_actualizacion: cache?.ultima_actualizacion || 'ZonaProp-Index-Feb-2026',
    total_barrios: Object.keys(data).length,
    barrios: data,
  });
});

// GET /api/status
app.get('/api/status', async (req, res) => {
  const status = await getStatus();
  const dolarMep = getDolarMep();
  res.json({
    ok: true,
    servidor: 'online',
    cache: status.existe ? {
      existe: true, ultima_actualizacion: status.ultima_actualizacion,
      barrios_cacheados: status.total_barrios, storage: status.storage,
    } : { existe: false, mensaje: 'Usando datos ZonaProp Index Feb 2026', storage: status.storage },
    dolar_mep: dolarMep,
    dolar_info: {
      valor: dolarMep,
      fuente: dolarCache?.fuente || 'manual',
      ultima_actualizacion: dolarCacheTs ? new Date(dolarCacheTs).toISOString() : null,
    },
    email_configurado: !!(process.env.ALERT_EMAIL_FROM && process.env.ALERT_EMAIL_PASS),
    alertas_activas: alertasDB.filter(a => a.activa).length,
    noticias: {
      fuentes: RSS_SOURCES.length,
      cache_activo: !!noticiasCache,
      ultima_actualizacion: noticiasCacheTs ? new Date(noticiasCacheTs).toISOString() : null,
      total_noticias: noticiasCache?.length || 0,
    },
  });
});

// POST /api/scrape
let ultimoScrapeManual      = null;
const MINUTOS_ENTRE_SCRAPES = 120;

app.post('/api/scrape', async (req, res) => {
  const key = req.headers['x-api-key'] || req.body?.api_key;
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
  if (ultimoScrapeManual) {
    const minutosPasados = (Date.now() - ultimoScrapeManual) / 1000 / 60;
    if (minutosPasados < MINUTOS_ENTRE_SCRAPES)
      return res.status(429).json({ ok: false, error: `Esperá ${Math.ceil(MINUTOS_ENTRE_SCRAPES - minutosPasados)} minutos más` });
  }
  ultimoScrapeManual = Date.now();
  res.json({ ok: true, mensaje: 'Scraping iniciado. Los datos se actualizarán en 5-10 minutos.' });
  scrapeAll().catch(err => console.error('[Manual scrape]', err.message));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
initDB().then(async () => {
  app.listen(PORT, () => {
    console.log(`\n🏠 Cotizador CABA corriendo en http://localhost:${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api/status\n`);
  });

  // Cargar dólar MEP al inicio
  fetchDolarMep().then(result => {
    dolarCache = result; dolarCacheTs = Date.now();
    console.log('[INICIO] Dólar MEP:', result.valor, '('+result.fuente+')');
  }).catch(err => console.warn('[INICIO] Dólar MEP:', err.message));

  fetchTodasNoticias().then(noticias => {
    if (noticias.length) { noticiasCache = noticias; noticiasCacheTs = Date.now(); }
  }).catch(err => console.warn('[INICIO] Noticias RSS:', err.message));

  fetchEscrituras().then(result => {
    if (result.ok) { escriturasCache = result; escriturasCacheTs = Date.now(); }
  }).catch(err => console.warn('[INICIO] Escrituras:', err.message));
});
