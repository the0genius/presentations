# MAFI – SIAL 2026 (Hall 7 D327) – floor prints

Adhesive floor vinyl from the R2 signage dossier, page 4, items 12 and 13.

| File | Item | Scale | Finished size | Qty |
|---|---|---|---|---|
| `MAFI_SIAL26_12_Demi-disque_R1500_x3_ECH1-1.ai` / `.pdf` | 12 – half-disc R 1 500 | 1:1 | 3 000 × 1 500 mm | 3 |
| `MAFI_SIAL26_13_Arc_R9200-R9500_x3_ECH1-10.ai` / `.pdf` | 13 – arc band R 9 200 / R 9 500 | **1:10 – print at 1000 %** | 10 000 × 1 777 mm | 3 (plan shows 2 – to confirm) |
| `MAFI_SIAL26_Floor-prints_spec-sheet.pdf` | spec sheet for the printer | – | – | – |

- MAFI gradient #009C49 → #045976, linear, left to right as drawn.
  In CMYK ISO Coated v2 300 % (FOGRA39), relative colorimetric: C84 M7 Y94 K1 → C95 M51 Y31 K28.
- 100 % vector, 20 mm bleed (real size), cut line in spot colour `CutContour` (0.25 pt, overprint) on its own layer.
- The `.ai` files are PDF-based (the format Illustrator writes with "Create PDF Compatible File") and open in Illustrator.

Regenerate: `python3 src/make_floor_prints.py . ISOcoated_v2_300_bas.icc && python3 src/make_spec_sheet.py MAFI_SIAL26_Floor-prints_spec-sheet.pdf`
