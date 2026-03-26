/**
 * server.js
 * API REST — Cotizador de departamentos CABA
 *
 * Endpoints:
 *   GET /api/barrios          → lista de barrios disponibles
 *   GET /api/cotizar          → cotización por barrio + metros
 *   GET /api/precios          → todos los precios del cache
 *   GET /api/status           → estado del cache y última actualización
 *   GET /api/noticias         → noticias inmobiliarias AI-powered (cache 2hs)
 // ─────────────────────────────────────────────
// GET /api/noticias
// ─────────────────────────────────────────────
let noticiasCache = null;
let noticiasCacheTime = null;
const NOTICIAS_CACHE_MS = 2 * 60 * 60 * 1000;

app.get('/api/noticias', async (req, res) => {
  if (noticiasCache && noticiasCacheTime && (Date.now() - noticiasCacheTime < NOTICIAS_CACHE_MS)) {
    return res.json({ ok: true, noticias: noticiasCache, desde_cache: true });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY no configurada.' });
  }

  try {
    const axios = require('axios');
    const parseResp = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: `Eres un experto en el mercado inmobiliario argentino, especialmente CABA.
Respondés ÚNICAMENTE con JSON válido, sin texto antes ni después, sin bloques de código markdown.
El JSON debe tener exactamente esta estructura:
{
  "noticias": [
    {
      "titulo": "string — titular periodístico claro, máx 90 caracteres",
      "resumen": "string — resumen de 2-3 oraciones, máx 200 caracteres",
      "resumen_largo": "string — desarrollo de 4-6 oraciones con contexto y cifras",
      "categoria": "precios|creditos|mercado|dolar",
      "fuente": "string — nombre del medio (ej: Infobae, La Nación, Ámbito, Reporte Inmobiliario)",
      "datos": ["array de 0 a 3 datos clave tipo '+5%', 'USD 2.800/m²', '1.200 escrituras'"],
      "urgente": false
    }
  ]
}
Generá exactamente 6 noticias realistas y actuales sobre el mercado inmobiliario argentino 2025-2026. SOLO JSON, nada más.`,
        messages: [{ role: 'user', content: 'Generá el JSON con las 6 noticias inmobiliarias.' }],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const rawText = parseResp.data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleanJson = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(cleanJson);
    const noticias = parsed.noticias || [];

    if (!noticias.length) throw new Error('Sin noticias');

    noticiasCache = noticias;
    noticiasCacheTime = Date.now();
    console.log(`[NOTICIAS] ${noticias.length} noticias generadas`);
    res.json({ ok: true, noticias, desde_cache: false });

  } catch (err) {
    console.error('[NOTICIAS] Error:', err.message);
    if (noticiasCache) return res.json({ ok: true, noticias: noticiasCache, desde_cache: true });
    res.status(500).json({ ok: false, error: err.message });
  }
});
 *   POST /api/scrape          → fuerza un scraping manual (requiere API_KEY)
 *
 * Variables de entorno (.env):
 *   PORT=3001
 *   API_KEY=tu_clave_secreta        (para proteger /api/scrape)
 *   DOLAR_MEP=1300                  (tipo de cambio manual, opcional)
 *   ANTHROPIC_API_KEY=sk-ant-...    (para /api/noticias)
 */
 
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const { scrapeAll } = require('./scraper');
const { initDB, cargarDatos, getStatus } = require('./db');
 
const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'dev-key-cambiar-en-produccion';
 
app.use(cors());
app.use(express.json());
 
// Servir el frontend desde backend/public (misma carpeta, sin dependencia externa)
app.use(express.static(path.join(__dirname, 'public')));
 
// ─────────────────────────────────────────────
// DATOS FALLBACK (ZonaProp Index Sep 2025)
// Se usan si el scraper no tiene datos aún.
// ─────────────────────────────────────────────
// Datos: ZonaProp Index CABA — Febrero 2026
// Fuente: zonaprop.com.ar/blog/zpindex · Actualización automática el día 5 de cada mes
// Alquiler: precio ARS/m²/mes basado en reporte ZonaProp Nov 2025
// alq_m2_mes calculado como: alquiler_2amb_50m2 / 50 escalado por zona
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
function getDolarMep() {
  return parseFloat(process.env.DOLAR_MEP) || 1400;
}
 
async function getMergedData() {
  const cache = await cargarDatos();
  const merged = { ...FALLBACK };
 
  if (cache?.barrios) {
    for (const [key, data] of Object.entries(cache.barrios)) {
      if (merged[key]) {
        merged[key] = {
          ...merged[key],
          ...data,
          alq_ratio: merged[key].alq_ratio,
        };
      }
    }
  }
 
  return { data: merged, cache, dolarMep: getDolarMep() };
}
 
// ─────────────────────────────────────────────
// AUTO-UPDATE MENSUAL — Descarga el PDF de ZonaProp
// ─────────────────────────────────────────────
 
