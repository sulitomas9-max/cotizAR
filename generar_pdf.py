"""
generar_pdf.py
Genera un PDF de cotización para CotizAR.
Uso: python3 generar_pdf.py '<json_cotizacion>' output.pdf
"""

import sys
import json
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── PALETA DE COLORES (fiel a la web) ──
INK        = colors.HexColor('#0f0e0c')
INK2       = colors.HexColor('#4a4840')
INK3       = colors.HexColor('#9a9790')
PAPER      = colors.HexColor('#faf8f4')
PAPER2     = colors.HexColor('#f0ede7')
PAPER3     = colors.HexColor('#e5e1d8')
ACCENT     = colors.HexColor('#c8521a')
ACCENT2    = colors.HexColor('#e8844a')
ACCENT_BG  = colors.HexColor('#fdf0e8')
GREEN      = colors.HexColor('#1a6640')
GREEN_BG   = colors.HexColor('#e8f5ee')
BLUE       = colors.HexColor('#1a4d80')
BLUE_BG    = colors.HexColor('#e8f0fa')
WHITE      = colors.white

W, H = A4  # 595 x 842 pt
MARGIN = 22 * mm

def fmt_usd(n):
    if n is None: return '—'
    return 'USD ' + f'{int(round(n)):,}'.replace(',', '.')

def fmt_ars(n):
    if n is None: return '—'
    return '$ ' + f'{int(round(n)):,}'.replace(',', '.')

def fmt_pct(n):
    if n is None: return '—'
    return ('+' if n > 0 else '') + str(n) + '%'

# ── CANVAS PERSONALIZADO (header/footer en cada página) ──
class CotizARCanvas(pdfcanvas.Canvas):
    def __init__(self, filename, cotizacion, **kw):
        super().__init__(filename, **kw)
        self.cotizacion = cotizacion
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_header_footer(num_pages)
            super().showPage()
        super().save()

    def _draw_header_footer(self, total_pages):
        self.saveState()

        # ── HEADER ──
        # Barra naranja izquierda
        self.setFillColor(ACCENT)
        self.rect(0, H - 18*mm, MARGIN * 0.4, 18*mm, fill=1, stroke=0)

        # Logo "CotizAR" tipográfico
        self.setFillColor(INK)
        self.setFont('Helvetica-Bold', 18)
        self.drawString(MARGIN, H - 12*mm, 'Cotiz')
        self.setFillColor(ACCENT)
        self.drawString(MARGIN + 44, H - 12*mm, 'AR')

        # Subtítulo header
        self.setFillColor(INK3)
        self.setFont('Helvetica', 8)
        self.drawString(MARGIN, H - 17*mm, 'Cotizador de Departamentos · CABA · cotizar-production.up.railway.app')

        # Línea separadora header
        self.setStrokeColor(PAPER3)
        self.setLineWidth(0.5)
        self.line(MARGIN, H - 20*mm, W - MARGIN, H - 20*mm)

        # ── FOOTER ──
        self.setStrokeColor(PAPER3)
        self.line(MARGIN, 14*mm, W - MARGIN, 14*mm)

        self.setFillColor(INK3)
        self.setFont('Helvetica', 7.5)
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        self.drawString(MARGIN, 9*mm, f'Cotización orientativa · Fuente: ZonaProp + Argenprop scrapeados diariamente · Generado: {fecha}')

        page_num = self._pageNumber
        self.drawRightString(W - MARGIN, 9*mm, f'Página {page_num} de {total_pages}')

        self.restoreState()


