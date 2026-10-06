"""Grade + upscale the source photos and derive the blurred-background and bloom plates the renderer uses.

usage: python3 tools/prep_images.py <photos_dir> <out_dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

# upscale factor per photo: full-bleed portraits get 2x (they are shown ~1.5-1.7x), the small neon shot 2.5x
UPSCALE = {"01_hug": 2, "02_elevator": 2, "03_bridge": 2, "04_family": 1.5, "08_neon": 2.5, "09_aquarium": 2}
LUMA = np.array([0.2126, 0.7152, 0.0722])


def grade(rgb):
    x = rgb.astype(np.float32) / 255.0
    # soft filmic S-curve, neutral-warm lifted blacks, warm highlights
    x = x - 0.085 * np.sin(2 * np.pi * x) / (2 * np.pi)
    x = x * 0.975 + np.array([0.020, 0.016, 0.013]) * (1 - x) ** 2
    x = x * (1 + np.array([0.022, 0.006, -0.016]) * x ** 2)
    lum = (x @ LUMA)[..., None]
    x = lum + (x - lum) * 1.03
    return np.clip(x, 0, 1)


def save(arr, path, q=93):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, quality=q, subsampling=0)


for p in sorted(src.glob("*.jpg")):
    name = p.stem
    im = Image.open(p).convert("RGB")
    g = grade(np.asarray(im))
    gi = Image.fromarray((g * 255 + 0.5).astype(np.uint8))
    k = UPSCALE.get(name, 1)
    if k != 1:
        gi = gi.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        gi = gi.filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=2))
    gi.save(out / f"{name}.jpg", quality=94, subsampling=0)

    # blurred backdrop plate (small; the canvas scales it up, which only adds softness)
    small = Image.fromarray((g * 255).astype(np.uint8)).resize((180, round(180 * im.height / im.width)), Image.LANCZOS)
    small = small.filter(ImageFilter.GaussianBlur(7)).resize((540, round(540 * im.height / im.width)), Image.BICUBIC)
    small = small.filter(ImageFilter.GaussianBlur(3))
    small.save(out / f"{name}_blur.jpg", quality=90)

    # bloom plate: highlights only, blurred, at quarter res
    q = Image.fromarray((g * 255).astype(np.uint8)).resize((im.width // 3, im.height // 3), Image.LANCZOS)
    a = np.asarray(q).astype(np.float32) / 255
    lum = a @ LUMA
    w = np.clip((lum - 0.58) / 0.42, 0, 1) ** 1.6
    sat = a.max(-1) - a.min(-1)
    w = np.maximum(w, np.clip((sat - 0.45) * 1.5, 0, 1) * np.clip(lum * 1.6, 0, 1) * 0.8)
    # warm film halation: highlights bleed a red-orange glow
    hal = (w[..., None] * (0.55 * a + 0.45 * lum[..., None]) * np.array([1.0, 0.6, 0.4])).clip(0, 1)
    b = Image.fromarray((hal * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9))
    b.save(out / f"{name}_bloom.jpg", quality=90)
    print(name, gi.size)
