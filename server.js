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
 *   DOLAR_MEP=1300             (tipo de cambio manual, opcional)
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
// Se ejecuta el día 5 de cada mes (cuando ya está publicado)
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
  // El reporte del mes actual se publica en el mes siguiente
  // Ej: reporte de febrero se publica en marzo → usamos mes anterior
  const reportDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year  = reportDate.getFullYear();
  const month = String(reportDate.getMonth() + 1).padStart(2, '0');
  const uploadYear  = now.getFullYear();
  const uploadMonth = String(now.getMonth() + 1).padStart(2, '0');

  const url = `https://www.zonaprop.com.ar/blog/wp-content/uploads/${uploadYear}/${uploadMonth}/INDEX_CABA_REPORTE_${year}-${month}.pdf`;
  console.log(`[PDF-UPDATE] Intentando descargar reporte ${year}-${month}...`);
  console.log(`[PDF-UPDATE] URL: ${url}`);

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

    // Parsear el PDF con pdf-parse
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(response.data);
    const text = data.text;

    // Extraer precio medio CABA
    const promedioMatch = text.match(/USD\s*([\d.,]+)\s*por m2.*?ciudad/i) ||
                          text.match(/ubica en USD ([\d.,]+) por m2/i);
    if (promedioMatch) {
      const promedio = parseFloat(promedioMatch[1].replace(/\./g,'').replace(',','.'));
      console.log(`[PDF-UPDATE] Precio medio CABA: USD ${promedio}/m²`);
    }

    // El PDF de ZonaProp tiene los precios en una tabla donde
    // los números aparecen separados de los nombres de barrios.
    const barriosExtraidos = {};
    // Buscamos el bloque de "PRECIO MEDIO DE CADA BARRIO" y extraemos los pares.
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Mapa de nombres del PDF a keys internos
    const BARRIO_MAP = {
      'Puerto Madero': 'puerto_madero',
      'Palermo':       'palermo',
      'Belgrano':      'belgrano',
      'Nuñez':         'nuñez',
      'Núñez':         'nuñez',
      'Recoleta':      'recoleta',
      'Colegiales':    'colegiales',
      'Chacarita':     'chacarita',
      'Villa Urquiza': 'villa_urquiza',
      'Villa del Parque': 'villa_del_parque',
      'Retiro':        'retiro',
      'San Nicolás':   'san_nicolas',
      'San Nicolas':   'san_nicolas',
      'Monserrat':     'monserrat',
      'San Telmo':     'san_telmo',
      'Balvanera':     'balvanera',
      'Villa Crespo':  'villa_crespo',
      'Caballito':     'caballito',
      'Almagro':       'almagro',
      'Flores':        'flores',
      'Liniers':       'liniers',
      'Mataderos':     'mataderos',
      'Boedo':         'boedo',
      'Barracas':      'barracas',
      'Nueva Pompeya': 'nueva_pompeya',
      'La Boca':       'la_boca',
      'Lugano':        'lugano',
    };

    // Estrategia 1: buscar patrones "BARRIO NNN" o "NNN BARRIO" en cada línea
    lines.forEach(line => {
      // Formato: "Puerto Madero 6.144" o "6.144 Puerto Madero"
      Object.entries(BARRIO_MAP).forEach(([nombre, key]) => {
        if (line.includes(nombre)) {
          const numMatch = line.match(/([\d]{1,2}[.,][\d]{3})/);
          if (numMatch) {
            const precio = parseFloat(numMatch[1].replace(/\./g,'').replace(',','.'));
            if (precio > 500 && precio < 10000) {
              barriosExtraidos[key] = precio;
            }
          }
        }
      });
    });

    // Estrategia 2: buscar precios en ranking del reporte
    // El reporte tiene una sección "BARRIO USD/M2" con lista ordenada
    const rankingMatch = text.match(/MAYOR\s+PRECIO[\s\S]*?MENOR\s+PRECIO([\s\S]*?)(?:Heat map|PRECIO MEDIO)/i);
    if (rankingMatch) {
      const rankingText = rankingMatch[1];
      const rankingLines = rankingText.split('\n').map(l => l.trim()).filter(Boolean);
      rankingLines.forEach(line => {
        Object.entries(BARRIO_MAP).forEach(([nombre, key]) => {
          if (line.includes(nombre)) {
            const numMatch = line.match(/([\d]{1,2}[.,][\d]{3})/);
            if (numMatch) {
              const precio = parseFloat(numMatch[1].replace(/\./g,'').replace(',','.'));
              if (precio > 500 && precio < 10000) {
                barriosExtraidos[key] = precio;
              }
            }
          }
        });
      });
    }

    if (Object.keys(barriosExtraidos).length > 3) {
      // Actualizar FALLBACK en memoria con los nuevos valores
      Object.entries(barriosExtraidos).forEach(([key, precio]) => {
        if (FALLBACK[key]) {
          FALLBACK[key].m2_mediana = precio;
          FALLBACK[key].m2_min = Math.round(precio * 0.85);
          FALLBACK[key].m2_max = Math.round(precio * 1.15);
        }
      });
      console.log(`[PDF-UPDATE] ✅ FALLBACK actualizado con datos ${year}-${month}`);
    } else {
      console.log(`[PDF-UPDATE] ⚠️ Pocos barrios extraídos, manteniendo datos anteriores`);
    }

  } catch (err) {
    console.warn(`[PDF-UPDATE] No se pudo actualizar desde PDF: ${err.message}`);
    console.warn('[PDF-UPDATE] Continuando con datos del código');
  }
}

