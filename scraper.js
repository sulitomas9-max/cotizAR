/**
 * scraper.js — Venta + Alquiler en tiempo real
 * Fuentes: ZonaProp (Playwright) + Argenprop (Axios/Cheerio)
 */

const puppeteer = require('puppeteer-core');
const axios = require('axios');
const cheerio = require('cheerio');
const { guardarResultados, cargarDatos } = require('./db');

const BARRIOS = [
  { key: 'puerto_madero',    nombre: 'Puerto Madero',    zpSlug: 'puerto-madero',    apSlug: 'puerto-madero'    },
  { key: 'palermo',          nombre: 'Palermo',          zpSlug: 'palermo',          apSlug: 'palermo'          },
  { key: 'belgrano',         nombre: 'Belgrano',         zpSlug: 'belgrano',         apSlug: 'belgrano'         },
  { key: 'nuñez',            nombre: 'Núñez',            zpSlug: 'nuñez',            apSlug: 'nunez'            },
  { key: 'recoleta',         nombre: 'Recoleta',         zpSlug: 'recoleta',         apSlug: 'recoleta'         },
  { key: 'barrio_norte',     nombre: 'Barrio Norte',     zpSlug: 'barrio-norte',     apSlug: 'barrio-norte'     },
  { key: 'colegiales',       nombre: 'Colegiales',       zpSlug: 'colegiales',       apSlug: 'colegiales'       },
  { key: 'chacarita',        nombre: 'Chacarita',        zpSlug: 'chacarita',        apSlug: 'chacarita'        },
  { key: 'villa_urquiza',    nombre: 'Villa Urquiza',    zpSlug: 'villa-urquiza',    apSlug: 'villa-urquiza'    },
  { key: 'villa_del_parque', nombre: 'Villa del Parque', zpSlug: 'villa-del-parque', apSlug: 'villa-del-parque' },
  { key: 'retiro',           nombre: 'Retiro',           zpSlug: 'retiro',           apSlug: 'retiro'           },
  { key: 'san_nicolas',      nombre: 'San Nicolás',      zpSlug: 'san-nicolas',      apSlug: 'san-nicolas'      },
  { key: 'monserrat',        nombre: 'Monserrat',        zpSlug: 'monserrat',        apSlug: 'monserrat'        },
  { key: 'san_telmo',        nombre: 'San Telmo',        zpSlug: 'san-telmo',        apSlug: 'san-telmo'        },
  { key: 'balvanera',        nombre: 'Balvanera',        zpSlug: 'balvanera',        apSlug: 'balvanera'        },
  { key: 'villa_crespo',     nombre: 'Villa Crespo',     zpSlug: 'villa-crespo',     apSlug: 'villa-crespo'     },
  { key: 'caballito',        nombre: 'Caballito',        zpSlug: 'caballito',        apSlug: 'caballito'        },
  { key: 'almagro',          nombre: 'Almagro',          zpSlug: 'almagro',          apSlug: 'almagro'          },
  { key: 'flores',           nombre: 'Flores',           zpSlug: 'flores',           apSlug: 'flores'           },
  { key: 'liniers',          nombre: 'Liniers',          zpSlug: 'liniers',          apSlug: 'liniers'          },
  { key: 'mataderos',        nombre: 'Mataderos',        zpSlug: 'mataderos',        apSlug: 'mataderos'        },
  { key: 'boedo',            nombre: 'Boedo',            zpSlug: 'boedo',            apSlug: 'boedo'            },
  { key: 'barracas',         nombre: 'Barracas',         zpSlug: 'barracas',         apSlug: 'barracas'         },
  { key: 'nueva_pompeya',    nombre: 'Nueva Pompeya',    zpSlug: 'nueva-pompeya',    apSlug: 'nueva-pompeya'    },
  { key: 'la_boca',          nombre: 'La Boca',          zpSlug: 'la-boca',          apSlug: 'la-boca'          },
  { key: 'lugano',           nombre: 'Lugano',           zpSlug: 'lugano',           apSlug: 'lugano'           },
];