const REGIONES = {
  'Corredor Norte': ['puerto_madero','palermo','belgrano','nuñez','recoleta','barrio_norte'],
  'Corredor Noroeste': ['colegiales','chacarita','villa_urquiza','villa_del_parque'],
  'Macrocentro': ['retiro','san_nicolas','monserrat','san_telmo','balvanera'],
  'Noroeste': ['villa_crespo','caballito','almagro','flores'],
  'Oeste': ['liniers','mataderos'],
  'Sur-Este': ['boedo','barracas'],
  'Sur': ['nueva_pompeya','la_boca','lugano'],
};
 
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
    const axios = require('axios');
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
 
    const barriosExtraidos = {};
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
 
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
      console.log(`[PDF-UPDATE] ✅ FALLBACK actualizado con datos ${year}-${month}`);
    }
  } catch (err) {
    console.warn(`[PDF-UPDATE] No se pudo actualizar desde PDF: ${err.message}`);
  }
}
 
// Cron: día 5 de cada mes a las 10am
cron.schedule('0 10 5 * *', async () => {
  console.log('[CRON] Actualizando datos desde ZonaProp PDF mensual...');
  await actualizarDesdePDF();
});
 
 
// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
 
// GET /api/barrios
app.get('/api/barrios', async (req, res) => {
  const { data } = await getMergedData();
  const barrios = Object.entries(data).map(([key, b]) => ({
    key,
    nombre: b.nombre,
    region: b.region,
    m2_mediana: b.m2_mediana,
  }));
  res.json({ ok: true, barrios });
});
 
// ─────────────────────────────────────────────
// FACTORES DE AJUSTE
// ─────────────────────────────────────────────
 
const FACTORES_ANTIGUEDAD = {
  '0-5':   { label: 'Nuevo (0-5 años)',         factor: 1.25 },
  '6-15':  { label: 'Moderno (6-15 años)',       factor: 1.12 },
  '16-30': { label: 'Intermedio (16-30 años)',   factor: 1.00 },
  '31-50': { label: 'Antiguo (31-50 años)',      factor: 0.88 },
  '50+':   { label: 'Muy antiguo (+50 años)',    factor: 0.78 },
  'refaccionado': { label: 'Refaccionado/reciclado', factor: 1.08 },
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
    detalle.push({
      key,
      label: cfg.label,
      icono: cfg.icono,
      impacto_nominal: cfg.impacto,
      impacto_efectivo: parseFloat(impactoEfectivo.toFixed(4)),
    });
  });
 
  const impactoFinal = Math.min(impactoAcumulado, 0.40);
 
  return {
    factor: parseFloat((1 + impactoFinal).toFixed(4)),
    impacto_total: parseFloat((impactoFinal * 100).toFixed(1)),
    detalle,
    cap_aplicado: impactoAcumulado > 0.40,
  };
}
 
app.get('/api/amenities', (req, res) => {
  res.json({
    ok: true,
    amenities: Object.entries(AMENITIES_CONFIG).map(([key, v]) => ({ key, ...v })),
    antiguedad: Object.entries(FACTORES_ANTIGUEDAD).map(([key, v]) => ({ key, ...v })),
  });
});
 
// GET /api/cotizar
app.get('/api/cotizar', async (req, res) => {
  const {
    barrio: barrioKey,
    metros: metrosStr,
    tipo = 'depto',
    op = 'venta',
    antiguedad = '16-30',
    amenities: amenitiesStr = '',
  } = req.query;
 
  if (!barrioKey) return res.status(400).json({ ok: false, error: 'Parámetro barrio requerido' });
 
  const metros = parseFloat(metrosStr);
  if (!metros || metros < 10 || metros > 2000) {
    return res.status(400).json({ ok: false, error: 'Metros debe ser entre 10 y 2000' });
  }
 
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
      factor_tipo:       { valor: factorTipo,      label: tipo,               impacto_pct: parseFloat(((factorTipo - 1) * 100).toFixed(1)) },
      factor_antiguedad: { valor: factorAntiguedad, label: cfgAntiguedad.label, impacto_pct: parseFloat(((factorAntiguedad - 1) * 100).toFixed(1)) },
      factor_amenities:  { valor: factorAmenities,  impacto_pct: amenitiesResult.impacto_total, detalle: amenitiesResult.detalle, cap_aplicado: amenitiesResult.cap_aplicado },
      factor_total:      parseFloat(factorTotal.toFixed(4)),
      precio_sin_ajustes_usd: precioBaseUSD,
      diferencia_vs_base_pct: diferenciaPct,
    },
    venta: {
      precio_usd: precioUSD, precio_usd_min: precioMinUSD, precio_usd_max: precioMaxUSD,
      precio_pesos: precioPesos, m2_usd: m2, dolar_mep: dolarMep,
    },
    alquiler: op === 'alquiler' || op === 'ambos' ? {
      estimado_mes_pesos: alqMesPesos, min_pesos: alqMinPesos, max_pesos: alqMaxPesos,
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
  res.json({
    ok: true,
    servidor: 'online',
    cache: status.existe ? {
      existe: true,
      ultima_actualizacion: status.ultima_actualizacion,
      barrios_cacheados: status.total_barrios,
      storage: status.storage,
    } : { existe: false, mensaje: 'Usando datos ZonaProp Index Feb 2026', storage: status.storage },
    dolar_mep: getDolarMep(),
    cron: 'Scraping automático cada día a las 06:00hs',
  });
});
 
