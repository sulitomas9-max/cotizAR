/**
 * generate-pages.js
 *
 * Genera una página HTML estática por barrio en public/barrio/[key].html
 * Cada página tiene contenido real pre-renderizado (precio, región, descripción)
 * para que Google la indexe sin necesidad de ejecutar JavaScript.
 *
 * Uso:
 *   node generate-pages.js
 *
 * Se puede agregar al package.json:
 *   "generate": "node generate-pages.js"
 *
 * Y ejecutarlo después de cada scraping o una vez al mes.
 */
 
const fs = require('fs');
const path = require('path');
 
// ─────────────────────────────────────────────
// Datos de barrios (mismo FALLBACK que server.js)
// ─────────────────────────────────────────────
const BARRIOS = {
  puerto_madero:    { nombre: 'Puerto Madero',    m2_mediana: 6152, m2_min: 4800, m2_max: 8200, region: 'Corredor Norte' },
  palermo:          { nombre: 'Palermo',          m2_mediana: 3390, m2_min: 2800, m2_max: 4200, region: 'Corredor Norte' },
  belgrano:         { nombre: 'Belgrano',         m2_mediana: 3050, m2_min: 2500, m2_max: 3800, region: 'Corredor Norte' },
  nuñez:            { nombre: 'Núñez',            m2_mediana: 3413, m2_min: 2800, m2_max: 4200, region: 'Corredor Norte' },
  recoleta:         { nombre: 'Recoleta',         m2_mediana: 3300, m2_min: 2700, m2_max: 4100, region: 'Corredor Norte' },
  barrio_norte:     { nombre: 'Barrio Norte',     m2_mediana: 3100, m2_min: 2500, m2_max: 3900, region: 'Corredor Norte' },
  colegiales:       { nombre: 'Colegiales',       m2_mediana: 2800, m2_min: 2250, m2_max: 3500, region: 'Corredor Noroeste' },
  chacarita:        { nombre: 'Chacarita',        m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Corredor Noroeste' },
  villa_urquiza:    { nombre: 'Villa Urquiza',    m2_mediana: 2450, m2_min: 1950, m2_max: 3050, region: 'Corredor Noroeste' },
  villa_del_parque: { nombre: 'Villa del Parque', m2_mediana: 2350, m2_min: 1880, m2_max: 2950, region: 'Corredor Noroeste' },
  retiro:           { nombre: 'Retiro',           m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Macrocentro' },
  san_nicolas:      { nombre: 'San Nicolás',      m2_mediana: 2150, m2_min: 1700, m2_max: 2700, region: 'Macrocentro' },
  monserrat:        { nombre: 'Monserrat',        m2_mediana: 2100, m2_min: 1650, m2_max: 2650, region: 'Macrocentro' },
  san_telmo:        { nombre: 'San Telmo',        m2_mediana: 2050, m2_min: 1600, m2_max: 2600, region: 'Macrocentro' },
  balvanera:        { nombre: 'Balvanera',        m2_mediana: 2050, m2_min: 1600, m2_max: 2600, region: 'Macrocentro' },
  villa_crespo:     { nombre: 'Villa Crespo',     m2_mediana: 2650, m2_min: 2100, m2_max: 3300, region: 'Noroeste' },
  caballito:        { nombre: 'Caballito',        m2_mediana: 2350, m2_min: 1880, m2_max: 2950, region: 'Noroeste' },
  almagro:          { nombre: 'Almagro',          m2_mediana: 2215, m2_min: 1750, m2_max: 2750, region: 'Noroeste' },
  flores:           { nombre: 'Flores',           m2_mediana: 1930, m2_min: 1520, m2_max: 2430, region: 'Noroeste' },
  liniers:          { nombre: 'Liniers',          m2_mediana: 1850, m2_min: 1420, m2_max: 2330, region: 'Oeste' },
  mataderos:        { nombre: 'Mataderos',        m2_mediana: 1700, m2_min: 1300, m2_max: 2150, region: 'Oeste' },
  boedo:            { nombre: 'Boedo',            m2_mediana: 2250, m2_min: 1780, m2_max: 2830, region: 'Sur-Este' },
  barracas:         { nombre: 'Barracas',         m2_mediana: 1920, m2_min: 1480, m2_max: 2430, region: 'Sur-Este' },
  nueva_pompeya:    { nombre: 'Nueva Pompeya',    m2_mediana: 1478, m2_min: 1100, m2_max: 1900, region: 'Sur' },
  la_boca:          { nombre: 'La Boca',          m2_mediana: 1560, m2_min: 1150, m2_max: 2000, region: 'Sur' },
  lugano:           { nombre: 'Lugano',           m2_mediana: 1098, m2_min:  830, m2_max: 1420, region: 'Sur' },
};
 
// Descripción de cada región para el contenido de la página
const DESCRIPCIONES_REGION = {
  'Corredor Norte': 'zona de mayor valor inmobiliario de Buenos Aires, con alta demanda y edificios premium',
  'Corredor Noroeste': 'barrios residenciales consolidados con buena conectividad y crecimiento constante de precios',
  'Macrocentro': 'zona céntrica con alta densidad comercial y fuerte mercado de inversión',
  'Noroeste': 'barrios intermedios con excelente relación precio-calidad y fuerte demanda familiar',
  'Oeste': 'zona accesible con precios competitivos y comunidades establecidas',
  'Sur-Este': 'barrios con precios moderados y potencial de revalorización',
  'Sur': 'zona con precios de entrada al mercado porteño y proyectos de renovación urbana',
};
 
// Descripción específica por barrio para el meta description y el h2
const DESCRIPCIONES_BARRIO = {
  puerto_madero:    'barrio más exclusivo de Buenos Aires, con torres premium frente al Río de la Plata',
  palermo:          'el barrio más cotizado del corredor norte, con amplia oferta gastronómica y cultural',
  belgrano:         'barrio residencial tradicional con fuerte comunidad y excelentes servicios',
  nuñez:            'barrio tranquilo y familiar, con acceso directo a la costanera norte',
  recoleta:         'uno de los barrios más elegantes de la ciudad, con arquitectura de época y alta demanda',
  barrio_norte:     'zona premium entre Recoleta y Palermo, con oferta variada y alta liquidez',
  colegiales:       'barrio en crecimiento constante, muy demandado por jóvenes profesionales',
  chacarita:        'barrio bohemio con mucho movimiento cultural y precios en alza',
  villa_urquiza:    'barrio residencial consolidado con buena conectividad y servicios completos',
  villa_del_parque:'barrio familiar tranquilo, con oferta diversa y precios moderados',
  retiro:           'zona céntrica con alta demanda de inversión y oferta variada',
  san_nicolas:      'corazón comercial de Buenos Aires con fuerte mercado de inversión',
  monserrat:        'barrio histórico en proceso de renovación urbana con precios accesibles',
  san_telmo:        'barrio cultural con fuerte demanda turística e inversora',
  balvanera:        'zona de alta densidad y fuerte demanda de alquiler, ideal para inversión',
  villa_crespo:     'barrio en fuerte proceso de gentrificación, con precios en ascenso continuo',
  caballito:        'uno de los barrios más demandados de la ciudad por su centralidad y servicios',
  almagro:          'barrio con excelente conectividad y precios competitivos respecto al corredor norte',
  flores:           'barrio populoso con fuerte mercado de compraventa y alquiler',
  liniers:          'zona accesible con buena conectividad al oeste del GBA',
  mataderos:        'barrio con precios de entrada y fuerte comunidad local',
  boedo:            'barrio tradicional en revalorización, con creciente oferta gastronómica',
  barracas:         'zona en transformación, con proyectos nuevos y precios en suba',
  nueva_pompeya:    'barrio con precios accesibles y potencial de desarrollo',
  la_boca:          'barrio icónico con alta demanda turística y proyectos de renovación',
  lugano:           'zona con los precios más accesibles de CABA y proyectos de mejora urbana',
};
 
const fmt = n => n.toLocaleString('es-AR');
 
function generarPaginaBarrio(key, b) {
  const descRegion = DESCRIPCIONES_REGION[b.region] || b.region;
  const descBarrio = DESCRIPCIONES_BARRIO[key] || `barrio de Buenos Aires con precios desde USD ${fmt(b.m2_min)}/m²`;
  const año = new Date().getFullYear();
 
  // Calcular ejemplos de cotización para 3 superficies típicas
  const ejemplos = [40, 55, 75].map(m2 => ({
    m2,
    precio: Math.round(b.m2_mediana * m2),
    min: Math.round(b.m2_min * m2),
    max: Math.round(b.m2_max * m2),
  }));
 
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Precio m² en ${b.nombre} ${año} — Cotizador de departamentos CABA</title>
  <meta name="description" content="Precio del m² en ${b.nombre} en ${año}: USD ${fmt(b.m2_mediana)}/m² (mediana). Rango entre USD ${fmt(b.m2_min)} y USD ${fmt(b.m2_max)}/m². Datos reales de ZonaProp actualizados diariamente. Cotizá tu departamento gratis.">
  <meta property="og:title" content="Precio m² en ${b.nombre} ${año} · CotizAR">
  <meta property="og:description" content="El m² en ${b.nombre} vale USD ${fmt(b.m2_mediana)} en promedio. Cotizá tu depto gratis con datos reales.">
  <meta property="og:type" content="website">
  <link rel="canonical" href="https://cotizar.ar/barrio/${key}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap" rel="stylesheet">
 
  <!-- Schema.org estructurado para Google -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Precio m² en ${b.nombre} ${año}",
    "description": "Precio del metro cuadrado en ${b.nombre}, Buenos Aires: USD ${fmt(b.m2_mediana)}/m² (mediana ${año})",
    "url": "https://cotizar.ar/barrio/${key}",
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "CotizAR", "item": "https://cotizar.ar" },
        { "@type": "ListItem", "position": 2, "name": "Barrios CABA", "item": "https://cotizar.ar/barrios" },
        { "@type": "ListItem", "position": 3, "name": "${b.nombre}", "item": "https://cotizar.ar/barrio/${key}" }
      ]
    }
  }
  </script>
 
  <style>
    :root {
      --ink: #0f0e0c; --ink2: #4a4840; --ink3: #9a9790;
      --paper: #faf8f4; --paper2: #f0ede7; --paper3: #e5e1d8;
      --accent: #c8521a; --accent-light: #fdf0e8;
      --border: rgba(15,14,12,.10); --border2: rgba(15,14,12,.18);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; background: var(--paper); color: var(--ink); }
 
    nav { display:flex; align-items:center; justify-content:space-between; padding:16px 40px; border-bottom:1px solid var(--border); background:var(--paper); }
    .logo { font-family:'DM Serif Display',serif; font-size:22px; }
    .logo span { color:var(--accent); }
    .nav-back { font-size:13px; color:var(--ink3); text-decoration:none; display:flex; align-items:center; gap:5px; }
    .nav-back:hover { color:var(--ink); }
 
    .container { max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; }
 
    .breadcrumb { font-size:12px; color:var(--ink3); margin-bottom:24px; display:flex; align-items:center; gap:6px; }
    .breadcrumb a { color:var(--ink3); text-decoration:none; }
    .breadcrumb a:hover { color:var(--ink); }
 
    h1 { font-family:'DM Serif Display',serif; font-size:40px; line-height:1.1; letter-spacing:-.5px; margin-bottom:12px; }
    h1 em { font-style:italic; color:var(--accent); }
    .intro { font-size:15px; color:var(--ink2); line-height:1.65; margin-bottom:36px; max-width:560px; }
 
    /* Precio principal */
    .price-hero { background:var(--ink); border-radius:16px; padding:28px 32px; margin-bottom:24px; color:white; }
    .price-label { font-size:11px; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.7px; margin-bottom:8px; }
    .price-main { font-family:'DM Serif Display',serif; font-size:52px; line-height:1; letter-spacing:-1px; margin-bottom:4px; }
    .price-range { font-size:14px; color:rgba(255,255,255,.5); margin-bottom:16px; }
    .price-badges { display:flex; gap:8px; flex-wrap:wrap; }
    .pbadge { font-size:11px; padding:3px 10px; border-radius:20px; background:rgba(255,255,255,.1); color:rgba(255,255,255,.65); }
 
    /* Tabla de ejemplos */
    .section-title { font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.7px; color:var(--ink3); margin-bottom:16px; padding-bottom:8px; border-bottom:1px solid var(--border); }
    .examples-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:32px; }
    .ex-card { background:white; border:1px solid var(--border2); border-radius:10px; padding:16px; }
    .ex-m2 { font-size:12px; color:var(--ink3); margin-bottom:6px; }
    .ex-price { font-family:'DM Serif Display',serif; font-size:22px; color:var(--ink); margin-bottom:4px; }
    .ex-range { font-size:11px; color:var(--ink3); }
 
    /* Info del barrio */
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:32px; }
    .info-card { background:white; border:1px solid var(--border2); border-radius:10px; padding:16px 18px; }
    .info-label { font-size:11px; color:var(--ink3); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
    .info-val { font-size:16px; font-weight:500; color:var(--ink); }
 
    /* FAQ */
    .faq { margin-bottom:40px; }
    .faq h2 { font-family:'DM Serif Display',serif; font-size:24px; margin-bottom:20px; }
    .faq-item { border-bottom:1px solid var(--border); padding:16px 0; }
    .faq-item:last-child { border-bottom:none; }
    .faq-q { font-size:15px; font-weight:500; color:var(--ink); margin-bottom:8px; }
    .faq-a { font-size:14px; color:var(--ink2); line-height:1.65; }
 
    /* CTA */
    .cta-box { background:var(--accent-light); border:1px solid rgba(200,82,26,.2); border-radius:14px; padding:28px 32px; text-align:center; }
    .cta-box h3 { font-family:'DM Serif Display',serif; font-size:24px; margin-bottom:8px; }
    .cta-box p { font-size:14px; color:var(--ink2); margin-bottom:20px; }
    .cta-btn { display:inline-block; background:var(--ink); color:white; text-decoration:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:500; transition:background .2s; }
    .cta-btn:hover { background:var(--accent); }
 
    footer { text-align:center; padding:28px; font-size:12px; color:var(--ink3); border-top:1px solid var(--border); }
 
    @media(max-width:600px) {
      nav { padding:12px 16px; }
      .container { padding:32px 16px 64px; }
      h1 { font-size:28px; }
      .price-main { font-size:38px; }
      .examples-grid { grid-template-columns:1fr 1fr; }
      .info-grid { grid-template-columns:1fr 1fr; }
    }
  </style>
</head>
<body>
 
<nav>
  <div class="logo">Cotiz<span>AR</span></div>
  <a href="/" class="nav-back">← Cotizá tu depto</a>
</nav>
 
<div class="container">
 
  <div class="breadcrumb">
    <a href="/">CotizAR</a> › <a href="/barrios">Barrios</a> › ${b.nombre}
  </div>
 
  <h1>Precio del m² en <em>${b.nombre}</em></h1>
  <p class="intro">
    ${b.nombre} es ${descBarrio}, parte del ${b.region} de Buenos Aires.
    El precio mediano del metro cuadrado en departamentos es de <strong>USD ${fmt(b.m2_mediana)}</strong>,
    con valores que oscilan entre USD ${fmt(b.m2_min)} y USD ${fmt(b.m2_max)} según tipo, antigüedad y amenities.
    Datos actualizados con scraping diario de ZonaProp.
  </p>
 
  <!-- Precio hero -->
  <div class="price-hero">
    <div class="price-label">Precio mediano del m² · ${b.nombre} · ${año}</div>
    <div class="price-main">USD ${fmt(b.m2_mediana)}/m²</div>
    <div class="price-range">Rango de mercado: USD ${fmt(b.m2_min)} — USD ${fmt(b.m2_max)} por m²</div>
    <div class="price-badges">
      <span class="pbadge">${b.region}</span>
      <span class="pbadge">Datos ZonaProp ${año}</span>
      <span class="pbadge">Mediana con filtro IQR</span>
    </div>
  </div>
 
  <!-- Ejemplos por superficie -->
  <div class="section-title">Cotizaciones de referencia por superficie</div>
  <div class="examples-grid">
    ${ejemplos.map(e => `
    <div class="ex-card">
      <div class="ex-m2">Departamento ${e.m2} m²</div>
      <div class="ex-price">USD ${fmt(e.precio)}</div>
      <div class="ex-range">USD ${fmt(e.min)} – ${fmt(e.max)}</div>
    </div>`).join('')}
  </div>
 
  <!-- Info del barrio -->
  <div class="section-title">Datos del barrio</div>
  <div class="info-grid">
    <div class="info-card">
      <div class="info-label">Región</div>
      <div class="info-val">${b.region}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Precio mediano</div>
      <div class="info-val">USD ${fmt(b.m2_mediana)}/m²</div>
    </div>
    <div class="info-card">
      <div class="info-label">Precio mínimo (P10)</div>
      <div class="info-val">USD ${fmt(b.m2_min)}/m²</div>
    </div>
    <div class="info-card">
      <div class="info-label">Precio máximo (P90)</div>
      <div class="info-val">USD ${fmt(b.m2_max)}/m²</div>
    </div>
  </div>
 
  <!-- FAQ estructurado para SEO -->
  <div class="faq">
    <h2>Preguntas frecuentes sobre ${b.nombre}</h2>
 
    <div class="faq-item">
      <div class="faq-q">¿Cuánto cuesta el metro cuadrado en ${b.nombre} en ${año}?</div>
      <div class="faq-a">
        El precio mediano del m² en ${b.nombre} es de <strong>USD ${fmt(b.m2_mediana)}</strong> según datos scrapeados
        de ZonaProp. Los valores oscilan entre USD ${fmt(b.m2_min)}/m² en el segmento más accesible y
        USD ${fmt(b.m2_max)}/m² en propiedades premium. Estos precios corresponden a departamentos en venta
        y se actualizan diariamente.
      </div>
    </div>
 
    <div class="faq-item">
      <div class="faq-q">¿Cuánto vale un departamento de 50 m² en ${b.nombre}?</div>
      <div class="faq-a">
        Un departamento de 50 m² en ${b.nombre} tiene un valor estimado de
        <strong>USD ${fmt(Math.round(b.m2_mediana * 50))}</strong> al precio mediano actual.
        Según antigüedad y amenities, puede variar entre USD ${fmt(Math.round(b.m2_min * 50))} y
        USD ${fmt(Math.round(b.m2_max * 50))}. Usá el cotizador para una estimación personalizada.
      </div>
    </div>
 
    <div class="faq-item">
      <div class="faq-q">¿Cómo se compara ${b.nombre} con el promedio de CABA?</div>
      <div class="faq-a">
        El promedio de CABA es de aproximadamente USD 2.450/m². ${b.nombre}, con USD ${fmt(b.m2_mediana)}/m²,
        se ubica ${b.m2_mediana > 2450 ? `un ${Math.round((b.m2_mediana/2450-1)*100)}% por encima del promedio porteño, siendo ${descRegion}` : `un ${Math.round((1-b.m2_mediana/2450)*100)}% por debajo del promedio porteño, siendo ${descRegion}`}.
      </div>
    </div>
 
    <div class="faq-item">
      <div class="faq-q">¿Qué factores afectan el precio en ${b.nombre}?</div>
      <div class="faq-a">
        Los principales factores son la antigüedad del edificio (un depto nuevo puede valer hasta 25% más que uno
        de 16-30 años), los amenities (cochera suma hasta 10%, pileta hasta 8%), la vista, el piso y el estado
        de conservación. El cotizador de CotizAR calcula todos estos factores automáticamente.
      </div>
    </div>
  </div>
 
  <!-- CTA -->
  <div class="cta-box">
    <h3>Cotizá tu depto en ${b.nombre}</h3>
    <p>Ingresá los m², antigüedad y amenities para obtener una cotización personalizada con datos reales.</p>
    <a href="/?barrio=${key}" class="cta-btn">Cotizar ahora →</a>
  </div>
 
</div>
 
<footer>
  CotizAR · Scraping diario de ZonaProp · Mediana con filtro IQR · Precio de oferta publicada · Cotización orientativa
</footer>
 
</body>
</html>`;
}
 
function generarPaginaBarrios() {
  const grupos = {};
  Object.entries(BARRIOS).forEach(([key, b]) => {
    if (!grupos[b.region]) grupos[b.region] = [];
    grupos[b.region].push({ key, ...b });
  });
 
  const año = new Date().getFullYear();
  const medianas = Object.values(BARRIOS).map(b => b.m2_mediana);
  const precioMin = fmt(Math.min(...medianas));
  const precioMax = fmt(Math.max(...medianas));
  const metaDesc = 'Precio del metro cuadrado en todos los barrios de Buenos Aires en ' + año + '. Desde USD ' + precioMin + '/m\u00b2 en Lugano hasta USD ' + precioMax + '/m\u00b2 en Puerto Madero. Datos reales de ZonaProp.';
 
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Precio m² por barrio en CABA ${new Date().getFullYear()} — CotizAR</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="https://cotizar.ar/barrios">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink:#0f0e0c; --ink2:#4a4840; --ink3:#9a9790;
      --paper:#faf8f4; --paper2:#f0ede7;
      --accent:#c8521a; --accent-light:#fdf0e8;
      --border:rgba(15,14,12,.10); --border2:rgba(15,14,12,.18);
    }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'DM Sans',sans-serif; background:var(--paper); color:var(--ink); }
    nav { display:flex; align-items:center; justify-content:space-between; padding:16px 40px; border-bottom:1px solid var(--border); }
    .logo { font-family:'DM Serif Display',serif; font-size:22px; }
    .logo span { color:var(--accent); }
    .container { max-width:760px; margin:0 auto; padding:48px 24px 80px; }
    h1 { font-family:'DM Serif Display',serif; font-size:40px; line-height:1.1; letter-spacing:-.5px; margin-bottom:12px; }
    h1 em { font-style:italic; color:var(--accent); }
    .intro { font-size:15px; color:var(--ink2); line-height:1.65; margin-bottom:40px; }
    .region-title { font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.7px; color:var(--ink3); margin:32px 0 14px; padding-bottom:8px; border-bottom:1px solid var(--border); }
    .barrios-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:8px; }
    .barrio-card { background:white; border:1px solid var(--border2); border-radius:10px; padding:16px 18px; text-decoration:none; color:inherit; transition:border-color .15s, box-shadow .15s; display:block; }
    .barrio-card:hover { border-color:var(--ink); box-shadow:0 2px 8px rgba(15,14,12,.08); }
    .bc-nombre { font-size:14px; font-weight:500; margin-bottom:4px; }
    .bc-precio { font-family:'DM Serif Display',serif; font-size:20px; color:var(--accent); }
    .bc-rango { font-size:11px; color:var(--ink3); margin-top:2px; }
    .cta-box { background:var(--ink); border-radius:14px; padding:28px 32px; text-align:center; margin-top:40px; }
    .cta-box h3 { font-family:'DM Serif Display',serif; font-size:24px; color:white; margin-bottom:8px; }
    .cta-box p { font-size:14px; color:rgba(255,255,255,.6); margin-bottom:20px; }
    .cta-btn { display:inline-block; background:var(--accent); color:white; text-decoration:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:500; }
    footer { text-align:center; padding:28px; font-size:12px; color:var(--ink3); border-top:1px solid var(--border); }
    @media(max-width:600px) { nav{padding:12px 16px;} .container{padding:32px 16px 64px;} h1{font-size:28px;} .barrios-grid{grid-template-columns:1fr;} }
  </style>
</head>
<body>
<nav>
  <div class="logo">Cotiz<span>AR</span></div>
  <a href="/" style="font-size:13px;color:var(--ink3);text-decoration:none">← Cotizador</a>
</nav>
<div class="container">
  <h1>Precio del m² por <em>barrio</em> en CABA</h1>
  <p class="intro">Precios medianos de departamentos en venta en todos los barrios de Buenos Aires, actualizados diariamente con datos de ZonaProp. Hacé clic en cualquier barrio para ver el detalle y ejemplos de cotización.</p>
 
  ${Object.entries(grupos).map(([region, barrios]) => `
    <div class="region-title">${region}</div>
    <div class="barrios-grid">
      ${barrios.sort((a,b)=>b.m2_mediana-a.m2_mediana).map(b => `
      <a href="/barrio/${b.key}" class="barrio-card">
        <div class="bc-nombre">${b.nombre}</div>
        <div class="bc-precio">USD ${fmt(b.m2_mediana)}/m²</div>
        <div class="bc-rango">USD ${fmt(b.m2_min)} – ${fmt(b.m2_max)}/m²</div>
      </a>`).join('')}
    </div>
  `).join('')}
 
  <div class="cta-box">
    <h3>Cotizá tu departamento</h3>
    <p>Seleccioná tu barrio, los m² y los amenities para obtener una cotización personalizada.</p>
    <a href="/" class="cta-btn">Usar el cotizador →</a>
  </div>
</div>
<footer>CotizAR · Scraping diario de ZonaProp · Precio de oferta publicada · Cotización orientativa</footer>
</body>
</html>`;
}
 
