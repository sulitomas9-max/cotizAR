/**
 * scraper.js
 * Actualiza precios de departamentos CABA desde fuentes públicas y libres.
 *
 * Fuentes (en orden de prioridad):
 *   1. Argenprop API interna (sin bloqueo, JSON limpio)
 *   2. ZonaProp (scraping HTML de páginas de barrio)
 *   3. Cache previo como fallback
 *
 * Corre automáticamente todos los días a las 3am desde server.js.
 * Uso manual: node scraper.js
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const { guardarResultados, cargarDatos } = require('./db');

// ─────────────────────────────────────────────
// BARRIOS — 48 barrios CABA con slugs para cada fuente
// ─────────────────────────────────────────────
const BARRIOS = [
  // ── CORREDOR NORTE ──
  { key: 'puerto_madero',      nombre: 'Puerto Madero',     apSlug: 'puerto-madero',      zpSlug: 'departamentos-venta-puerto-madero-capital-federal' },
  { key: 'palermo',            nombre: 'Palermo',           apSlug: 'palermo',            zpSlug: 'departamentos-venta-palermo-capital-federal'       },
  { key: 'palermo_soho',       nombre: 'Palermo Soho',      apSlug: 'palermo-soho',       zpSlug: 'departamentos-venta-palermo-soho-capital-federal'  },
  { key: 'palermo_hollywood',  nombre: 'Palermo Hollywood', apSlug: 'palermo-hollywood',  zpSlug: null },
  { key: 'las_canitas',        nombre: 'Las Cañitas',       apSlug: 'las-canitas',        zpSlug: null },
  { key: 'belgrano',           nombre: 'Belgrano',          apSlug: 'belgrano',           zpSlug: 'departamentos-venta-belgrano-capital-federal'      },
  { key: 'nunez',              nombre: 'Núñez',             apSlug: 'nunez',              zpSlug: 'departamentos-venta-nunez-capital-federal'         },
  { key: 'recoleta',           nombre: 'Recoleta',          apSlug: 'recoleta',           zpSlug: 'departamentos-venta-recoleta-capital-federal'      },
  { key: 'barrio_norte',       nombre: 'Barrio Norte',      apSlug: 'barrio-norte',       zpSlug: 'departamentos-venta-barrio-norte-capital-federal'  },
  { key: 'saavedra',           nombre: 'Saavedra',          apSlug: 'saavedra',           zpSlug: 'departamentos-venta-saavedra-capital-federal'      },
  // ── CORREDOR NOROESTE ──
  { key: 'colegiales',         nombre: 'Colegiales',        apSlug: 'colegiales',         zpSlug: 'departamentos-venta-colegiales-capital-federal'    },
  { key: 'chacarita',          nombre: 'Chacarita',         apSlug: 'chacarita',          zpSlug: 'departamentos-venta-chacarita-capital-federal'     },
  { key: 'villa_urquiza',      nombre: 'Villa Urquiza',     apSlug: 'villa-urquiza',      zpSlug: 'departamentos-venta-villa-urquiza-capital-federal' },
  { key: 'villa_del_parque',   nombre: 'Villa del Parque',  apSlug: 'villa-del-parque',   zpSlug: 'departamentos-venta-villa-del-parque-capital-federal' },
  { key: 'villa_pueyrredon',   nombre: 'Villa Pueyrredón',  apSlug: 'villa-pueyrredon',   zpSlug: null },
  { key: 'villa_devoto',       nombre: 'Villa Devoto',      apSlug: 'villa-devoto',       zpSlug: 'departamentos-venta-villa-devoto-capital-federal'  },
  { key: 'la_paternal',        nombre: 'La Paternal',       apSlug: 'la-paternal',        zpSlug: null },
  { key: 'agronomia',          nombre: 'Agronomía',         apSlug: 'agronomia',          zpSlug: null },
  // ── MACROCENTRO ──
  { key: 'retiro',             nombre: 'Retiro',            apSlug: 'retiro',             zpSlug: 'departamentos-venta-retiro-capital-federal'        },
  { key: 'san_nicolas',        nombre: 'San Nicolás',       apSlug: 'san-nicolas',        zpSlug: 'departamentos-venta-san-nicolas-capital-federal'   },
  { key: 'monserrat',          nombre: 'Monserrat',         apSlug: 'monserrat',          zpSlug: 'departamentos-venta-monserrat-capital-federal'     },
  { key: 'san_telmo',          nombre: 'San Telmo',         apSlug: 'san-telmo',          zpSlug: 'departamentos-venta-san-telmo-capital-federal'     },
  { key: 'balvanera',          nombre: 'Balvanera',         apSlug: 'balvanera',          zpSlug: 'departamentos-venta-balvanera-capital-federal'     },
  { key: 'constitucion',       nombre: 'Constitución',      apSlug: 'constitucion',       zpSlug: null },
  { key: 'congreso',           nombre: 'Congreso',          apSlug: 'congreso',           zpSlug: null },
  // ── CENTRO-OESTE ──
  { key: 'villa_crespo',       nombre: 'Villa Crespo',      apSlug: 'villa-crespo',       zpSlug: 'departamentos-venta-villa-crespo-capital-federal'  },
  { key: 'caballito',          nombre: 'Caballito',         apSlug: 'caballito',          zpSlug: 'departamentos-venta-caballito-capital-federal'     },
  { key: 'almagro',            nombre: 'Almagro',           apSlug: 'almagro',            zpSlug: 'departamentos-venta-almagro-capital-federal'       },
  { key: 'boedo',              nombre: 'Boedo',             apSlug: 'boedo',              zpSlug: 'departamentos-venta-boedo-capital-federal'         },
  { key: 'parque_chacabuco',   nombre: 'Parque Chacabuco',  apSlug: 'parque-chacabuco',   zpSlug: null },
  { key: 'parque_patricios',   nombre: 'Parque Patricios',  apSlug: 'parque-patricios',   zpSlug: null },
  // ── OESTE ──
  { key: 'flores',             nombre: 'Flores',            apSlug: 'flores',             zpSlug: 'departamentos-venta-flores-capital-federal'        },
  { key: 'floresta',           nombre: 'Floresta',          apSlug: 'floresta',           zpSlug: null },
  { key: 'monte_castro',       nombre: 'Monte Castro',      apSlug: 'monte-castro',       zpSlug: null },
  { key: 'velez_sarsfield',    nombre: 'Vélez Sársfield',   apSlug: 'velez-sarsfield',    zpSlug: null },
  { key: 'villa_real',         nombre: 'Villa Real',        apSlug: 'villa-real',         zpSlug: null },
  { key: 'versalles',          nombre: 'Versalles',         apSlug: 'versalles',          zpSlug: null },
  { key: 'villa_santa_rita',   nombre: 'Villa Santa Rita',  apSlug: 'villa-santa-rita',   zpSlug: null },
  { key: 'liniers',            nombre: 'Liniers',           apSlug: 'liniers',            zpSlug: 'departamentos-venta-liniers-capital-federal'       },
  { key: 'mataderos',          nombre: 'Mataderos',         apSlug: 'mataderos',          zpSlug: 'departamentos-venta-mataderos-capital-federal'     },
  { key: 'villa_luro',         nombre: 'Villa Luro',        apSlug: 'villa-luro',         zpSlug: null },
  { key: 'villa_general_mitre',nombre: 'Villa Gral. Mitre', apSlug: 'villa-general-mitre',zpSlug: null },
  // ── SUR ──
  { key: 'barracas',           nombre: 'Barracas',          apSlug: 'barracas',           zpSlug: 'departamentos-venta-barracas-capital-federal'      },
  { key: 'la_boca',            nombre: 'La Boca',           apSlug: 'la-boca',            zpSlug: 'departamentos-venta-la-boca-capital-federal'       },
  { key: 'nueva_pompeya',      nombre: 'Nueva Pompeya',     apSlug: 'nueva-pompeya',      zpSlug: null },
  { key: 'villa_soldati',      nombre: 'Villa Soldati',     apSlug: 'villa-soldati',      zpSlug: null },
  { key: 'villa_riachuelo',    nombre: 'Villa Riachuelo',   apSlug: 'villa-riachuelo',    zpSlug: null },
  { key: 'villa_lugano',       nombre: 'Villa Lugano',      apSlug: 'villa-lugano',       zpSlug: 'departamentos-venta-villa-lugano-capital-federal'  },
];

const HEADERS_BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

// ─────────────────────────────────────────────
// FUENTE 1: ARGENPROP
// Scraping del HTML de la página de cada barrio.
// Argenprop muestra precios en USD directamente.
// ─────────────────────────────────────────────
async function scrapeArgenprop(barrio) {
  const ventaPrecios = [];
  const alqPrecios   = [];

  try {
    // Venta
    const urlVenta = `https://www.argenprop.com/departamento/venta/capital-federal/${barrio.apSlug}`;
    const { data } = await axios.get(urlVenta, {
      headers: HEADERS_BROWSER, timeout: 15000,
    });
    const $ = cheerio.load(data);

    // Argenprop muestra el precio en USD y la superficie en cada card
    $('[class*="listing-card"], [class*="property-card"], article').each((i, el) => {
      try {
        const textoCompleto = $(el).text();

        // Extraer precio USD
        const precioMatch = textoCompleto.match(/USD?\s*[\$]?\s*([\d.,]+)/i) ||
                            textoCompleto.match(/U\$S\s*([\d.,]+)/i);
        if (!precioMatch) return;
        const precio = parseFloat(precioMatch[1].replace(/\./g, '').replace(',', '.'));
        if (!precio || precio < 20000 || precio > 5000000) return;

        // Extraer superficie
        const supMatch = textoCompleto.match(/(\d+)\s*m[²2²]/i);
        if (!supMatch) return;
        const sup = parseFloat(supMatch[1]);
        if (!sup || sup < 15 || sup > 800) return;

        const m2 = Math.round(precio / sup);
        if (m2 > 500 && m2 < 15000) ventaPrecios.push(m2);
      } catch(e) {}
    });

    // También buscar en JSON-LD embebido (más confiable)
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const json = JSON.parse($(el).html());
        const items = Array.isArray(json) ? json : [json];
        items.forEach(item => {
          if (item['@type'] === 'Product' || item['@type'] === 'RealEstateListing') {
            const precio = parseFloat(item?.offers?.price || item?.price);
            const sup = parseFloat(item?.floorSize?.value || item?.floorSize);
            if (precio && sup && precio > 20000 && sup > 15 && sup < 800) {
              const m2 = Math.round(precio / sup);
              if (m2 > 500 && m2 < 15000) ventaPrecios.push(m2);
            }
          }
        });
      } catch(e) {}
    });

  } catch(err) {
    console.warn(`  [Argenprop venta] ${barrio.nombre}: ${err.message}`);
  }

  // Alquiler
  try {
    const urlAlq = `https://www.argenprop.com/departamento/alquiler/capital-federal/${barrio.apSlug}`;
    const { data } = await axios.get(urlAlq, {
      headers: HEADERS_BROWSER, timeout: 15000,
    });
    const $ = cheerio.load(data);

    $('[class*="listing-card"], [class*="property-card"], article').each((i, el) => {
      try {
        const texto = $(el).text();
        const precioMatch = texto.match(/\$\s*([\d.,]+)/);
        if (!precioMatch) return;
        const precio = parseFloat(precioMatch[1].replace(/\./g, '').replace(',', '.'));
        if (!precio || precio < 100000 || precio > 50000000) return;

        const supMatch = texto.match(/(\d+)\s*m[²2²]/i);
        if (!supMatch) return;
        const sup = parseFloat(supMatch[1]);
        if (!sup || sup < 20 || sup > 300) return;

        const m2mes = Math.round(precio / sup);
        if (m2mes > 3000 && m2mes < 500000) alqPrecios.push(m2mes);
      } catch(e) {}
    });
  } catch(err) {
    console.warn(`  [Argenprop alquiler] ${barrio.nombre}: ${err.message}`);
  }

  return { ventaPrecios, alqPrecios };
}

// ─────────────────────────────────────────────
// FUENTE 2: ZONAPROP
// Scraping del HTML. ZonaProp embebe los datos
// en un JSON dentro del HTML (window.__PRELOADED_STATE__)
// ─────────────────────────────────────────────
async function scrapeZonaprop(barrio) {
  if (!barrio.zpSlug) return { ventaPrecios: [], alqPrecios: [] };

  const ventaPrecios = [];

  try {
    const url = `https://www.zonaprop.com.ar/${barrio.zpSlug}.html`;
    const { data } = await axios.get(url, {
      headers: HEADERS_BROWSER, timeout: 15000,
    });

    // ZonaProp embebe los datos en el HTML como JSON
    const match = data.match(/__PRELOADED_STATE__\s*=\s*({.+?});\s*(?:window|<\/script>)/s) ||
                  data.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});\s*<\/script>/s);

    if (match) {
      try {
        const state = JSON.parse(match[1]);
        const listings = state?.listingsSearch?.listingData ||
                         state?.listings ||
                         state?.searchResult?.listings || [];

        listings.forEach(item => {
          try {
            const precio = item?.price?.amount || item?.priceOperations?.[0]?.prices?.[0]?.amount;
            const moneda = item?.price?.currency || item?.priceOperations?.[0]?.prices?.[0]?.currency;
            const sup    = item?.mainFeatures?.find(f => f.id === 'roofed_surface' || f.id === 'total_surface')?.value;

            if (!precio || moneda !== 'USD' || !sup) return;
            if (precio < 20000 || precio > 5000000) return;
            if (sup < 15 || sup > 800) return;

            const m2 = Math.round(precio / sup);
            if (m2 > 500 && m2 < 15000) ventaPrecios.push(m2);
          } catch(e) {}
        });
      } catch(e) {}
    }

    // Fallback: buscar precio/m² directamente en el HTML
    if (!ventaPrecios.length) {
      const $ = cheerio.load(data);
      $('[data-qa="POSTING_CARD_PRICE"], [class*="firstPrice"], [class*="price"]').each((i, el) => {
        try {
          const texto = $(el).text().trim();
          const m = texto.match(/USD?\s*([\d.,]+)/i);
          if (m) {
            const p = parseFloat(m[1].replace(/\./g, ''));
            if (p > 20000 && p < 5000000) {
              // Sin superficie, no podemos calcular m²
              // Pero podemos guardar el precio total para estimación
            }
          }
        } catch(e) {}
      });
    }

  } catch(err) {
    console.warn(`  [ZonaProp] ${barrio.nombre}: ${err.message}`);
  }

  return { ventaPrecios, alqPrecios: [] };
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
  if (!filtrados.length) return null;
  const mediana = filtrados[Math.floor(filtrados.length / 2)];
  const media   = Math.round(filtrados.reduce((a, b) => a + b, 0) / filtrados.length);
  const min     = Math.round(filtrados[Math.floor(filtrados.length * 0.10)]);
  const max     = Math.round(filtrados[Math.floor(filtrados.length * 0.90)]);
  return { mediana, media, min, max, muestras: filtrados.length };
}

// ─────────────────────────────────────────────
// SCRAPE PRINCIPAL
// ─────────────────────────────────────────────
async function scrapeAll() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  CotizAR — Actualizando precios (Argenprop + ZonaProp)');
  console.log(`  ${new Date().toLocaleString('es-AR')}`);
  console.log('═══════════════════════════════════════════════════\n');

  const resultados  = {};
  const timestamp   = new Date().toISOString();
  const cacheActual = await cargarDatos();

  let exitosos = 0;
  let fallbacks = 0;

  for (const barrio of BARRIOS) {
    console.log(`▶ ${barrio.nombre}`);

    // Fuente 1: Argenprop
    const { ventaPrecios: apVenta, alqPrecios: apAlq } = await scrapeArgenprop(barrio);

    // Fuente 2: ZonaProp (solo si Argenprop no dio suficientes datos)
    let zpVenta = [];
    if (apVenta.length < 5) {
      const zp = await scrapeZonaprop(barrio);
      zpVenta = zp.ventaPrecios;
    }

    // Combinar resultados de ambas fuentes
    const ventaTotal = [...apVenta, ...zpVenta];
    const ventaStats = calcularEstadisticas(ventaTotal);
    const alqStats   = calcularEstadisticas(apAlq);
    const previo     = cacheActual?.barrios?.[barrio.key] || {};

    if (ventaStats) {
      exitosos++;
      const fuentes = apVenta.length ? 'Argenprop' : 'ZonaProp';
      console.log(`  ✓ ${fuentes}: ${ventaStats.muestras} avisos · USD ${ventaStats.mediana}/m²`);
    } else {
      fallbacks++;
      console.log(`  ✗ Sin datos — cache: USD ${previo.m2_mediana || '—'}/m²`);
    }

    if (alqStats) {
      console.log(`  ✓ Alquiler: ${alqStats.muestras} avisos · $${alqStats.mediana.toLocaleString('es-AR')}/m²/mes`);
    }

    resultados[barrio.key] = {
      nombre:            barrio.nombre,
      m2_mediana:        ventaStats?.mediana  ?? previo.m2_mediana,
      m2_media:          ventaStats?.media    ?? previo.m2_media,
      m2_min:            ventaStats?.min      ?? previo.m2_min,
      m2_max:            ventaStats?.max      ?? previo.m2_max,
      muestras:          ventaStats?.muestras ?? 0,
      alq_m2_mes:        alqStats?.mediana    ?? previo.alq_m2_mes,
      alq_m2_mes_min:    alqStats?.min        ?? previo.alq_m2_mes_min,
      alq_m2_mes_max:    alqStats?.max        ?? previo.alq_m2_mes_max,
      muestras_alquiler: alqStats?.muestras   ?? 0,
      fuente:            ventaStats ? (apVenta.length ? 'argenprop' : 'zonaprop') : 'cache_previo',
      timestamp,
    };

    // Pausa entre barrios
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 500));
  }

  await guardarResultados(resultados);

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  ✅ ${exitosos} barrios actualizados`);
  console.log(`  ⚠️  ${fallbacks} usando cache previo`);
  console.log(`  📦 ${Object.keys(resultados).length} barrios en total`);
  console.log(`  🕐 ${new Date().toLocaleString('es-AR')}`);
  console.log('═══════════════════════════════════════════════════\n');

  return resultados;
}

module.exports = { scrapeAll, BARRIOS };

if (require.main === module) {
  scrapeAll().catch(console.error);
}
