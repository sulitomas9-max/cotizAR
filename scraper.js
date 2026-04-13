/**
 * scraper.js
 * Obtiene precios reales de departamentos CABA usando la API pública de MercadoLibre.
 *
 * ✅ Sin tokens ni autenticación
 * ✅ API oficial — no scraping de HTML
 * ✅ Datos en tiempo real
 * ✅ Corre automáticamente el día 1 de cada mes desde server.js
 *
 * Uso manual: node scraper.js
 */

const axios = require('axios');
const { guardarResultados, cargarDatos } = require('./db');

// ─────────────────────────────────────────────
// CATEGORÍAS MERCADOLIBRE
// MLA1472 = Departamentos (Argentina)
// Búsqueda por barrio usando el parámetro neighborhood
// ─────────────────────────────────────────────
const ML_BASE    = 'https://api.mercadolibre.com';
const ML_SITE    = 'MLA';
const ML_CAT_DEP = 'MLA1472'; // Departamentos
const ML_ESTADO  = 'TUxBUENBUGw3M2JR'; // Capital Federal (ID codificado en base64)

// ─────────────────────────────────────────────
// BARRIOS — 48 barrios oficiales CABA
// mlNombre: nombre exacto como aparece en MercadoLibre
// ─────────────────────────────────────────────
const BARRIOS = [
  // ── CORREDOR NORTE ──
  { key: 'puerto_madero',      nombre: 'Puerto Madero',     mlNombre: 'Puerto Madero'     },
  { key: 'palermo',            nombre: 'Palermo',           mlNombre: 'Palermo'           },
  { key: 'palermo_soho',       nombre: 'Palermo Soho',      mlNombre: 'Palermo Soho'      },
  { key: 'palermo_hollywood',  nombre: 'Palermo Hollywood', mlNombre: 'Palermo Hollywood' },
  { key: 'las_canitas',        nombre: 'Las Cañitas',       mlNombre: 'Las Cañitas'       },
  { key: 'belgrano',           nombre: 'Belgrano',          mlNombre: 'Belgrano'          },
  { key: 'nunez',              nombre: 'Núñez',             mlNombre: 'Núñez'             },
  { key: 'recoleta',           nombre: 'Recoleta',          mlNombre: 'Recoleta'          },
  { key: 'barrio_norte',       nombre: 'Barrio Norte',      mlNombre: 'Barrio Norte'      },
  { key: 'saavedra',           nombre: 'Saavedra',          mlNombre: 'Saavedra'          },
  // ── CORREDOR NOROESTE ──
  { key: 'colegiales',         nombre: 'Colegiales',        mlNombre: 'Colegiales'        },
  { key: 'chacarita',          nombre: 'Chacarita',         mlNombre: 'Chacarita'         },
  { key: 'villa_urquiza',      nombre: 'Villa Urquiza',     mlNombre: 'Villa Urquiza'     },
  { key: 'villa_del_parque',   nombre: 'Villa del Parque',  mlNombre: 'Villa del Parque'  },
  { key: 'villa_pueyrredon',   nombre: 'Villa Pueyrredón',  mlNombre: 'Villa Pueyrredón'  },
  { key: 'villa_devoto',       nombre: 'Villa Devoto',      mlNombre: 'Villa Devoto'      },
  { key: 'la_paternal',        nombre: 'La Paternal',       mlNombre: 'La Paternal'       },
  { key: 'agronomia',          nombre: 'Agronomía',         mlNombre: 'Agronomía'         },
  // ── MACROCENTRO ──
  { key: 'retiro',             nombre: 'Retiro',            mlNombre: 'Retiro'            },
  { key: 'san_nicolas',        nombre: 'San Nicolás',       mlNombre: 'San Nicolás'       },
  { key: 'monserrat',          nombre: 'Monserrat',         mlNombre: 'Monserrat'         },
  { key: 'san_telmo',          nombre: 'San Telmo',         mlNombre: 'San Telmo'         },
  { key: 'balvanera',          nombre: 'Balvanera',         mlNombre: 'Balvanera'         },
  { key: 'constitucion',       nombre: 'Constitución',      mlNombre: 'Constitución'      },
  { key: 'congreso',           nombre: 'Congreso',          mlNombre: 'Congreso'          },
  // ── CENTRO-OESTE ──
  { key: 'villa_crespo',       nombre: 'Villa Crespo',      mlNombre: 'Villa Crespo'      },
  { key: 'caballito',          nombre: 'Caballito',         mlNombre: 'Caballito'         },
  { key: 'almagro',            nombre: 'Almagro',           mlNombre: 'Almagro'           },
  { key: 'boedo',              nombre: 'Boedo',             mlNombre: 'Boedo'             },
  { key: 'parque_chacabuco',   nombre: 'Parque Chacabuco',  mlNombre: 'Parque Chacabuco'  },
  { key: 'parque_patricios',   nombre: 'Parque Patricios',  mlNombre: 'Parque Patricios'  },
  // ── OESTE ──
  { key: 'flores',             nombre: 'Flores',            mlNombre: 'Flores'            },
  { key: 'floresta',           nombre: 'Floresta',          mlNombre: 'Floresta'          },
  { key: 'monte_castro',       nombre: 'Monte Castro',      mlNombre: 'Monte Castro'      },
  { key: 'velez_sarsfield',    nombre: 'Vélez Sársfield',   mlNombre: 'Vélez Sársfield'   },
  { key: 'villa_real',         nombre: 'Villa Real',        mlNombre: 'Villa Real'        },
  { key: 'versalles',          nombre: 'Versalles',         mlNombre: 'Versalles'         },
  { key: 'villa_santa_rita',   nombre: 'Villa Santa Rita',  mlNombre: 'Villa Santa Rita'  },
  { key: 'liniers',            nombre: 'Liniers',           mlNombre: 'Liniers'           },
  { key: 'mataderos',          nombre: 'Mataderos',         mlNombre: 'Mataderos'         },
  { key: 'villa_luro',         nombre: 'Villa Luro',        mlNombre: 'Villa Luro'        },
  { key: 'villa_general_mitre',nombre: 'Villa Gral. Mitre', mlNombre: 'Villa General Mitre'},
  // ── SUR ──
  { key: 'barracas',           nombre: 'Barracas',          mlNombre: 'Barracas'          },
  { key: 'la_boca',            nombre: 'La Boca',           mlNombre: 'La Boca'          },
  { key: 'nueva_pompeya',      nombre: 'Nueva Pompeya',     mlNombre: 'Nueva Pompeya'     },
  { key: 'villa_soldati',      nombre: 'Villa Soldati',     mlNombre: 'Villa Soldati'     },
  { key: 'villa_riachuelo',    nombre: 'Villa Riachuelo',   mlNombre: 'Villa Riachuelo'   },
  { key: 'villa_lugano',       nombre: 'Villa Lugano',      mlNombre: 'Villa Lugano'      },
];

