/**
 * db.js
 * Usa cache.json como almacenamiento. No requiere PostgreSQL.
 */
 
const fs = require('fs');
const path = require('path');
 
const CACHE_PATH = path.join(__dirname, 'cache.json');
const LOGS_PATH  = path.join(__dirname, 'cotizaciones.json');
 
async function initDB() {
  console.log('[DB] Usando cache.json como almacenamiento');
}
 
async function guardarResultados(resultados) {
  const timestamp = new Date().toISOString();
  const output = {
    ultima_actualizacion: timestamp,
    total_barrios: Object.keys(resultados).length,
    barrios: resultados,
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(output, null, 2));
  console.log('[DB] Guardado en cache.json');
}
 
async function cargarDatos() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch (e) {}
  return null;
}
 
async function getStatus() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const c = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      return { existe: true, ultima_actualizacion: c.ultima_actualizacion, total_barrios: c.total_barrios, storage: 'archivo' };
    }
  } catch (e) {}
  return { existe: false, storage: 'archivo' };
}
 
async function guardarCotizacion(datos) {
  try {
    let logs = [];
    if (fs.existsSync(LOGS_PATH)) {
      logs = JSON.parse(fs.readFileSync(LOGS_PATH, 'utf8'));
    }
    logs.push({ ...datos, timestamp: new Date().toISOString() });
    fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error('[DB] Error guardando cotización:', e.message);
  }
}
 
async function obtenerCotizaciones() {
  try {
    if (fs.existsSync(LOGS_PATH)) {
      return JSON.parse(fs.readFileSync(LOGS_PATH, 'utf8'));
    }
  } catch (e) {}
  return [];
}
 
module.exports = { initDB, guardarResultados, cargarDatos, getStatus, guardarCotizacion, obtenerCotizaciones };
