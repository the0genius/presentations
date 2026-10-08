"""Generate the MAFI / SIAL 2026 floor-print files (R2 dossier, page 4, items 12 and 13).

Output is PDF-based Adobe Illustrator (.ai) plus an identical .pdf copy:
  - 100 % vector, CMYK, MAFI gradient #009C49 -> #045976
  - layer "Impression"  : artwork with 20 mm bleed (real size)
  - layer "Decoupe"     : cut line in spot colour "CutContour" (overprint)
  - TrimBox = finished shape bounding box, BleedBox/MediaBox = trim + bleed
  - output intent ISO Coated v2 300 % (FOGRA39), if an ICC path is given

Usage: python3 make_floor_prints.py OUT_DIR [ISO_COATED_V2_ICC]
"""

import math
import sys
import zlib
from datetime import datetime, timezone
from pathlib import Path

MM = 72 / 25.4  # points per millimetre

# MAFI gradient, converted sRGB -> ISO Coated v2 300 % (FOGRA39), relative colorimetric.
GREEN = ("#009C49", (0.84, 0.07, 0.94, 0.01))
BLUE = ("#045976", (0.95, 0.51, 0.31, 0.28))

BLEED = 20.0  # mm, real size


# ---------------------------------------------------------------- geometry ---

def arc(cx, cy, r, a0, a1, segs=8):
    """Cubic Bezier segments for a circular arc from angle a0 to a1 (radians)."""
    out = []
    step = (a1 - a0) / segs
    k = 4 / 3 * math.tan(step / 4)
    for i in range(segs):
        t0, t1 = a0 + i * step, a0 + (i + 1) * step
        p0 = (cx + r * math.cos(t0), cy + r * math.sin(t0))
        p3 = (cx + r * math.cos(t1), cy + r * math.sin(t1))
        p1 = (p0[0] - k * r * math.sin(t0), p0[1] + k * r * math.cos(t0))
        p2 = (p3[0] + k * r * math.sin(t1), p3[1] - k * r * math.cos(t1))
        out.append(("c", p1, p2, p3))
    return out


def ang(c, p):
    return math.atan2(p[1] - c[1], p[0] - c[0])


def half_disc():
    """Item 12: half-disc R 1500 mm, flat side on top (as drawn by R2)."""
    r, c = 1500.0, (1500.0, 1500.0)
    cut = [("m", (0, 1500)), ("l", (3000, 1500))] + arc(*c, r, 0, -math.pi) + [("h",)]
    rb = r + BLEED
    bleed = ([("m", (-BLEED, 1500 + BLEED)), ("l", (3000 + BLEED, 1500 + BLEED)),
              ("l", (3000 + BLEED, 1500))] + arc(*c, rb, 0, -math.pi) + [("h",)])
    return dict(trim=(3000.0, 1500.0), cut=cut, bleed=bleed, grad=((0, 750), (3000, 750)))


def arc_band():
    """Item 13: band between R 9200 and R 9500, centres offset 250 mm, chord 10 000 mm."""
    ri, ro, chord, offset = 9200.0, 9500.0, 10000.0, 250.0
    yc = -math.sqrt(ri ** 2 - (chord / 2) ** 2)
    ci, co = (chord / 2, yc), (chord / 2 + offset, yc)

    def y_on(c, r, x):
        return math.sqrt(r ** 2 - (x - c[0]) ** 2) + c[1]

    top = ro + yc  # outer apex height (~1777 mm)
    yl, yr = y_on(co, ro, 0), y_on(co, ro, chord)  # ~195 and ~505 mm end heights
    cut = ([("m", (0, 0))] + arc(*ci, ri, ang(ci, (0, 0)), ang(ci, (chord, 0)))
           + [("l", (chord, yr))] + arc(*co, ro, ang(co, (chord, yr)), ang(co, (0, yl))) + [("h",)])

    rib, rob = ri - BLEED, ro + BLEED
    dx = math.sqrt(rib ** 2 - (-BLEED - yc) ** 2)  # where the offset inner arc meets y = -bleed
    bl, br = (ci[0] - dx, -BLEED), (ci[0] + dx, -BLEED)
    ybl, ybr = y_on(co, rob, -BLEED), y_on(co, rob, chord + BLEED)
    bleed = ([("m", (-BLEED, -BLEED)), ("l", bl)] + arc(*ci, rib, ang(ci, bl), ang(ci, br))
             + [("l", (chord + BLEED, -BLEED)), ("l", (chord + BLEED, ybr))]
             + arc(*co, rob, ang(co, (chord + BLEED, ybr)), ang(co, (-BLEED, ybl))) + [("h",)])
    return dict(trim=(chord, top), cut=cut, bleed=bleed, grad=((0, top / 2), (chord, top / 2)),
                ends=(yl, yr))


# --------------------------------------------------------------------- PDF ---

def path_ops(path, tf):
    ops = []
    for seg in path:
        if seg[0] == "h":
            ops.append("h")
            continue
        pts = " ".join("%.3f %.3f" % tf(p) for p in seg[1:])
        ops.append("%s %s" % (pts, seg[0]))
    return "\n".join(ops)


def pdf_str(s):
    return "(" + s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"


