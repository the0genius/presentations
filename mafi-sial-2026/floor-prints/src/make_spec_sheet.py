"""One-page spec sheet (BAT) for the MAFI / SIAL 2026 floor prints.

Usage: python3 make_spec_sheet.py OUT_PDF
"""

import sys

from reportlab.lib.colors import CMYKColor, black, Color
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

import make_floor_prints as fp

MM = fp.MM
INK = Color(0.15, 0.15, 0.15)
MUTED = Color(0.45, 0.45, 0.45)
CUT = CMYKColor(0, 1, 0, 0)


def draw_path(c, path, tf, fill_grad=None, stroke=None):
    p = c.beginPath()
    for seg in path:
        if seg[0] == "m":
            p.moveTo(*tf(seg[1]))
        elif seg[0] == "l":
            p.lineTo(*tf(seg[1]))
        elif seg[0] == "c":
            p.curveTo(*tf(seg[1]), *tf(seg[2]), *tf(seg[3]))
        else:
            p.close()
    if fill_grad:
        c.saveState()
        c.clipPath(p, stroke=0, fill=0)
        (x0, y0), (x1, y1) = fill_grad
        c.linearGradient(x0, y0, x1, y1, (CMYKColor(*fp.GREEN[1]), CMYKColor(*fp.BLUE[1])), extend=True)
        c.restoreState()
    if stroke:
        c.saveState()
        c.setStrokeColor(stroke)
        c.setLineWidth(0.6)
        c.drawPath(p, stroke=1, fill=0)
        c.restoreState()


def dim_h(c, x0, x1, y, label):
    c.setStrokeColor(MUTED)
    c.setLineWidth(0.4)
    c.line(x0, y, x1, y)
    for x in (x0, x1):
        c.line(x, y - 3, x, y + 3)
    c.setFillColor(INK)
    c.setFont("Helvetica", 8)
    c.drawCentredString((x0 + x1) / 2, y + 4, label)


def dim_v(c, x, y0, y1, label, right=False):
    c.setStrokeColor(MUTED)
    c.setLineWidth(0.4)
    c.line(x, y0, x, y1)
    for y in (y0, y1):
        c.line(x - 3, y, x + 3, y)
    c.saveState()
    c.translate(x + (9 if right else -4), (y0 + y1) / 2)
    c.rotate(90)
    c.setFillColor(INK)
    c.setFont("Helvetica", 8)
    c.drawCentredString(0, 0, label)
    c.restoreState()


def block(c, x, y, lines, size=9, lead=13):
    for i, (txt, bold) in enumerate(lines):
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        c.setFillColor(INK if bold else Color(0.25, 0.25, 0.25))
        c.drawString(x, y - i * lead, txt)


