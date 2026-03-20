/**
 * server.js
 * API REST — Cotizador de departamentos CABA
 */
 
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const axios = require('axios');
const { scrapeAll } = require('./scraper');
const { initDB, cargarDatos, getStatus, guardarCotizacion, obtenerCotizaciones } = require('./db');
 
const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'dev-key-cambiar-en-produccion';
 
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
 
let dolarCache = { mep: parseFloat(process.env.DOLAR_MEP) || 1400, oficial: null, blue: null, actualizadoAt: null };
 
async function actualizarDolar() {
  try {
    const { data } = await axios.get('https://api.bluelytics.com.ar/v2/latest', { timeout: 8000 });
    const blue = data?.blue?.value_sell ?? null;
    const oficial = data?.oficial?.value_sell ?? null;
    const mepCalc = blue && oficial ? Math.round((blue + oficial) / 2) : null;
    if (!process.env.DOLAR_MEP) dolarCache.mep = mepCalc || blue || oficial || dolarCache.mep;
    dolarCache.oficial = oficial; dolarCache.blue = blue; dolarCache.actualizadoAt = new Date().toISOString();
    console.log(`[DOLAR] Actualizado: oficial=$${oficial} blue=$${blue} usando $${dolarCache.mep}`);
  } catch (err) { console.warn(`[DOLAR] No se pudo actualizar: ${err.message}`); }
}
 
function getDolarMep() {
  if (process.env.DOLAR_MEP) return parseFloat(process.env.DOLAR_MEP);
  return dolarCache.mep;
}
 
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
 
async function getMergedData() {
  return { data: { ...FALLBACK }, cache: null, dolarMep: getDolarMep() };
}
 
const FACTORES_ANTIGUEDAD = {
  '0-5':          { label: 'Nuevo (0-5 años)',        factor: 1.25 },
  '6-15':         { label: 'Moderno (6-15 años)',      factor: 1.12 },
  '16-30':        { label: 'Intermedio (16-30 años)',  factor: 1.00 },
  '31-50':        { label: 'Antiguo (31-50 años)',     factor: 0.88 },
  '50+':          { label: 'Muy antiguo (+50 años)',   factor: 0.78 },
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
  const sorted = amenitiesKeys.filter(k => AMENITIES_CONFIG[k]).sort((a, b) => AMENITIES_CONFIG[b].impacto - AMENITIES_CONFIG[a].impacto);
  sorted.forEach((key, idx) => {
    const cfg = AMENITIES_CONFIG[key];
    const impactoEfectivo = cfg.impacto * Math.pow(0.85, idx);
    impactoAcumulado += impactoEfectivo;
    detalle.push({ key, label: cfg.label, icono: cfg.icono, impacto_nominal: cfg.impacto, impacto_efectivo: parseFloat(impactoEfectivo.toFixed(4)) });
  });
  const impactoFinal = Math.min(impactoAcumulado, 0.40);
  return { factor: parseFloat((1 + impactoFinal).toFixed(4)), impacto_total: parseFloat((impactoFinal * 100).toFixed(1)), detalle, cap_aplicado: impactoAcumulado > 0.40 };
}
 
// CRONS
cron.schedule('0 6 * * *', async () => {
  console.log('[CRON] Scraping diario...');
  try {
    await scrapeAll();
    require('child_process').execFile('node', ['generate-pages.js'], { cwd: __dirname }, (err) => {
      if (err) console.error('[CRON] Error páginas:', err.message);
      else console.log('[CRON] Páginas regeneradas');
    });
  } catch (err) { console.error('[CRON] Error:', err.message); }
});
 
cron.schedule('0 9 * * *', async () => { await actualizarDolar(); });
 
// ROUTES
app.get('/api/barrios', async (req, res) => {
  const { data } = await getMergedData();
  res.json({ ok: true, barrios: Object.entries(data).map(([key, b]) => ({ key, nombre: b.nombre, region: b.region, m2_mediana: b.m2_mediana })) });
});
 