def generar_pdf(cotizacion: dict, output_path: str):
    v   = cotizacion.get('venta')
    alq = cotizacion.get('alquiler')
    aj  = cotizacion.get('ajustes', {})
    m   = cotizacion.get('mercado', {})
    inp = cotizacion.get('inputs', {})
    bar = cotizacion.get('barrio', {})

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=26*mm, bottomMargin=22*mm,
        title=f'CotizAR — {bar.get("nombre","CABA")}',
        author='CotizAR',
    )

    # ── ESTILOS ──
    def sty(name, **kw):
        base = {
            'fontName': 'Helvetica', 'fontSize': 10,
            'textColor': INK2, 'leading': 14, 'spaceAfter': 0,
        }
        base.update(kw)
        return ParagraphStyle(name, **base)

    S_TITLE   = sty('title',   fontName='Helvetica-Bold', fontSize=26, textColor=INK,    leading=30, spaceAfter=2)
    S_SUB     = sty('sub',     fontSize=11, textColor=INK3, leading=15)
    S_PRICE   = sty('price',   fontName='Helvetica-Bold', fontSize=38, textColor=WHITE,  leading=42, alignment=TA_LEFT)
    S_RANGE   = sty('range',   fontSize=11, textColor=colors.HexColor('#ffffff99') if False else colors.HexColor('#e8844a'), leading=14)
    S_LABEL   = sty('label',   fontSize=8,  textColor=INK3, leading=11, fontName='Helvetica-Bold')
    S_VALUE   = sty('value',   fontName='Helvetica-Bold', fontSize=11, textColor=INK, leading=14)
    S_SECTION = sty('section', fontName='Helvetica-Bold', fontSize=8,  textColor=INK3, leading=12,
                    spaceAfter=6, spaceBefore=14)
    S_BODY    = sty('body',    fontSize=9,  textColor=INK2, leading=13)
    S_SMALL   = sty('small',   fontSize=7.5, textColor=INK3, leading=11)
    S_POS     = sty('pos',     fontName='Helvetica-Bold', fontSize=10, textColor=GREEN)
    S_NEG     = sty('neg',     fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#dc2626'))
    S_ACC     = sty('acc',     fontName='Helvetica-Bold', fontSize=10, textColor=ACCENT)

    story = []

    # ── SECCIÓN 1: ENCABEZADO ──
    barrio_nombre = bar.get('nombre', '—')
    region        = bar.get('region', '')
    metros        = inp.get('metros', '—')
    tipo          = inp.get('tipo', '—')
    antiguedad_key= inp.get('antiguedad', '—')
    EDADES = {'0-5':'Nuevo','6-15':'Moderno','16-30':'Intermedio','31-50':'Antiguo','50+':'Muy antiguo','refaccionado':'Reciclado'}
    edad_label = EDADES.get(antiguedad_key, antiguedad_key)
    amb_map = {1:'Monoambiente', 2:'2 ambientes', 3:'3 ambientes', 4:'4 ambientes', 5:'5+ ambientes'}
    amb_label = amb_map.get(inp.get('ambientes'), 'No especificado')
    amenities = inp.get('amenities', [])

    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(barrio_nombre, S_TITLE))
    story.append(Paragraph(f'{region}  ·  {metros} m²  ·  {tipo.capitalize()}  ·  {edad_label}  ·  {amb_label}', S_SUB))
    story.append(Spacer(1, 5*mm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=PAPER3, spaceAfter=5*mm))

    # ── SECCIÓN 2: PRECIO PRINCIPAL (caja oscura) ──
    if v:
        precio_usd  = v.get('precio_usd', 0)
        precio_min  = v.get('precio_usd_min', 0)
        precio_max  = v.get('precio_usd_max', 0)
        precio_ars  = v.get('precio_pesos', 0)
        m2_usd      = v.get('m2_usd', 0)
        dolar_mep   = v.get('dolar_mep', 0)

        # Tabla de precio en caja oscura
        precio_data = [
            [Paragraph('PRECIO ESTIMADO', sty('pl', fontSize=8, textColor=colors.HexColor('#9a9790'), fontName='Helvetica-Bold', leading=10))],
            [Paragraph(fmt_usd(precio_usd), sty('pv', fontName='Helvetica-Bold', fontSize=34, textColor=INK, leading=38))],
            [Paragraph(f'Rango: {fmt_usd(precio_min)} — {fmt_usd(precio_max)}', sty('pr', fontSize=9, textColor=INK2, leading=13))],
            [Paragraph(f'{fmt_ars(precio_ars)}  ·  MEP ${int(dolar_mep):,}'.replace(',','.'), sty('pa', fontSize=9, textColor=INK3, leading=13))],
        ]
        precio_table = Table(precio_data, colWidths=[W - 2*MARGIN])
        precio_table.setStyle(TableStyle([
            ('BACKGROUND',  (0,0), (-1,-1), PAPER2),
            ('ROUNDEDCORNERS', [8]),
            ('TOPPADDING',  (0,0), (-1, 0), 12),
            ('TOPPADDING',  (0,1), (-1, 1), 4),
            ('BOTTOMPADDING',(0,-1),(-1,-1), 12),
            ('LEFTPADDING', (0,0), (-1,-1), 16),
            ('RIGHTPADDING',(0,0), (-1,-1), 16),
            ('LINEBELOW',   (0,1), (0,1), 0.5, PAPER3),
        ]))
        story.append(KeepTogether(precio_table))
        story.append(Spacer(1, 5*mm))

    # ── SECCIÓN 3: MÉTRICAS RÁPIDAS (3 columnas) ──
    diff_pct = m.get('diferencia_vs_promedio_pct', 0)
    base_pct = aj.get('diferencia_vs_base_pct', 0)
    prom_caba = m.get('promedio_caba_m2', 2452)
    muestras  = m.get('muestras_scraping')

    def metric_cell(label, value, color=INK, sub=None):
        lines = [Paragraph(label, sty('ml', fontSize=7.5, textColor=INK3, fontName='Helvetica-Bold', leading=10))]
        lines.append(Paragraph(str(value), sty('mv', fontName='Helvetica-Bold', fontSize=14, textColor=color, leading=18)))
        if sub:
            lines.append(Paragraph(sub, sty('ms', fontSize=8, textColor=INK3, leading=11)))
        return lines

    m1 = metric_cell('PRECIO / m²', fmt_usd(v.get('m2_usd') if v else None), INK, 'con ajustes')
    m2 = metric_cell('VS. PROMEDIO CABA', fmt_pct(diff_pct),
                     GREEN if diff_pct < 0 else ACCENT,
                     f'mediana {fmt_usd(prom_caba)}/m²')
    m3 = metric_cell('AVISOS ANALIZADOS', str(muestras) if muestras else 'ZonaProp Index', INK2,
                     'fuente del precio base')

    metrics_data = [[m1, m2, m3]]
    col_w = (W - 2*MARGIN - 8*mm) / 3
    metrics_table = Table(metrics_data, colWidths=[col_w]*3, hAlign='LEFT')
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND',   (0,0), (-1,-1), WHITE),
        ('BOX',          (0,0), (0,0), 0.5, PAPER3),
        ('BOX',          (1,0), (1,0), 0.5, PAPER3),
        ('BOX',          (2,0), (2,0), 0.5, PAPER3),
        ('TOPPADDING',   (0,0), (-1,-1), 10),
        ('BOTTOMPADDING',(0,0), (-1,-1), 10),
        ('LEFTPADDING',  (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('VALIGN',       (0,0), (-1,-1), 'TOP'),
        ('ROUNDEDCORNERS', [6]),
        ('COLPADDING',   (0,0), (1,0), 4),
        ('COLPADDING',   (1,0), (2,0), 4),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 6*mm))

    # ── SECCIÓN 4: DESGLOSE DE AJUSTES ──
    story.append(Paragraph('DESGLOSE DE AJUSTES', S_SECTION))

    TIPOS_LABEL = {'depto':'Departamento','ph':'PH','estrenar':'A estrenar','pozo':'En pozo'}
    rows = [
        # encabezado
        [Paragraph('Factor', sty('th', fontSize=8, textColor=INK3, fontName='Helvetica-Bold')),
         Paragraph('Detalle', sty('th', fontSize=8, textColor=INK3, fontName='Helvetica-Bold')),
         Paragraph('Impacto', sty('th', fontSize=8, textColor=INK3, fontName='Helvetica-Bold', alignment=TA_RIGHT))],
        # precio base
        [Paragraph('📍 Precio base', S_BODY),
         Paragraph(f'{barrio_nombre} · mediana de mercado', S_BODY),
         Paragraph(fmt_usd(aj.get('precio_sin_ajustes_usd')), sty('tr', fontSize=9, textColor=INK2, alignment=TA_RIGHT))],
    ]

    def impact_txt(pct, style_pos=S_POS, style_neg=S_NEG, style_neu=S_BODY):
        if pct is None or pct == 0: return Paragraph('—', style_neu)
        color = GREEN if pct < 0 else ACCENT
        sign  = '+' if pct > 0 else ''
        return Paragraph(f'{sign}{pct}%', sty('imp', fontName='Helvetica-Bold', fontSize=9,
                          textColor=color, alignment=TA_RIGHT))

    ft = aj.get('factor_tipo', {})
    rows.append([
        Paragraph(f'🏢 Tipo', S_BODY),
        Paragraph(TIPOS_LABEL.get(tipo, tipo), S_BODY),
        impact_txt(ft.get('impacto_pct')),
    ])

    fa = aj.get('factor_antiguedad', {})
    rows.append([
        Paragraph(f'🏗️ Antigüedad', S_BODY),
        Paragraph(fa.get('label', edad_label), S_BODY),
        impact_txt(fa.get('impacto_pct')),
    ])

    famb = aj.get('factor_ambientes', {})
    if famb.get('ambientes_num'):
        rows.append([
            Paragraph(f'🏠 Ambientes', S_BODY),
            Paragraph(famb.get('label', amb_label), S_BODY),
            impact_txt(famb.get('impacto_pct')),
        ])

    fam = aj.get('factor_amenities', {})
    am_det = fam.get('detalle', [])
    am_txt = ', '.join([d.get('label','') for d in am_det]) if am_det else 'Ninguno'
    if len(am_txt) > 55: am_txt = am_txt[:52] + '...'
    rows.append([
        Paragraph(f'✨ Amenities ({len(am_det)})', S_BODY),
        Paragraph(am_txt, S_BODY),
        impact_txt(fam.get('impacto_pct')),
    ])

    # total
    rows.append([
        Paragraph('💰 Precio final', sty('tot', fontName='Helvetica-Bold', fontSize=10, textColor=INK)),
        Paragraph('', S_BODY),
        Paragraph(fmt_usd(v.get('precio_usd') if v else None),
                  sty('totv', fontName='Helvetica-Bold', fontSize=10, textColor=ACCENT, alignment=TA_RIGHT)),
    ])

    col_ws = [38*mm, W - 2*MARGIN - 38*mm - 28*mm, 28*mm]
    adj_table = Table(rows, colWidths=col_ws)
    n = len(rows)
    adj_table.setStyle(TableStyle([
        ('BACKGROUND',   (0,0), (-1, 0), PAPER2),
        ('BACKGROUND',   (0,n-1),(-1,n-1), ACCENT_BG),
        ('FONTNAME',     (0,0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',     (0,0), (-1, 0), 8),
        ('TEXTCOLOR',    (0,0), (-1, 0), INK3),
        ('LINEBELOW',    (0,0), (-1,-2), 0.5, PAPER3),
        ('TOPPADDING',   (0,0), (-1,-1), 7),
        ('BOTTOMPADDING',(0,0), (-1,-1), 7),
        ('LEFTPADDING',  (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
        ('BOX',          (0,0), (-1,-1), 0.5, PAPER3),
    ]))
    story.append(adj_table)
    story.append(Spacer(1, 6*mm))

    # ── SECCIÓN 5: ALQUILER (si aplica) ──
    if alq:
        story.append(Paragraph('ESTIMACIÓN DE ALQUILER', S_SECTION))
        rent = alq.get('rentabilidad_bruta_anual', 0)
        rent_label = 'Alta' if rent > 5 else 'Media' if rent > 3.5 else 'Baja'
        rent_color = GREEN if rent > 5 else ACCENT2 if rent > 3.5 else colors.HexColor('#dc2626')

        alq_data = [
            [Paragraph('ESTIMADO / MES', sty('al', fontSize=8, textColor=INK3, fontName='Helvetica-Bold')),
             Paragraph('RANGO MENSUAL', sty('al', fontSize=8, textColor=INK3, fontName='Helvetica-Bold')),
             Paragraph('RENTABILIDAD BRUTA', sty('al', fontSize=8, textColor=INK3, fontName='Helvetica-Bold')),
             Paragraph('AÑOS DE RECUPERO', sty('al', fontSize=8, textColor=INK3, fontName='Helvetica-Bold'))],
            [Paragraph(fmt_ars(alq.get('estimado_mes_pesos')), sty('av', fontName='Helvetica-Bold', fontSize=13, textColor=GREEN)),
             Paragraph(f"{fmt_ars(alq.get('min_pesos'))} – {fmt_ars(alq.get('max_pesos'))}", sty('ar', fontSize=9, textColor=INK2)),
             Paragraph(f"{rent_label} ({rent}%)", sty('arnt', fontName='Helvetica-Bold', fontSize=11, textColor=rent_color)),
             Paragraph(f"{alq.get('años_recupero')} años", sty('ayr', fontName='Helvetica-Bold', fontSize=13, textColor=INK))],
        ]
        col_wa = [(W - 2*MARGIN) / 4] * 4
        alq_table = Table(alq_data, colWidths=col_wa)
        alq_table.setStyle(TableStyle([
            ('BACKGROUND',   (0,0), (-1,-1), GREEN_BG),
            ('LINEBELOW',    (0,0), (-1, 0), 0.5, colors.HexColor('#c8e6d4')),
            ('TOPPADDING',   (0,0), (-1,-1), 9),
            ('BOTTOMPADDING',(0,0), (-1,-1), 9),
            ('LEFTPADDING',  (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
            ('BOX',          (0,0), (-1,-1), 0.5, colors.HexColor('#c8e6d4')),
        ]))
        story.append(alq_table)
        story.append(Spacer(1, 6*mm))

    # ── SECCIÓN 6: COMPARATIVA BARRIOS ──
    story.append(Paragraph('COMPARATIVA DE BARRIOS · USD/m²', S_SECTION))

    comparativa = [
        ('Puerto Madero', 6163), ('Palermo', 3362), ('Belgrano', 3100),
        (barrio_nombre, v.get('m2_usd', 0) if v else 0),
        ('Caballito', 2350), ('Flores', 1950), ('Villa Lugano', 1063),
    ]
    # Deduplicar y ordenar
    seen = set()
    comp_clean = []
    for n2, p in sorted(comparativa, key=lambda x: -x[1]):
        if n2 not in seen:
            comp_clean.append((n2, p))
            seen.add(n2)
    max_p = max(p for _, p in comp_clean) or 1

    comp_rows = []
    for nombre_b, precio_b in comp_clean:
        is_hl = nombre_b == barrio_nombre
        bar_w = int((precio_b / max_p) * 80)  # max 80mm
        name_sty = sty('cn', fontSize=9, textColor=INK if is_hl else INK2,
                        fontName='Helvetica-Bold' if is_hl else 'Helvetica', alignment=TA_RIGHT)
        val_sty  = sty('cv', fontSize=9, textColor=ACCENT if is_hl else INK2,
                        fontName='Helvetica-Bold' if is_hl else 'Helvetica')
        # La barra la dibujamos como una tabla interior
        bar_color = ACCENT if is_hl else PAPER3
        inner = Table([['']], colWidths=[bar_w*mm], rowHeights=[3.5*mm])
        inner.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1), bar_color), ('TOPPADDING',(0,0),(-1,-1),0), ('BOTTOMPADDING',(0,0),(-1,-1),0)]))
        comp_rows.append([
            Paragraph(nombre_b, name_sty),
            inner,
            Paragraph(fmt_usd(precio_b) + '/m²', val_sty),
        ])

    comp_table = Table(comp_rows, colWidths=[40*mm, 85*mm, 35*mm])
    comp_table.setStyle(TableStyle([
        ('LINEBELOW',    (0,0), (-1,-2), 0.5, PAPER3),
        ('TOPPADDING',   (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (0,-1), 8),
        ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(comp_table)
    story.append(Spacer(1, 6*mm))

    # ── SECCIÓN 7: DATOS DEL INMUEBLE (resumen) ──
    story.append(HRFlowable(width='100%', thickness=0.5, color=PAPER3, spaceBefore=2*mm, spaceAfter=4*mm))
    story.append(Paragraph('DATOS DEL INMUEBLE', S_SECTION))

    am_list = ', '.join(amenities) if amenities else 'Ninguno'
    detail_rows = [
        ['Barrio',       barrio_nombre,     'Región',     region],
        ['Superficie',   f'{metros} m²',    'Tipo',       TIPOS_LABEL.get(tipo, tipo)],
        ['Antigüedad',   edad_label,         'Ambientes',  amb_label],
        ['Amenities',    am_list,            '',           ''],
    ]
    cw = [(W - 2*MARGIN) / 4] * 4
    detail_table = Table(detail_rows, colWidths=cw)
    detail_table.setStyle(TableStyle([
        ('FONTNAME',     (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME',     (2,0), (2,-1), 'Helvetica-Bold'),
        ('FONTSIZE',     (0,0), (-1,-1), 8),
        ('TEXTCOLOR',    (0,0), (0,-1), INK3),
        ('TEXTCOLOR',    (2,0), (2,-1), INK3),
        ('TEXTCOLOR',    (1,0), (1,-1), INK2),
        ('TEXTCOLOR',    (3,0), (3,-1), INK2),
        ('TOPPADDING',   (0,0), (-1,-1), 4),
        ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ('LEFTPADDING',  (0,0), (-1,-1), 4),
        ('LINEBELOW',    (0,0), (-1,-2), 0.5, PAPER3),
        ('SPAN',         (1,3), (3,3)),
    ]))
    story.append(detail_table)

    # ── BUILD ──
    def make_canvas(filename, **kw):
        return CotizARCanvas(filename, cotizacion, pagesize=A4)

    doc.build(story, canvasmaker=make_canvas)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Uso: python3 generar_pdf.py \'<json>\' output.pdf', file=sys.stderr)
        sys.exit(1)
    data = json.loads(sys.argv[1])
    out  = sys.argv[2]
    generar_pdf(data, out)
    print(f'PDF generado: {out}')