def main():
    out = sys.argv[1]
    W, H = landscape(A4)
    c = canvas.Canvas(out, pagesize=(W, H))
    c.setTitle("MAFI SIAL 2026 - Floor prints - spec sheet")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(15 * MM, H - 18 * MM, "MAFI  -  SIAL 2026  -  Hall 7 D327  -  Floor prints")
    c.setFont("Helvetica", 9.5)
    c.setFillColor(MUTED)
    c.drawString(15 * MM, H - 24 * MM,
                 "Impression vinyl adhesif au sol  -  R2 dossier signaletique, page 4 (Gabarits visuels PL 2), items 12 and 13")

    # --- item 12 ------------------------------------------------------------
    disc = fp.half_disc()
    s12 = 0.032  # drawing scale on the sheet (mm per real mm)
    ox, oy = 22 * MM, 126 * MM

    def tf12(p):
        return (ox + p[0] * s12 * MM, oy + p[1] * s12 * MM)

    draw_path(c, disc["cut"], tf12, fill_grad=(tf12((0, 0)), tf12((3000, 0))), stroke=CUT)
    dim_h(c, *[tf12((v, 0))[0] for v in (0, 3000)], tf12((0, 1500))[1] + 6, "3 000 mm")
    dim_v(c, tf12((0, 0))[0] - 8, tf12((0, 0))[1], tf12((0, 1500))[1], "1 500 mm")
    c.setFont("Helvetica", 8)
    c.setFillColor(Color(1, 1, 1))
    c.drawCentredString(*tf12((1500, 700)), "R 1 500 mm")

    block(c, 128 * MM, 170 * MM, [
        ("12   Demi-disque  -  quantity x3", True),
        ("File:  MAFI_SIAL26_12_Demi-disque_R1500_x3_ECH1-1.ai / .pdf", False),
        ("Scale:  1:1 (real size)", False),
        ("Finished size:  3 000 x 1 500 mm (half-disc, radius 1 500 mm)", False),
        ("Area:  3.53 m2 each  -  10.6 m2 total", False),
        ("Positions (plan p.2): under reception desk (top edge), Allee D side,", False),
        ("Allee E side under 2nd reception desk  -  flat side on the stand edge", False),
    ])

    # --- item 13 ------------------------------------------------------------
    band = fp.arc_band()
    s13 = 0.0245
    ox2, oy2 = 22 * MM, 76 * MM

    def tf13(p):
        return (ox2 + p[0] * s13 * MM, oy2 + p[1] * s13 * MM)

    draw_path(c, band["cut"], tf13, fill_grad=(tf13((0, 0)), tf13((10000, 0))), stroke=CUT)
    dim_h(c, *[tf13((v, 0))[0] for v in (0, 10000)], tf13((0, band["trim"][1]))[1] + 6, "10 000 mm (chord)")
    dim_v(c, tf13((0, 0))[0] - 8, tf13((0, 0))[1], tf13((0, band["trim"][1]))[1], "1 777 mm")
    yl, yr = band["ends"]
    c.setFont("Helvetica", 7.5)
    c.setFillColor(INK)
    c.drawString(tf13((0, 0))[0] + 2, tf13((0, 0))[1] - 10, "end 195 mm")
    c.drawRightString(tf13((10000, 0))[0], tf13((0, 0))[1] - 10, "end 505 mm")
    c.drawCentredString(tf13((5000, 0))[0], tf13((0, 0))[1] + 14, "inner R 9 200  /  outer R 9 500  /  centres offset 250 mm")

    block(c, 22 * MM, 61 * MM, [
        ("13   Arc  -  quantity x3 per R2 dossier (plan and renders show 2: please confirm)", True),
        ("File:  MAFI_SIAL26_13_Arc_R9200-R9500_x3_ECH1-10.ai / .pdf", False),
        ("Scale:  1:10  ->  PRINT AT 1000 %  (file 1 000 x 178 mm = 10 000 x 1 777 mm real)", True),
        ("Band tapers 195 -> 297 (middle) -> 505 mm  -  edge length approx. 10.55 m", False),
        ("Area:  3.13 m2 each  -  both arcs on the plan are the same piece rotated 180 deg", False),
        ("Bounding box 10.0 x 1.78 m: split into sections if the roll is narrower", False),
    ])

    # --- shared specs ---------------------------------------------------------
    c.setStrokeColor(Color(0.85, 0.85, 0.85))
    c.line(15 * MM, 33 * MM, W - 15 * MM, 33 * MM)
    sw = 9 * MM
    for i, (hexv, cmyk) in enumerate((fp.GREEN, fp.BLUE)):
        x = 15 * MM + i * 62 * MM
        c.setFillColor(CMYKColor(*cmyk))
        c.rect(x, 16 * MM, sw, sw, stroke=0, fill=1)
        block(c, x + sw + 3 * MM, 23 * MM, [
            (("Start  " if i == 0 else "End  ") + hexv, True),
            ("C%d M%d Y%d K%d" % tuple(round(v * 100) for v in cmyk), False),
        ])
    block(c, 140 * MM, 28.5 * MM, [
        ("Colour & file setup", True),
        ("Linear gradient, left to right as drawn. CMYK ISO Coated v2 300% (FOGRA39),", False),
        ("relative colorimetric. 100% vector, no images, no fonts.", False),
        ("Bleed 20 mm (real) around the cut. Cut line: spot 'CutContour', 0.25 pt, overprint,", False),
        ("own layer. Material: floor vinyl + anti-slip floor laminate, contour cut.", False),
    ], size=8.5, lead=11.5)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(15 * MM, 7 * MM, "Shapes on this sheet are scaled to fit; dimensions in mm, real size. "
                 "Magenta outline = cut line.")
    c.showPage()
    c.save()


if __name__ == "__main__":
    main()