app.get('/api/amenities', (req, res) => {
  res.json({ ok: true, amenities: Object.entries(AMENITIES_CONFIG).map(([key, v]) => ({ key, ...v })), antiguedad: Object.entries(FACTORES_ANTIGUEDAD).map(([key, v]) => ({ key, ...v })) });
});
 
app.get('/api/cotizar', async (req, res) => {
  const { barrio: barrioKey, metros: metrosStr, tipo = 'depto', op = 'venta', antiguedad = '16-30', amenities: amenitiesStr = '' } = req.query;
  if (!barrioKey) return res.status(400).json({ ok: false, error: 'Parámetro barrio requerido' });
  const metros = parseFloat(metrosStr);
  if (!metros || metros < 10 || metros > 2000) return res.status(400).json({ ok: false, error: 'Metros debe ser entre 10 y 2000' });
  const { data, dolarMep } = await getMergedData();
  const b = data[barrioKey];
  if (!b) return res.status(404).json({ ok: false, error: `Barrio '${barrioKey}' no encontrado` });
  const ajustesTipo = { depto: 1.0, ph: 0.90, estrenar: 1.12, pozo: 0.88 };
  const factorTipo = ajustesTipo[tipo] ?? 1.0;
  const cfgAntiguedad = FACTORES_ANTIGUEDAD[antiguedad] || FACTORES_ANTIGUEDAD['16-30'];
  const factorAntiguedad = cfgAntiguedad.factor;
  const amenitiesKeys = amenitiesStr ? amenitiesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const amenitiesResult = calcularFactorAmenities(amenitiesKeys);
  const factorTotal = factorTipo * cfgAntiguedad.factor * amenitiesResult.factor;
  const m2 = Math.round(b.m2_mediana * factorTotal);
  const m2_min = Math.round(b.m2_min * factorTotal);
  const m2_max = Math.round(b.m2_max * factorTotal);
  const precioUSD = Math.round(m2 * metros);
  const precioMinUSD = Math.round(m2_min * metros);
  const precioMaxUSD = Math.round(m2_max * metros);
  const precioPesos = precioUSD * dolarMep;
  const precioBaseUSD = Math.round(b.m2_mediana * factorTipo * metros);
  const diferenciaPct = parseFloat(((precioUSD - precioBaseUSD) / precioBaseUSD * 100).toFixed(1));
  const ALQ_BASE_CABA_M2_MES = 16200;
  const alqBaseM2Mes = Math.round(ALQ_BASE_CABA_M2_MES * (b.m2_mediana / 2455));
  const alqM2Mes = b.alq_m2_mes || alqBaseM2Mes;
  const alqMesPesos = Math.round(alqM2Mes * metros * factorTotal);
  const alqMinPesos = Math.round((b.alq_m2_mes_min || Math.round(alqM2Mes * 0.88)) * metros * factorTotal);
  const alqMaxPesos = Math.round((b.alq_m2_mes_max || Math.round(alqM2Mes * 1.12)) * metros * factorTotal);
  const alqRentabilidad = ((alqMesPesos * 12) / precioPesos * 100).toFixed(1);
  const promedioCABA = 2452;
  const cotizacion = {
    barrio: { key: barrioKey, nombre: b.nombre, region: b.region },
    inputs: { metros, tipo, op, antiguedad, amenities: amenitiesKeys },
    ajustes: {
      factor_tipo: { valor: factorTipo, label: tipo, impacto_pct: parseFloat(((factorTipo - 1) * 100).toFixed(1)) },
      factor_antiguedad: { valor: factorAntiguedad, label: cfgAntiguedad.label, impacto_pct: parseFloat(((factorAntiguedad - 1) * 100).toFixed(1)) },
      factor_amenities: { valor: amenitiesResult.factor, impacto_pct: amenitiesResult.impacto_total, detalle: amenitiesResult.detalle, cap_aplicado: amenitiesResult.cap_aplicado },
      factor_total: parseFloat(factorTotal.toFixed(4)),
      precio_sin_ajustes_usd: precioBaseUSD,
      diferencia_vs_base_pct: diferenciaPct,
    },
    venta: { precio_usd: precioUSD, precio_usd_min: precioMinUSD, precio_usd_max: precioMaxUSD, precio_pesos: precioPesos, m2_usd: m2, dolar_mep: dolarMep },
    alquiler: op === 'alquiler' || op === 'ambos' ? {
      estimado_mes_pesos: alqMesPesos, min_pesos: alqMinPesos, max_pesos: alqMaxPesos,
      rentabilidad_bruta_anual: parseFloat(alqRentabilidad),
      años_recupero: parseFloat((100 / parseFloat(alqRentabilidad)).toFixed(1)),
      fuente: b.alq_m2_mes ? 'scraping_tiempo_real' : 'estimacion_fallback',
      muestras: b.muestras_alquiler || 0,
    } : null,
    mercado: {
      promedio_caba_m2: promedioCABA,
      diferencia_vs_promedio_pct: parseFloat(((m2 - promedioCABA) / promedioCABA * 100).toFixed(1)),
      muestras_scraping: b.muestras || null,
      datos_desde: b.timestamp || 'ZonaProp-Index-Feb-2026',
    },
  };
  res.json({ ok: true, cotizacion });
});
 
