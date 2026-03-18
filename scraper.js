/**
 * scraper.js
 * Usa la API JSON interna de ZonaProp para obtener precios reales.
 * No requiere browser ni Puppeteer.
 */

const axios = require('axios');
const { guardarResultados, cargarDatos } = require('./db');

const BARRIOS = [
  { key: 'puerto_madero',    nombre: 'Puerto Madero',    zpId: 37  },
  { key: 'palermo',          nombre: 'Palermo',          zpId: 24  },
  { key: 'belgrano',         nombre: 'Belgrano',         zpId: 14  },
  { key: 'nuñez',            nombre: 'Núñez',            zpId: 22  },
  { key: 'recoleta',         nombre: 'Recoleta',         zpId: 26  },
  { key: 'barrio_norte',     nombre: 'Barrio Norte',     zpId: 13  },
  { key: 'colegiales',       nombre: 'Colegiales',       zpId: 16  },
  { key: 'chacarita',        nombre: 'Chacarita',        zpId: 15  },
  { key: 'villa_urquiza',    nombre: 'Villa Urquiza',    zpId: 35  },
  { key: 'villa_del_parque', nombre: 'Villa del Parque', zpId: 33  },
  { key: 'retiro',           nombre: 'Retiro',           zpId: 27  },
  { key: 'san_nicolas',      nombre: 'San Nicolás',      zpId: 29  },
  { key: 'monserrat',        nombre: 'Monserrat',        zpId: 20  },
  { key: 'san_telmo',        nombre: 'San Telmo',        zpId: 30  },
  { key: 'balvanera',        nombre: 'Balvanera',        zpId: 12  },
  { key: 'villa_crespo',     nombre: 'Villa Crespo',     zpId: 32  },
  { key: 'caballito',        nombre: 'Caballito',        zpId: 15  },
  { key: 'almagro',          nombre: 'Almagro',          zpId: 11  },
  { key: 'flores',           nombre: 'Flores',           zpId: 18  },
  { key: 'liniers',          nombre: 'Liniers',          zpId: 19  },
  { key: 'mataderos',        nombre: 'Mataderos',        zpId: 46  },
  { key: 'boedo',            nombre: 'Boedo',            zpId: 44  },
  { key: 'barracas',         nombre: 'Barracas',         zpId: 43  },
  { key: 'nueva_pompeya',    nombre: 'Nueva Pompeya',    zpId: 47  },
  { key: 'la_boca',          nombre: 'La Boca',          zpId: 45  },
  { key: 'lugano',           nombre: 'Lugano',           zpId: 48  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9',
  'Referer': 'https://www.zonaprop.com.ar/',
  'Origin': 'https://www.zonaprop.com.ar',
};

// ─────────────────────────────────────────────
// ZONAPROP API JSON — VENTA
// ─────────────────────────────────────────────
async function scrapeVenta(barrio) {
  // ZonaProp API interna: buscar departamentos en venta por barrio
  const url = `https://www.zonaprop.com.ar/api/nue-listings/listings?operacion=venta&tipo=departamento&provincia=2&barrios=${barrio.zpId}&pagina=1&orden=precio-asc`;
  console.log(`  [API venta] ${barrio.nombre}`);
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    const listings = data?.postings || data?.listingResults || data?.results || [];
    const results = [];
    listings.forEach(item => {
      try {
        const precio = item.price?.value || item.priceValue;
        const superficie = item.surface?.total || item.totalSurface || item.coveredSurface;
        if (!precio || !superficie) return;
        if (precio > 10000 && superficie > 15 && superficie < 1000) {
          results.push({ precioM2: Math.round(precio / superficie) });
        }
      } catch (e) {}
    });
    console.log(`  [API venta] ${barrio.nombre}: ${results.length} resultados`);
    return results;
  } catch (err) {
    console.warn(`  [API venta] ${barrio.nombre} Error: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// ZONAPROP API JSON — ALQUILER
// ─────────────────────────────────────────────
async function scrapeAlquiler(barrio) {
  const url = `https://www.zonaprop.com.ar/api/nue-listings/listings?operacion=alquiler&tipo=departamento&provincia=2&barrios=${barrio.zpId}&pagina=1&orden=precio-asc`;
  console.log(`  [API alquiler] ${barrio.nombre}`);
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    const listings = data?.postings || data?.listingResults || data?.results || [];
    const results = [];
    listings.forEach(item => {
      try {
        const precio = item.price?.value || item.priceValue;
        const superficie = item.surface?.total || item.totalSurface || item.coveredSurface;
        if (!precio || !superficie) return;
        if (precio > 50000 && superficie > 20 && superficie < 300) {
          results.push({ precioM2Mes: Math.round(precio / superficie) });
        }
      } catch (e) {}
    });
    console.log(`  [API alquiler] ${barrio.nombre}: ${results.length} resultados`);
    return results;
  } catch (err) {
    console.warn(`  [API alquiler] ${barrio.nombre} Error: ${err.message}`);
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
  const media   = Math.round(filtrados.reduce((a, b) => a + b, 0) / filtrados.length);
  const min     = Math.round(filtrados[Math.floor(filtrados.length * 0.1)]);
  const max     = Math.round(filtrados[Math.floor(filtrados.length * 0.9)]);
  return { mediana, media, min, max, muestras: filtrados.length };
}

// ─────────────────────────────────────────────
// SCRAPE PRINCIPAL
// ─────────────────────────────────────────────
async function scrapeAll() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Scraping VENTA + ALQUILER CABA (API JSON)');
  console.log(`  ${new Date().toLocaleString('es-AR')}`);
  console.log('═══════════════════════════════════════════\n');

  const resultados = {};
  const timestamp  = new Date().toISOString();
  const cacheActual = await cargarDatos();

  for (const barrio of BARRIOS) {
    console.log(`\n▶ ${barrio.nombre}`);

    const [ventaRes, alqRes] = await Promise.allSettled([
      scrapeVenta(barrio),
      scrapeAlquiler(barrio),
    ]);

    const ventaVals = ventaRes.status === 'fulfilled' ? ventaRes.value.map(l => l.precioM2)    : [];
    const alqVals   = alqRes.status   === 'fulfilled' ? alqRes.value.map(l => l.precioM2Mes)   : [];

    const ventaStats = calcularEstadisticas(ventaVals);
    const alqStats   = calcularEstadisticas(alqVals);
    const previo     = cacheActual?.barrios?.[barrio.key] || {};

    if (ventaStats) console.log(`  ✓ Venta: ${ventaStats.muestras} muestras · USD ${ventaStats.mediana}/m²`);
    else            console.log(`  ✗ Venta: sin datos suficientes`);
    if (alqStats)   console.log(`  ✓ Alquiler: ${alqStats.muestras} muestras · $${alqStats.mediana}/m²/mes`);
    else            console.log(`  ✗ Alquiler: sin datos suficientes`);

    resultados[barrio.key] = {
      nombre:            barrio.nombre,
      m2_mediana:        ventaStats?.mediana  ?? previo.m2_mediana,
      m2_media:          ventaStats?.media    ?? previo.m2_media,
      m2_min:            ventaStats?.min      ?? previo.m2_min,
      m2_max:            ventaStats?.max      ?? previo.m2_max,
      muestras_venta:    ventaStats?.muestras ?? 0,
      alq_m2_mes:        alqStats?.mediana    ?? previo.alq_m2_mes,
      alq_m2_mes_min:    alqStats?.min        ?? previo.alq_m2_mes_min,
      alq_m2_mes_max:    alqStats?.max        ?? previo.alq_m2_mes_max,
      muestras_alquiler: alqStats?.muestras   ?? 0,
      timestamp,
    };

    // Pausa breve entre barrios
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
  }

  await guardarResultados(resultados);
  console.log(`\n✅ ${Object.keys(resultados).length}/${BARRIOS.length} barrios procesados\n`);
  return resultados;
}

module.exports = { scrapeAll };

if (require.main === module) {
  scrapeAll().catch(console.error);
}
