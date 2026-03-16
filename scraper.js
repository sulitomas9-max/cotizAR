/**
 * scraper.js
 * Scraper de precios de departamentos en CABA.
 * Fuentes: ZonaProp y Argenprop.
 * Usa Playwright para páginas con JS dinámico y Axios+Cheerio para estáticas.
 *
 * Ejecutar manualmente:  node scraper.js
 * Llamado por el cron en server.js cada 24hs.
 */

const { chromium } = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'cache.json');

// Barrios de CABA con sus slugs en ZonaProp y Argenprop
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
// SCRAPER ZONAPROP (Playwright — JS dinámico)
// ─────────────────────────────────────────────
async function scrapeZonaProp(page, barrio) {
  const url = `https://www.zonaprop.com.ar/departamentos-venta-${barrio.zpSlug}.html`;
  console.log(`  [ZonaProp] ${barrio.nombre} → ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Esperar que carguen las tarjetas de propiedades
    await page.waitForSelector('[data-qa="posting-card-price"]', { timeout: 15000 }).catch(() => {});

    const listings = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-qa="posting-card"]');
      const results = [];

      cards.forEach(card => {
        try {
          const priceEl = card.querySelector('[data-qa="posting-card-price"]');
          const surfaceEl = card.querySelector('[data-qa="posting-card-main-features-surface"]');
          const expensesEl = card.querySelector('[data-qa="posting-card-expenses"]');

          if (!priceEl || !surfaceEl) return;

          const priceText = priceEl.textContent.trim();
          const surfaceText = surfaceEl.textContent.trim();

          // Extraer precio en USD
          const usdMatch = priceText.match(/USD\s*([\d.,]+)/i);
          if (!usdMatch) return;
          const precio = parseFloat(usdMatch[1].replace(/\./g, '').replace(',', '.'));

          // Extraer superficie en m²
          const m2Match = surfaceText.match(/([\d.,]+)\s*m²/i);
          if (!m2Match) return;
          const superficie = parseFloat(m2Match[1].replace(',', '.'));

          if (precio > 0 && superficie > 15 && superficie < 1000) {
            results.push({ precio, superficie, precioM2: Math.round(precio / superficie) });
          }
        } catch (e) {}
      });

      return results;
    });

    return listings;
  } catch (err) {
    console.warn(`  [ZonaProp] Error en ${barrio.nombre}: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// SCRAPER ARGENPROP (Axios + Cheerio)
// ─────────────────────────────────────────────
async function scrapeArgenprop(barrio) {
  const url = `https://www.argenprop.com/departamento/venta/capital-federal/${barrio.apSlug}`;
  console.log(`  [Argenprop] ${barrio.nombre} → ${url}`);

  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-AR,es;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 20000,
    });

    const $ = cheerio.load(data);
    const results = [];

    // Selectores Argenprop (actualizar si cambia el markup)
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

        if (precio > 0 && superficie > 15 && superficie < 1000) {
          results.push({ precio, superficie, precioM2: Math.round(precio / superficie) });
        }
      } catch (e) {}
    });

    return results;
  } catch (err) {
    console.warn(`  [Argenprop] Error en ${barrio.nombre}: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// CALCULAR ESTADÍSTICAS DE LOS LISTINGS
// ─────────────────────────────────────────────
function calcularEstadisticas(listings) {
  if (!listings || listings.length === 0) return null;

  // Filtrar outliers con método IQR
  const precios = listings.map(l => l.precioM2).sort((a, b) => a - b);
  const q1 = precios[Math.floor(precios.length * 0.25)];
  const q3 = precios[Math.floor(precios.length * 0.75)];
  const iqr = q3 - q1;
  const filtrados = precios.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);

  if (filtrados.length === 0) return null;

  const mediana = filtrados[Math.floor(filtrados.length / 2)];
  const media = Math.round(filtrados.reduce((a, b) => a + b, 0) / filtrados.length);
  const min = Math.round(filtrados[Math.floor(filtrados.length * 0.1)]);   // P10
  const max = Math.round(filtrados[Math.floor(filtrados.length * 0.9)]);   // P90

  return { mediana, media, min, max, muestras: filtrados.length };
}

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL — Scrapea todos los barrios
// ─────────────────────────────────────────────
async function scrapeAll() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Iniciando scraping de precios CABA');
  console.log(`  ${new Date().toLocaleString('es-AR')}`);
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-AR',
  });

  const page = await context.newPage();
  const resultados = {};
  const timestamp = new Date().toISOString();

  for (const barrio of BARRIOS) {
    console.log(`\n▶ Procesando: ${barrio.nombre}`);

    // Scrape ambas fuentes en paralelo
    const [zpListings, apListings] = await Promise.allSettled([
      scrapeZonaProp(page, barrio),
      scrapeArgenprop(barrio),
    ]);

    const allListings = [
      ...(zpListings.status === 'fulfilled' ? zpListings.value : []),
      ...(apListings.status === 'fulfilled' ? apListings.value : []),
    ];

    const stats = calcularEstadisticas(allListings);

    if (stats) {
      console.log(`  ✓ ${stats.muestras} muestras · mediana USD ${stats.mediana}/m²`);
      resultados[barrio.key] = {
        nombre: barrio.nombre,
        m2_mediana: stats.mediana,
        m2_media: stats.media,
        m2_min: stats.min,
        m2_max: stats.max,
        muestras: stats.muestras,
        fuentes: {
          zonaprop: zpListings.status === 'fulfilled' ? zpListings.value.length : 0,
          argenprop: apListings.status === 'fulfilled' ? apListings.value.length : 0,
        },
        timestamp,
      };
    } else {
      console.log(`  ✗ Sin datos suficientes — usando fallback`);
      // Mantener el valor anterior del cache si existe
      const cache = loadCache();
      if (cache?.barrios?.[barrio.key]) {
        resultados[barrio.key] = { ...cache.barrios[barrio.key], fuente_fallback: true };
      }
    }

    // Pausa entre requests para no saturar
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
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch (e) {}
  return null;
}

module.exports = { scrapeAll, loadCache };

// Ejecutar directamente si se llama como script
if (require.main === module) {
  scrapeAll().catch(console.error);
}