app.get('/api/precios', async (req, res) => {
  const { data } = await getMergedData();
  res.json({ ok: true, ultima_actualizacion: 'ZonaProp-Index-Feb-2026', total_barrios: Object.keys(data).length, barrios: data });
});
 
app.get('/api/status', async (req, res) => {
  const status = await getStatus();
  res.json({
    ok: true, servidor: 'online',
    cache: status.existe ? { existe: true, ultima_actualizacion: status.ultima_actualizacion, barrios_cacheados: status.total_barrios, storage: status.storage } : { existe: false, mensaje: 'Usando datos ZonaProp Index Feb 2026', storage: status.storage },
    dolar: { mep: getDolarMep(), oficial: dolarCache.oficial, blue: dolarCache.blue, actualizado_at: dolarCache.actualizadoAt },
    crons: { scraping_diario: '06:00hs', dolar: '09:00hs' },
  });
});
 
let ultimoScrapeManual = null;
app.post('/api/scrape', async (req, res) => {
  const key = req.headers['x-api-key'] || req.body?.api_key;
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
  if (ultimoScrapeManual && (Date.now() - ultimoScrapeManual) / 60000 < 120) {
    return res.status(429).json({ ok: false, error: 'Esperá antes de volver a actualizar' });
  }
  ultimoScrapeManual = Date.now();
  res.json({ ok: true, mensaje: 'Scraping iniciado.' });
  scrapeAll().catch(err => console.error('[Manual scrape]', err.message));
});
 
// COTIZACIONES
app.post('/api/cotizacion', async (req, res) => {
  const { barrio, metros, tipo, op, antiguedad, amenities, precio_usd, m2_usd, mail } = req.body;
  if (!barrio || !metros) return res.status(400).json({ ok: false, error: 'Faltan datos' });
  await guardarCotizacion({ barrio, metros, tipo, op, antiguedad, amenities, precio_usd, m2_usd, mail: mail || null });
  res.json({ ok: true });
});
 
app.get('/api/cotizaciones', async (req, res) => {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
  const logs = await obtenerCotizaciones();
  res.json({ ok: true, total: logs.length, cotizaciones: logs });
});
 
// SEO
app.get('/barrios', (req, res) => {
  const file = path.join(__dirname, 'public', 'barrios.html');
  if (require('fs').existsSync(file)) res.sendFile(file); else res.redirect('/');
});
 
app.get('/barrio/:key', (req, res) => {
  const file = path.join(__dirname, 'public', 'barrio', `${req.params.key}.html`);
  if (require('fs').existsSync(file)) res.sendFile(file); else res.redirect('/barrios');
});
 
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
 
// START
initDB().then(async () => {
  app.listen(PORT, () => { console.log(`\n🏠 Cotizador CABA en http://localhost:${PORT}\n`); });
  actualizarDolar().catch(() => {});
  console.log('[INICIO] Generando páginas SEO...');
  require('child_process').execFile('node', ['generate-pages.js'], { cwd: __dirname }, (err) => {
    if (err) console.error('[INICIO] Error páginas:', err.message);
    else console.log('[INICIO] Páginas SEO listas');
  });
});
