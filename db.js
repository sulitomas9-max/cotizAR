/**
 * db.js
 * Maneja la conexión y operaciones con PostgreSQL.
 * Si DATABASE_URL no está definida, cae a cache.json como fallback.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'cache.json');
const USE_DB = !!process.env.DATABASE_URL;

let pool = null;

if (USE_DB) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // necesario en Railway
  });
  console.log('[DB] Conectando a PostgreSQL...');
} else {
  console.log('[DB] Sin DATABASE_URL — usando cache.json como almacenamiento');
}

// ─────────────────────────────────────────────
// INICIALIZAR TABLA (se llama al arrancar)
// ─────────────────────────────────────────────
async function initDB() {
  if (!USE_DB) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS precios_barrios (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        nombre TEXT,
        data JSONB NOT NULL,
        actualizado_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_precios_key ON precios_barrios(key);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS scraping_meta (
        id INTEGER PRIMARY KEY DEFAULT 1,
        ultima_actualizacion TIMESTAMPTZ,
        total_barrios INTEGER
      );
      INSERT INTO scraping_meta (id, ultima_actualizacion, total_barrios)
      VALUES (1, NULL, 0)
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('[DB] Tablas listas');
  } catch (err) {
    console.error('[DB] Error al inicializar tablas:', err.message);
  }
}

// ─────────────────────────────────────────────
// GUARDAR RESULTADOS DEL SCRAPING
// ─────────────────────────────────────────────
async function guardarResultados(resultados) {
  const timestamp = new Date().toISOString();

  if (!USE_DB) {
    // Fallback: guardar en cache.json
    const output = {
      ultima_actualizacion: timestamp,
      total_barrios: Object.keys(resultados).length,
      barrios: resultados,
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(output, null, 2));
    console.log('[DB] Guardado en cache.json');
    return;
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const [key, data] of Object.entries(resultados)) {
        await client.query(`
          INSERT INTO precios_barrios (key, nombre, data, actualizado_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (key) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            data = EXCLUDED.data,
            actualizado_at = NOW()
        `, [key, data.nombre, JSON.stringify(data)]);
      }

      await client.query(`
        UPDATE scraping_meta SET
          ultima_actualizacion = NOW(),
          total_barrios = $1
        WHERE id = 1
      `, [Object.keys(resultados).length]);

      await client.query('COMMIT');
      console.log(`[DB] ${Object.keys(resultados).length} barrios guardados en PostgreSQL`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] Error al guardar:', err.message);
    // Si falla la DB, guardar en archivo como backup
    const output = { ultima_actualizacion: timestamp, total_barrios: Object.keys(resultados).length, barrios: resultados };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(output, null, 2));
  }
}

// ─────────────────────────────────────────────
// CARGAR DATOS (para el cotizador)
// ─────────────────────────────────────────────
async function cargarDatos() {
  if (!USE_DB) {
    // Fallback: leer de cache.json
    try {
      if (fs.existsSync(CACHE_PATH)) {
        return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      }
    } catch (e) {}
    return null;
  }

  try {
    const [barrios, meta] = await Promise.all([
      pool.query('SELECT key, data FROM precios_barrios'),
      pool.query('SELECT * FROM scraping_meta WHERE id = 1'),
    ]);

    if (barrios.rows.length === 0) return null;

    const barriosObj = {};
    barrios.rows.forEach(row => {
      barriosObj[row.key] = row.data;
    });

    return {
      ultima_actualizacion: meta.rows[0]?.ultima_actualizacion || null,
      total_barrios: barrios.rows.length,
      barrios: barriosObj,
    };
  } catch (err) {
    console.error('[DB] Error al cargar datos:', err.message);
    // Intentar fallback a cache.json
    try {
      if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch (e) {}
    return null;
  }
}

// ─────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────
async function getStatus() {
  if (!USE_DB) {
    try {
      if (fs.existsSync(CACHE_PATH)) {
        const c = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        return { existe: true, ultima_actualizacion: c.ultima_actualizacion, total_barrios: c.total_barrios, storage: 'archivo' };
      }
    } catch (e) {}
    return { existe: false, storage: 'archivo' };
  }

  try {
    const meta = await pool.query('SELECT * FROM scraping_meta WHERE id = 1');
    const count = await pool.query('SELECT COUNT(*) FROM precios_barrios');
    const total = parseInt(count.rows[0].count);
    return {
      existe: total > 0,
      ultima_actualizacion: meta.rows[0]?.ultima_actualizacion || null,
      total_barrios: total,
      storage: 'postgresql',
    };
  } catch (err) {
    return { existe: false, storage: 'postgresql', error: err.message };
  }
}

module.exports = { initDB, guardarResultados, cargarDatos, getStatus, USE_DB };