// Cron: día 5 de cada mes a las 10am (el PDF suele publicarse los primeros días)
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
// FACTORES DE AJUSTE — Antigüedad y Amenities
// Basados en estudios de mercado CABA y análisis
// de diferencial de precio en publicaciones ZonaProp.
// ─────────────────────────────────────────────

/**
 * Factor de antigüedad del edificio.
 * Fuente: diferencial observado en publicaciones ZonaProp por año de construcción.
 * Un edificio nuevo (0-5 años) vale ~25% más que la mediana (que incluye todo stock).
 * Uno muy antiguo sin renovar (>50 años) vale ~20% menos.
 */
const FACTORES_ANTIGUEDAD = {
  '0-5':   { label: 'Nuevo (0-5 años)',         factor: 1.25, desc: 'Construcción reciente, materiales premium' },
  '6-15':  { label: 'Moderno (6-15 años)',       factor: 1.12, desc: 'Buenas terminaciones, sin desgaste mayor' },
  '16-30': { label: 'Intermedio (16-30 años)',   factor: 1.00, desc: 'Corresponde a la mediana del mercado' },
  '31-50': { label: 'Antiguo (31-50 años)',      factor: 0.88, desc: 'Requiere mantenimiento, instalaciones viejas' },
  '50+':   { label: 'Muy antiguo (+50 años)',    factor: 0.78, desc: 'Sin renovar: desgaste estructural y de servicios' },
  'refaccionado': { label: 'Refaccionado/reciclado', factor: 1.08, desc: 'Edificio antiguo con reforma integral reciente' },
};

/**
 * Amenities y su impacto individual en el precio/m².
 * Cada amenity suma un % sobre la base. Los efectos son acumulativos
 * pero con rendimiento decreciente (cap en +40% total).
 *
 * Fuente: análisis diferencial de precio en ZonaProp CABA filtrando
 * por palabra clave en descripción vs precio/m².
 */
const AMENITIES_CONFIG = {
  pileta:       { label: 'Pileta',              impacto: 0.08, icono: '🏊', desc: '+8% — el amenity de mayor impacto en CABA' },
  gimnasio:     { label: 'Gimnasio',            impacto: 0.05, icono: '🏋️', desc: '+5%' },
  sum:          { label: 'SUM / Salón de usos', impacto: 0.03, icono: '🎉', desc: '+3%' },
  seguridad24:  { label: 'Seguridad 24hs',      impacto: 0.04, icono: '💂', desc: '+4%' },
  cochera:      { label: 'Cochera incluida',    impacto: 0.10, icono: '🚗', desc: '+10% — agrega valor autónomo a la unidad' },
  terraza:      { label: 'Terraza / rooftop',   impacto: 0.04, icono: '🌆', desc: '+4%' },
  laundry:      { label: 'Laundry',             impacto: 0.02, icono: '🧺', desc: '+2%' },
  coworking:    { label: 'Coworking',           impacto: 0.03, icono: '💻', desc: '+3% — valorado en edificios modernos' },
  quincho:      { label: 'Quincho/parrilla',    impacto: 0.03, icono: '🔥', desc: '+3%' },
  portero:      { label: 'Portero/encargado',   impacto: 0.02, icono: '🏢', desc: '+2%' },
  bicicletero:  { label: 'Bicicletero',         impacto: 0.01, icono: '🚲', desc: '+1%' },
  vista_al_rio: { label: 'Vista al río/parque', impacto: 0.06, icono: '🌊', desc: '+6% — vista premium' },
};

/**
 * Calcula el factor combinado de amenities con rendimiento decreciente.
 * El primer amenity suma su % completo; los siguientes suman
 * un poco menos para reflejar que no son perfectamente aditivos.
 */