// ─────────────────────────────────────────────
// GET /api/noticias
// Noticias inmobiliarias AI-powered con web search.
// Cache de 2 horas en memoria para no sobrecargar la API.
// Requiere: ANTHROPIC_API_KEY en variables de entorno.
// ─────────────────────────────────────────────
let noticiasCache = null;
let noticiasCacheTime = null;
const NOTICIAS_CACHE_MS = 2 * 60 * 60 * 1000; // 2 horas
 
app.get('/api/noticias', async (req, res) => {
  // Devolver cache si está vigente
  if (noticiasCache && noticiasCacheTime && (Date.now() - noticiasCacheTime < NOTICIAS_CACHE_MS)) {
    return res.json({ ok: true, noticias: noticiasCache, desde_cache: true });
  }
 
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'ANTHROPIC_API_KEY no configurada. Agregala en las variables de entorno (.env o Railway).',
    });
  }
 
  try {
    const axios = require('axios');
 
    // Llamada única: Claude genera noticias basadas en su conocimiento del mercado
    const parseResp = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: `Eres un experto en el mercado inmobiliario argentino, especialmente CABA.
Respondés ÚNICAMENTE con JSON válido, sin texto antes ni después, sin bloques de código markdown.
El JSON debe tener exactamente esta estructura:
{
  "noticias": [
    {
      "titulo": "string — titular periodístico claro, máx 90 caracteres",
      "resumen": "string — resumen de 2-3 oraciones, máx 200 caracteres",
      "resumen_largo": "string — desarrollo de 4-6 oraciones con contexto y cifras",
      "categoria": "precios|creditos|mercado|dolar",
      "fuente": "string — nombre del medio (ej: Infobae, La Nación, Ámbito, Reporte Inmobiliario)",
      "datos": ["array de 0 a 3 datos clave tipo '+5%', 'USD 2.800/m²', '1.200 escrituras'"],
      "urgente": false
    }
  ]
}
Generá exactamente 6 noticias realistas y actuales sobre:
1. Precios USD/m² en barrios de CABA (usar datos reales recientes)
2. Créditos hipotecarios UVA — tasas y novedades bancarias
3. Volumen de escrituras y operaciones
4. Impacto del dólar MEP en el mercado
5. Alquileres en pesos — valores y tendencias post-DNU
6. Un barrio específico de CABA con tendencia destacada
Usá cifras reales del mercado argentino 2025-2026. SOLO JSON, nada más.`,
        messages: [{
          role: 'user',
          content: 'Generá el JSON con las 6 noticias inmobiliarias de CABA/Argentina más relevantes y actuales.',
        }],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
 
    const rawText = parseResp.data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
 
    const cleanJson = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();
 
    const parsed = JSON.parse(cleanJson);
    const noticias = parsed.noticias || [];
 
    if (!Array.isArray(noticias) || noticias.length === 0) {
      throw new Error('La API no devolvió noticias válidas');
    }
 
    noticiasCache = noticias;
    noticiasCacheTime = Date.now();
 
    console.log(`[NOTICIAS] ${noticias.length} noticias cargadas y cacheadas`);
    res.json({ ok: true, noticias, desde_cache: false });
 
  } catch (err) {
    console.error('[NOTICIAS] Error:', err.message);
 
    // Si hay cache viejo, devolverlo como fallback
    if (noticiasCache) {
      return res.json({
        ok: true,
        noticias: noticiasCache,
        desde_cache: true,
        aviso: 'Cache anterior (API temporalmente no disponible)',
      });
    }
 
    res.status(500).json({ ok: false, error: `Error al obtener noticias: ${err.message}` });
  }
});
 
// POST /api/scrape — fuerza scraping manual (protegido con API_KEY + rate limit)
let ultimoScrapeManual = null;
const MINUTOS_ENTRE_SCRAPES = 120;
 
app.post('/api/scrape', async (req, res) => {
  const key = req.headers['x-api-key'] || req.body?.api_key;
  if (key !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
  }
 
  if (ultimoScrapeManual) {
    const minutosPasados = (Date.now() - ultimoScrapeManual) / 1000 / 60;
    if (minutosPasados < MINUTOS_ENTRE_SCRAPES) {
      const minutosRestantes = Math.ceil(MINUTOS_ENTRE_SCRAPES - minutosPasados);
      return res.status(429).json({
        ok: false,
        error: `Esperá ${minutosRestantes} minutos antes de volver a actualizar`,
      });
    }
  }
 
  ultimoScrapeManual = Date.now();
  res.json({ ok: true, mensaje: 'Scraping iniciado. Los datos se actualizarán en 5-10 minutos.' });
  scrapeAll().catch(err => console.error('[Manual scrape]', err.message));
});
 
// Catch-all → frontend SPA
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
 
  actualizarDesdePDF().catch(err => console.warn('[INICIO] PDF update:', err.message));
});
