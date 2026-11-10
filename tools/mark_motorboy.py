#!/usr/bin/env python3
"""Generate the MotorBoy app mark — one geometry, vector and raster.

    python3 tools/mark_motorboy.py

Writes into public/brand/:
    motorboy-mark.svg        lavender tile + ink monogram (primary)
    motorboy-mark-mono.svg   same shape in currentColor
    motorboy-mark-512.png    store / app icon
    motorboy-mark-64.png     favicon / small contexts

The mark is pure geometry on a 100 × 100 grid, so it needs no font and no SVG
rasteriser: the PNGs are drawn from the same polygon the SVG uses.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "brand"
SURF = (15, 17, 23, 255)
LAV_TOP = (142, 128, 255)
LAV_BOTTOM = (124, 108, 255)

# 100 × 100 grid: bold angular M with the vertex sitting on the baseline.
M_PATH = "M18 82V20H31L50 56L69 20H82V82H67V44L50 74L33 44V82Z"
M_POLY = [(18, 82), (18, 20), (31, 20), (50, 56), (69, 20), (82, 20), (82, 82),
          (67, 82), (67, 44), (50, 74), (33, 44), (33, 82)]

SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img"
     aria-label="MotorBoy">
  <!-- Ink on lavender is #0F1117 — never white on lavender (Brand Book AA rule). -->
  <defs>
    <linearGradient id="mb-lav" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#{LAV_TOP[0]:02X}{LAV_TOP[1]:02X}{LAV_TOP[2]:02X}"/>
      <stop offset="1" stop-color="#{LAV_BOTTOM[0]:02X}{LAV_BOTTOM[1]:02X}{LAV_BOTTOM[2]:02X}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="27" fill="url(#mb-lav)"/>
  <path d="{M_PATH}" fill="#0F1117"/>
</svg>
"""

MONO_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img"
     aria-label="MotorBoy">
  <rect width="100" height="100" rx="27" fill="currentColor" opacity="0.14"/>
  <path d="{M_PATH}" fill="currentColor"/>
</svg>
"""


def render(size: int, radius_ratio: float = 0.27, pad_ratio: float = 0.16) -> Image.Image:
    """Supersampled PNG of the mark, drawn from the same polygon as the SVG."""
    res = 4
    px = size * res
    image = Image.new("RGBA", (px, px), (0, 0, 0, 0))

    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, px - 1, px - 1], radius=px * radius_ratio, fill=255
    )
    gradient = Image.new("RGBA", (1, px))
    for y in range(px):
        t = y / max(1, px - 1)
        gradient.putpixel(
            (0, y),
            tuple(int(LAV_TOP[i] + (LAV_BOTTOM[i] - LAV_TOP[i]) * t) for i in range(3)) + (255,),
        )
    image.paste(gradient.resize((px, px)), (0, 0), mask)

    pad = px * pad_ratio
    scale = (px - 2 * pad) / 100.0
    ImageDraw.Draw(image).polygon(
        [(pad + x * scale, pad + y * scale) for x, y in M_POLY], fill=SURF
    )
    return image.resize((size, size), Image.LANCZOS)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "motorboy-mark.svg").write_text(SVG)
    (OUT / "motorboy-mark-mono.svg").write_text(MONO_SVG)
    render(512).save(OUT / "motorboy-mark-512.png", optimize=True)
    render(64).save(OUT / "motorboy-mark-64.png", optimize=True)
    print("wrote", ", ".join(sorted(p.name for p in OUT.glob("motorboy-mark*"))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