const HEADERS = {
  'User-Agent': 'CotizAR/1.0 (cotizador inmobiliario CABA)',
  'Accept': 'application/json',
};

// ─────────────────────────────────────────────
// BUSCAR EN MERCADOLIBRE — VENTA
// Usa la API pública sin token
// Devuelve array de precios/m²
// ─────────────────────────────────────────────
async function buscarVentaML(barrio) {
  const precios = [];
  let offset = 0;
  const limite = 50; // ML permite hasta 50 por request
  const maxItems = 200; // analizar hasta 200 avisos por barrio

  try {
    while (offset < maxItems) {
      const url = `${ML_BASE}/sites/${ML_SITE}/search` +
        `?category=${ML_CAT_DEP}` +
        `&state=${ML_ESTADO}` +
        `&q=${encodeURIComponent(barrio.mlNombre)}` +
        `&OPERATION=242073` + // Venta
        `&limit=${limite}&offset=${offset}`;

      const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      const items = data?.results || [];
      if (!items.length) break;

      items.forEach(item => {
        try {
          const precio = item.price;
          const moneda = item.currency_id;
          // Solo USD (inmuebles en CABA se publican en USD)
          if (!precio || moneda !== 'USD') return;

          // Buscar superficie en atributos
          const attrs = item.attributes || [];
          const supAttr = attrs.find(a =>
            a.id === 'TOTAL_AREA' || a.id === 'COVERED_AREA' ||
            a.name?.toLowerCase().includes('superficie') ||
            a.name?.toLowerCase().includes('m2') ||
            a.name?.toLowerCase().includes('metros')
          );

          let sup = supAttr ? parseFloat(supAttr.value_name) : null;

          // Fallback: extraer m² del título
          if (!sup) {
            const m = (item.title || '').match(/(\d+)\s*m[²2]/i);
            if (m) sup = parseFloat(m[1]);
          }

          if (!sup || sup < 15 || sup > 800) return;
          if (precio < 20000 || precio > 5000000) return;

          const m2 = Math.round(precio / sup);
          if (m2 > 500 && m2 < 15000) precios.push(m2);
        } catch(e) {}
      });

      // Si vinieron menos items que el límite, no hay más páginas
      if (items.length < limite) break;
      offset += limite;

      // Pausa entre páginas
      await new Promise(r => setTimeout(r, 300));
    }
  } catch(err) {
    console.warn(`  [ML venta] ${barrio.nombre}: ${err.message}`);
  }

  return precios;
}