def write_pdf(path, shape, scale, title, icc_bytes):
    tw, th = shape["trim"]
    pw, ph = (tw + 2 * BLEED) * scale * MM, (th + 2 * BLEED) * scale * MM

    def tf(p):
        return ((p[0] + BLEED) * scale * MM, (p[1] + BLEED) * scale * MM)

    (g0, g1) = shape["grad"]
    trim = [BLEED * scale * MM, BLEED * scale * MM, (tw + BLEED) * scale * MM, (th + BLEED) * scale * MM]

    content = "\n".join([
        "/OC /L0 BDC",
        "q /Pattern cs /P0 scn",
        path_ops(shape["bleed"], tf),
        "f Q",
        "EMC",
        "/OC /L1 BDC",
        "q /GS0 gs /CS0 CS 1 SCN 0.25 w 1 J 1 j",
        path_ops(shape["cut"], tf),
        "S Q",
        "EMC",
    ]).encode()

    objs = {}
    objs[1] = "<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [10 0 R 11 0 R] " \
              "/D << /Order [10 0 R 11 0 R] /ON [10 0 R 11 0 R] >> >>%s >>" % (
                  " /OutputIntents [12 0 R]" if icc_bytes else "")
    objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
    box = "[0 0 %.3f %.3f]" % (pw, ph)
    objs[3] = ("<< /Type /Page /Parent 2 0 R /MediaBox %s /CropBox %s /BleedBox %s /TrimBox [%s] "
               "/Resources << /Pattern << /P0 5 0 R >> /ColorSpace << /CS0 7 0 R >> "
               "/ExtGState << /GS0 9 0 R >> /Properties << /L0 10 0 R /L1 11 0 R >> >> "
               "/Contents 4 0 R >>") % (box, box, box, " ".join("%.3f" % v for v in trim))
    objs[4] = content
    objs[5] = "<< /Type /Pattern /PatternType 2 /Shading 6 0 R /Matrix [1 0 0 1 0 0] >>"
    x0, y0 = tf(g0)
    x1, y1 = tf(g1)
    objs[6] = ("<< /ShadingType 2 /ColorSpace /DeviceCMYK /Coords [%.3f %.3f %.3f %.3f] "
               "/Function << /FunctionType 2 /Domain [0 1] /C0 [%s] /C1 [%s] /N 1 >> "
               "/Extend [true true] >>") % (x0, y0, x1, y1, " ".join(map(str, GREEN[1])),
                                            " ".join(map(str, BLUE[1])))
    objs[7] = "[/Separation /CutContour /DeviceCMYK 8 0 R]"
    objs[8] = "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>"
    objs[9] = "<< /Type /ExtGState /OP true /op true /OPM 1 >>"
    objs[10] = "<< /Type /OCG /Name (Impression) >>"
    objs[11] = "<< /Type /OCG /Name (Decoupe - CutContour) >>"
    if icc_bytes:
        objs[12] = ("<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (FOGRA39) "
                    "/OutputCondition (ISO Coated v2 300% \\(basICColor\\)) "
                    "/RegistryName (http://www.color.org) /DestOutputProfile 13 0 R >>")
        objs[13] = zlib.compress(icc_bytes, 9)
    now = datetime.now(timezone.utc).strftime("D:%Y%m%d%H%M%SZ")
    objs[14] = ("<< /Title %s /Author (MAFI) /Subject %s /Creator (make_floor_prints.py) "
                "/Producer (make_floor_prints.py) /CreationDate (%s) /ModDate (%s) /Trapped /False >>") % (
        pdf_str(title), pdf_str("SIAL 2026 - Hall 7 D327 - floor vinyl"), now, now)

    out = bytearray(b"%PDF-1.6\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for n in sorted(objs):
        offsets[n] = len(out)
        body = objs[n]
        if isinstance(body, bytes):
            extra = " /N 4 /Filter /FlateDecode" if n == 13 else ""
            out += b"%d 0 obj\n<< /Length %d%s >>\nstream\n" % (n, len(body), extra.encode())
            out += body + b"\nendstream\nendobj\n"
        else:
            out += b"%d 0 obj\n" % n + body.encode("latin-1") + b"\nendobj\n"
    xref = len(out)
    size = max(objs) + 1
    out += b"xref\n0 %d\n0000000000 65535 f \n" % size
    for n in range(1, size):
        out += (b"%010d 00000 n \n" % offsets[n]) if n in offsets else b"0000000000 65535 f \n"
    fid = zlib.crc32(title.encode()).to_bytes(4, "big").hex() * 4
    out += (b"trailer\n<< /Size %d /Root 1 0 R /Info 14 0 R /ID [<%s> <%s>] >>\nstartxref\n%d\n%%%%EOF\n"
            % (size, fid.encode(), fid.encode(), xref))
    Path(path).write_bytes(out)


def main():
    out_dir = Path(sys.argv[1])
    icc = Path(sys.argv[2]).read_bytes() if len(sys.argv) > 2 else None
    out_dir.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("MAFI_SIAL26_12_Demi-disque_R1500_x3_ECH1-1", half_disc(), 1.0,
         "MAFI SIAL 2026 - 12 - Demi-disque R1500 - x3 - echelle 1/1"),
        ("MAFI_SIAL26_13_Arc_R9200-R9500_x3_ECH1-10", arc_band(), 0.1,
         "MAFI SIAL 2026 - 13 - Arc R9200/R9500 - x3 - echelle 1/10"),
    ]
    for name, shape, scale, title in jobs:
        for ext in ("ai", "pdf"):
            write_pdf(out_dir / ("%s.%s" % (name, ext)), shape, scale, title, icc)
        tw, th = shape["trim"]
        print("%s  trim %.1f x %.1f mm (real)  file scale %g" % (name, tw, th, scale))
        if "ends" in shape:
            print("   band end heights: %.1f / %.1f mm" % shape["ends"])


if __name__ == "__main__":
    main()