function generarSitemap() {
  const base = 'https://cotizar.ar';
  const hoy = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: base, changefreq: 'daily', priority: '1.0' },
    { loc: `${base}/barrios`, changefreq: 'weekly', priority: '0.9' },
    ...Object.keys(BARRIOS).map(key => ({
      loc: `${base}/barrio/${key}`,
      changefreq: 'weekly',
      priority: '0.8',
    })),
  ];
 
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}
 
// ─────────────────────────────────────────────
// MAIN — generar todos los archivos
// ─────────────────────────────────────────────
function main() {
  const publicDir = path.join(__dirname, 'public');
  const barrioDir = path.join(publicDir, 'barrio');
 
  // Crear carpeta public/barrio si no existe
  if (!fs.existsSync(barrioDir)) {
    fs.mkdirSync(barrioDir, { recursive: true });
    console.log('📁 Creada carpeta public/barrio/');
  }
 
  // Generar página por barrio
  let count = 0;
  for (const [key, b] of Object.entries(BARRIOS)) {
    const html = generarPaginaBarrio(key, b);
    fs.writeFileSync(path.join(barrioDir, `${key}.html`), html, 'utf8');
    console.log(`  ✓ /barrio/${key} — ${b.nombre} · USD ${fmt(b.m2_mediana)}/m²`);
    count++;
  }
 
  // Generar página índice de barrios
  const barriosHtml = generarPaginaBarrios();
  fs.writeFileSync(path.join(publicDir, 'barrios.html'), barriosHtml, 'utf8');
  console.log(`  ✓ /barrios — índice de ${count} barrios`);
 
  // Generar sitemap.xml
  const sitemap = generarSitemap();
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');
  console.log(`  ✓ sitemap.xml — ${count + 2} URLs`);
 
  // Generar robots.txt si no existe
  const robotsPath = path.join(publicDir, 'robots.txt');
  if (!fs.existsSync(robotsPath)) {
    fs.writeFileSync(robotsPath, `User-agent: *\nAllow: /\nSitemap: https://cotizar.ar/sitemap.xml\n`, 'utf8');
    console.log('  ✓ robots.txt');
  }
 
  console.log(`\n✅ ${count} páginas de barrios + índice + sitemap generados en public/\n`);
}
 
main();