// ─────────────────────────────────────────────
// BUSCAR EN MERCADOLIBRE — ALQUILER
// ─────────────────────────────────────────────
async function buscarAlquilerML(barrio) {
  const precios = [];

  try {
    const url = `${ML_BASE}/sites/${ML_SITE}/search` +
      `?category=${ML_CAT_DEP}` +
      `&state=${ML_ESTADO}` +
      `&q=${encodeURIComponent(barrio.mlNombre)}` +
      `&OPERATION=242074` + // Alquiler
      `&limit=50&offset=0`;

    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const items = data?.results || [];

    items.forEach(item => {
      try {
        const precio = item.price;
        const moneda = item.currency_id;
        // Alquileres en ARS
        if (!precio || moneda !== 'ARS') return;
        if (precio < 100000 || precio > 50000000) return;

        const attrs = item.attributes || [];
        const supAttr = attrs.find(a =>
          a.id === 'TOTAL_AREA' || a.id === 'COVERED_AREA' ||
          a.name?.toLowerCase().includes('superficie')
        );

        let sup = supAttr ? parseFloat(supAttr.value_name) : null;
        if (!sup) {
          const m = (item.title || '').match(/(\d+)\s*m[²2]/i);
          if (m) sup = parseFloat(m[1]);
        }

        if (!sup || sup < 20 || sup > 300) return;

        const m2mes = Math.round(precio / sup);
        if (m2mes > 3000 && m2mes < 500000) precios.push(m2mes);
      } catch(e) {}
    });
  } catch(err) {
    console.warn(`  [ML alquiler] ${barrio.nombre}: ${err.message}`);
  }

  return precios;
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
  console.log('  CotizAR — Actualizando precios desde MercadoLibre');
  console.log(`  ${new Date().toLocaleString('es-AR')}`);
  console.log('═══════════════════════════════════════════════════\n');

  const resultados  = {};
  const timestamp   = new Date().toISOString();
  const cacheActual = await cargarDatos();

  let exitosos = 0;
  let fallbacks = 0;

  for (const barrio of BARRIOS) {
    console.log(`▶ ${barrio.nombre}`);

    const [ventaPrecios, alqPrecios] = await Promise.all([
      buscarVentaML(barrio),
      buscarAlquilerML(barrio),
    ]);

    const ventaStats = calcularEstadisticas(ventaPrecios);
    const alqStats   = calcularEstadisticas(alqPrecios);
    const previo     = cacheActual?.barrios?.[barrio.key] || {};

    if (ventaStats) {
      exitosos++;
      console.log(`  ✓ Venta: ${ventaStats.muestras} avisos · USD ${ventaStats.mediana}/m²`);
    } else {
      fallbacks++;
      console.log(`  ✗ Venta: pocos datos — usando cache previo (${previo.m2_mediana || '—'} USD/m²)`);
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
      fuente:            ventaStats ? 'mercadolibre_api' : 'cache_previo',
      timestamp,
    };

    // Pausa entre barrios para no saturar la API
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
  }

  await guardarResultados(resultados);

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  ✅ ${exitosos} barrios con datos frescos de MercadoLibre`);
  console.log(`  ⚠️  ${fallbacks} barrios usando cache previo`);
  console.log(`  📦 ${Object.keys(resultados).length} barrios guardados en total`);
  console.log(`  🕐 ${new Date().toLocaleString('es-AR')}`);
  console.log('═══════════════════════════════════════════════════\n');

  return resultados;
}

module.exports = { scrapeAll, BARRIOS };

if (require.main === module) {
  scrapeAll().catch(console.error);
}