// ─────────────────────────────────────────────
// ZONAPROP — VENTA
// ─────────────────────────────────────────────
async function scrapeZonaPropVenta(page, barrio) {
  const url = `https://www.zonaprop.com.ar/departamentos-venta-${barrio.zpSlug}.html`;
  console.log(`  [ZP venta] ${barrio.nombre}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('[data-qa="posting-card-price"]', { timeout: 15000 }).catch(() => {});
    return await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('[data-qa="posting-card"]').forEach(card => {
        try {
          const priceText = card.querySelector('[data-qa="posting-card-price"]')?.textContent.trim();
          const surfaceText = card.querySelector('[data-qa="posting-card-main-features-surface"]')?.textContent.trim();
          if (!priceText || !surfaceText) return;
          const usdMatch = priceText.match(/USD\s*([\d.,]+)/i);
          if (!usdMatch) return;
          const precio = parseFloat(usdMatch[1].replace(/\./g, '').replace(',', '.'));
          const m2Match = surfaceText.match(/([\d.,]+)\s*m²/i);
          if (!m2Match) return;
          const superficie = parseFloat(m2Match[1].replace(',', '.'));
          if (precio > 0 && superficie > 15 && superficie < 1000)
            results.push({ precioM2: Math.round(precio / superficie) });
        } catch (e) {}
      });
      return results;
    });
  } catch (err) {
    console.warn(`  [ZP venta] Error: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// ZONAPROP — ALQUILER
// ─────────────────────────────────────────────
async function scrapeZonaPropAlquiler(page, barrio) {
  const url = `https://www.zonaprop.com.ar/departamentos-alquiler-${barrio.zpSlug}.html`;
  console.log(`  [ZP alquiler] ${barrio.nombre}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('[data-qa="posting-card-price"]', { timeout: 15000 }).catch(() => {});
    return await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('[data-qa="posting-card"]').forEach(card => {
        try {
          const priceText = card.querySelector('[data-qa="posting-card-price"]')?.textContent.trim();
          const surfaceText = card.querySelector('[data-qa="posting-card-main-features-surface"]')?.textContent.trim();
          if (!priceText || !surfaceText) return;
          // Precio en pesos ARS por mes
          const arsMatch = priceText.match(/\$\s*([\d.,]+)/);
          if (!arsMatch) return;
          const precioMes = parseFloat(arsMatch[1].replace(/\./g, '').replace(',', '.'));
          const m2Match = surfaceText.match(/([\d.,]+)\s*m²/i);
          if (!m2Match) return;
          const superficie = parseFloat(m2Match[1].replace(',', '.'));
          if (precioMes > 100000 && superficie > 20 && superficie < 300)
            results.push({ precioM2Mes: Math.round(precioMes / superficie), precioMes, superficie });
        } catch (e) {}
      });
      return results;
    });
  } catch (err) {
    console.warn(`  [ZP alquiler] Error: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// ARGENPROP — VENTA
// ─────────────────────────────────────────────
async function scrapeArgenpropVenta(barrio) {
  const url = `https://www.argenprop.com/departamento/venta/capital-federal/${barrio.apSlug}`;
  console.log(`  [AP venta] ${barrio.nombre}`);
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'es-AR,es;q=0.9' },
      timeout: 20000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('.listing__item').each((i, el) => {
      try {
        const priceText = $(el).find('.price__amount').text().trim();
        const surfaceText = $(el).find('.card__common-data').filter((_, e) => $(e).text().includes('m²')).first().text().trim();
        const usdMatch = priceText.match(/USD\s*([\d.,]+)/i);
        if (!usdMatch) return;
        const precio = parseFloat(usdMatch[1].replace(/\./g, '').replace(',', '.'));
        const m2Match = surfaceText.match(/([\d.,]+)\s*m²/i);
        if (!m2Match) return;
        const superficie = parseFloat(m2Match[1].replace(',', '.'));
        if (precio > 0 && superficie > 15 && superficie < 1000)
          results.push({ precioM2: Math.round(precio / superficie) });
      } catch (e) {}
    });
    return results;
  } catch (err) {
    console.warn(`  [AP venta] Error: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// ARGENPROP — ALQUILER
// ─────────────────────────────────────────────
async function scrapeArgenpropAlquiler(barrio) {
  const url = `https://www.argenprop.com/departamento/alquiler/capital-federal/${barrio.apSlug}`;
  console.log(`  [AP alquiler] ${barrio.nombre}`);
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'es-AR,es;q=0.9' },
      timeout: 20000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $('.listing__item').each((i, el) => {
      try {
        const priceText = $(el).find('.price__amount').text().trim();
        const surfaceText = $(el).find('.card__common-data').filter((_, e) => $(e).text().includes('m²')).first().text().trim();
        const arsMatch = priceText.match(/\$\s*([\d.,]+)/);
        if (!arsMatch) return;
        const precioMes = parseFloat(arsMatch[1].replace(/\./g, '').replace(',', '.'));
        const m2Match = surfaceText.match(/([\d.,]+)\s*m²/i);
        if (!m2Match) return;
        const superficie = parseFloat(m2Match[1].replace(',', '.'));
        if (precioMes > 100000 && superficie > 20 && superficie < 300)
          results.push({ precioM2Mes: Math.round(precioMes / superficie), precioMes, superficie });
      } catch (e) {}
    });
    return results;
  } catch (err) {
    console.warn(`  [AP alquiler] Error: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// ESTADÍSTICAS con filtro IQR
// ─────────────────────────────────────────────
function calcularEstadisticas(valores) {
  if (!valores || valores.length < 3) return null;
  const sorted = [...valores].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const filtrados = sorted.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
  if (filtrados.length === 0) return null;
  const mediana = filtrados[Math.floor(filtrados.length / 2)];
  const media = Math.round(filtrados.reduce((a, b) => a + b, 0) / filtrados.length);
  const min = Math.round(filtrados[Math.floor(filtrados.length * 0.1)]);
  const max = Math.round(filtrados[Math.floor(filtrados.length * 0.9)]);
  return { mediana, media, min, max, muestras: filtrados.length };
}

// ─────────────────────────────────────────────
// SCRAPE PRINCIPAL
// ─────────────────────────────────────────────
async function scrapeAll() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Scraping VENTA + ALQUILER CABA');
  console.log(`  ${new Date().toLocaleString('es-AR')}`);
  console.log('═══════════════════════════════════════════\n');

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ||
    '/usr/bin/chromium' ||
    '/usr/bin/chromium-browser' ||
    '/usr/bin/google-chrome';

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
  const resultados = {};
  const timestamp = new Date().toISOString();
  const cacheActual = await cargarDatos();

  for (const barrio of BARRIOS) {
    console.log(`\n▶ ${barrio.nombre}`);

    const [zpV, apV, zpA, apA] = await Promise.allSettled([
      scrapeZonaPropVenta(page, barrio),
      scrapeArgenpropVenta(barrio),
      scrapeZonaPropAlquiler(page, barrio),
      scrapeArgenpropAlquiler(barrio),
    ]);

    const ventaVals = [
      ...(zpV.status === 'fulfilled' ? zpV.value.map(l => l.precioM2) : []),
      ...(apV.status === 'fulfilled' ? apV.value.map(l => l.precioM2) : []),
    ];
    const alqVals = [
      ...(zpA.status === 'fulfilled' ? zpA.value.map(l => l.precioM2Mes) : []),
      ...(apA.status === 'fulfilled' ? apA.value.map(l => l.precioM2Mes) : []),
    ];

    const ventaStats = calcularEstadisticas(ventaVals);
    const alqStats   = calcularEstadisticas(alqVals);
    const previo     = cacheActual?.barrios?.[barrio.key] || {};

    if (ventaStats) console.log(`  ✓ Venta: ${ventaStats.muestras} muestras · USD ${ventaStats.mediana}/m²`);
    else            console.log(`  ✗ Venta: fallback`);
    if (alqStats)   console.log(`  ✓ Alquiler: ${alqStats.muestras} muestras · $${alqStats.mediana}/m²/mes`);
    else            console.log(`  ✗ Alquiler: fallback`);

    resultados[barrio.key] = {
      nombre: barrio.nombre,
      // Venta
      m2_mediana:       ventaStats?.mediana ?? previo.m2_mediana,
      m2_media:         ventaStats?.media   ?? previo.m2_media,
      m2_min:           ventaStats?.min     ?? previo.m2_min,
      m2_max:           ventaStats?.max     ?? previo.m2_max,
      muestras_venta:   ventaStats?.muestras ?? 0,
      // Alquiler — precio ARS por m² por mes (se multiplica por metros en el server)
      alq_m2_mes:       alqStats?.mediana ?? previo.alq_m2_mes,
      alq_m2_mes_min:   alqStats?.min     ?? previo.alq_m2_mes_min,
      alq_m2_mes_max:   alqStats?.max     ?? previo.alq_m2_mes_max,
      muestras_alquiler: alqStats?.muestras ?? 0,
      fuentes: {
        zp_venta:    zpV.status === 'fulfilled' ? zpV.value.length : 0,
        ap_venta:    apV.status === 'fulfilled' ? apV.value.length : 0,
        zp_alquiler: zpA.status === 'fulfilled' ? zpA.value.length : 0,
        ap_alquiler: apA.status === 'fulfilled' ? apA.value.length : 0,
      },
      timestamp,
    };

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
  }

  await browser.close();

  const output = {
    ultima_actualizacion: timestamp,
    total_barrios: Object.keys(resultados).length,
    barrios: resultados,
  };

  fs.writeFileSync(CACHE_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✅ Cache actualizado → ${CACHE_PATH}`);
  console.log(`   ${Object.keys(resultados).length}/${BARRIOS.length} barrios procesados\n`);
  return output;
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch (e) {}
  return null;
}

module.exports = { scrapeAll, loadCache };

if (require.main === module) {
  scrapeAll().catch(console.error);
}