function calcularFactorAmenities(amenitiesKeys) {
  if (!amenitiesKeys || amenitiesKeys.length === 0) return { factor: 1.0, impacto_total: 0, detalle: [] };

  const detalle = [];
  let impactoAcumulado = 0;

  // Ordenar de mayor a menor impacto
  const sorted = amenitiesKeys
    .filter(k => AMENITIES_CONFIG[k])
    .sort((a, b) => AMENITIES_CONFIG[b].impacto - AMENITIES_CONFIG[a].impacto);

  sorted.forEach((key, idx) => {
    const cfg = AMENITIES_CONFIG[key];
    // Rendimiento decreciente: cada amenity adicional aporta 85% del anterior
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

  // Cap máximo de +40% por amenities
  const impactoFinal = Math.min(impactoAcumulado, 0.40);

  return {
    factor: parseFloat((1 + impactoFinal).toFixed(4)),
    impacto_total: parseFloat((impactoFinal * 100).toFixed(1)),
    detalle,
    cap_aplicado: impactoAcumulado > 0.40,
  };
}

// GET /api/amenities — devuelve la lista de amenities disponibles
app.get('/api/amenities', (req, res) => {
  res.json({
    ok: true,
    amenities: Object.entries(AMENITIES_CONFIG).map(([key, v]) => ({ key, ...v })),
    antiguedad: Object.entries(FACTORES_ANTIGUEDAD).map(([key, v]) => ({ key, ...v })),
  });
});

// GET /api/cotizar?barrio=palermo&metros=65&tipo=depto&op=venta&antiguedad=6-15&amenities=pileta,gimnasio,cochera
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

  // Factor tipo de unidad
  const ajustesTipo = { depto: 1.0, ph: 0.90, estrenar: 1.12, pozo: 0.88 };
  const factorTipo = ajustesTipo[tipo] ?? 1.0;

  // Factor antigüedad
  const cfgAntiguedad = FACTORES_ANTIGUEDAD[antiguedad] || FACTORES_ANTIGUEDAD['16-30'];
  const factorAntiguedad = cfgAntiguedad.factor;

  // Factor amenities
  const amenitiesKeys = amenitiesStr ? amenitiesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const amenitiesResult = calcularFactorAmenities(amenitiesKeys);
  const factorAmenities = amenitiesResult.factor;

  // Factor combinado total
  const factorTotal = factorTipo * factorAntiguedad * factorAmenities;
  const factorBase  = factorTipo; // sin antigüedad ni amenities

  const m2_base = Math.round(b.m2_mediana * factorBase);
  const m2      = Math.round(b.m2_mediana * factorTotal);
  const m2_min  = Math.round(b.m2_min * factorTotal);
  const m2_max  = Math.round(b.m2_max * factorTotal);

  const precioUSD    = Math.round(m2 * metros);
  const precioMinUSD = Math.round(m2_min * metros);
  const precioMaxUSD = Math.round(m2_max * metros);
  const precioPesos  = precioUSD * dolarMep;

  // Precio sin ajustes (para mostrar diferencia)
  const precioBaseUSD = Math.round(m2_base * metros);
  const diferenciaPct = parseFloat(((precioUSD - precioBaseUSD) / precioBaseUSD * 100).toFixed(1));

  // Alquiler estimado — usa precio/m²/mes scrapeado si está disponible, sino fallback
  const alqM2Mes = b.alq_m2_mes || Math.round(b.alq_ratio * m2 * dolarMep);
  const alqM2MesMin = b.alq_m2_mes_min || Math.round(alqM2Mes * 0.85);
  const alqM2MesMax = b.alq_m2_mes_max || Math.round(alqM2Mes * 1.15);

  const alqMesPesos    = Math.round(alqM2Mes * metros * factorTotal);
  const alqMinPesos    = Math.round(alqM2MesMin * metros * factorTotal);
  const alqMaxPesos    = Math.round(alqM2MesMax * metros * factorTotal);
  const alqRentabilidad = ((alqMesPesos * 12) / precioPesos * 100).toFixed(1);
  const añosRecupero   = (100 / parseFloat(alqRentabilidad)).toFixed(1);

  // Comparativa vs CABA promedio
  const promedioCABA = 2452;
  const diffVsPromedio = ((m2 - promedioCABA) / promedioCABA * 100).toFixed(1);

  const cotizacion = {
    barrio: {
      key: barrioKey,
      nombre: b.nombre,
      region: b.region,
    },
    inputs: { metros, tipo, op, antiguedad, amenities: amenitiesKeys },
    ajustes: {
      factor_tipo:       { valor: factorTipo,      label: tipo,                          impacto_pct: parseFloat(((factorTipo - 1) * 100).toFixed(1)) },
      factor_antiguedad: { valor: factorAntiguedad, label: cfgAntiguedad.label,           impacto_pct: parseFloat(((factorAntiguedad - 1) * 100).toFixed(1)) },
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

// GET /api/precios — todos los barrios con sus precios
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

// POST /api/scrape — fuerza scraping manual (protegido con API_KEY + rate limit)
let ultimoScrapeManual = null;
const MINUTOS_ENTRE_SCRAPES = 120; // mínimo 2 horas entre scrapes manuales

app.post('/api/scrape', async (req, res) => {
  const key = req.headers['x-api-key'] || req.body?.api_key;
  if (key !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
  }

  // Rate limiting: no más de 1 scrape manual cada 2 horas
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

  // Intentar actualizar datos desde PDF de ZonaProp al arrancar
  actualizarDesdePDF().catch(err => console.warn('[INICIO] PDF update:', err.message));
});
