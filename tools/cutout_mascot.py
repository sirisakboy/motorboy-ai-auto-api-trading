#!/usr/bin/env python3
"""Cut the mascot out of its background so she can float anywhere on the page.

The hero render ships on a dark circuit-board backdrop; the overlay needs a
transparent PNG. `rembg`/u2net downloads its model from GitHub release assets,
which this sandbox cannot reach, so this uses OpenCV GrabCut instead — good
enough for a high-contrast character and it needs no model file.

Usage:
    python3 tools/cutout_mascot.py <source.jpg> <out.png> [--height 560]

Requires: pillow, opencv-python-headless, numpy

    pip install --break-system-packages pillow opencv-python-headless numpy

The seeds below assume a single standing figure roughly centred in the frame
(the current hero art). For a different composition, adjust the fractions.
"""

from __future__ import annotations

import argparse
import sys

import cv2
import numpy as np
from PIL import Image


def build_mask(image: np.ndarray) -> np.ndarray:
    """Rough foreground/background seeds, then let GrabCut refine them."""
    height, width = image.shape[:2]
    mask = np.full((height, width), cv2.GC_PR_BGD, np.uint8)

    # certain background: the outer frame
    mask[: int(height * 0.02), :] = cv2.GC_BGD
    mask[int(height * 0.99) :, :] = cv2.GC_BGD
    mask[:, : int(width * 0.18)] = cv2.GC_BGD
    mask[:, int(width * 0.88) :] = cv2.GC_BGD

    # probable foreground: the character's body, plus the boots lower down
    mask[int(height * 0.04) : int(height * 0.78), int(width * 0.26) : int(width * 0.82)] = (
        cv2.GC_PR_FGD
    )
    mask[int(height * 0.78) : int(height * 0.80), int(width * 0.30) : int(width * 0.78)] = (
        cv2.GC_PR_FGD
    )

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(image, mask, None, background_model, foreground_model, 8, cv2.GC_INIT_WITH_MASK)

    alpha = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)

    # keep the largest blob only — drops stray specks of "character" in the backdrop
    _, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    if len(stats) > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        alpha = np.where(labels == biggest, 255, 0).astype(np.uint8)

    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(alpha, (0, 0), 1.6)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="opaque JPEG/PNG of the mascot")
    parser.add_argument("output", help="where to write the transparent PNG")
    parser.add_argument("--height", type=int, default=560, help="final height in px (default 560)")
    parser.add_argument("--padding", type=int, default=8, help="transparent padding in px")
    args = parser.parse_args()

    image = cv2.imread(args.source)
    if image is None:
        print(f"cannot read {args.source}", file=sys.stderr)
        return 1

    alpha = build_mask(image)
    b, g, r = cv2.split(image)
    cutout = Image.fromarray(cv2.merge([b, g, r, alpha])[:, :, ::-1])

    left, top, right, bottom = cutout.getchannel("A").getbbox() or (0, 0, *cutout.size)
    pad = args.padding
    box = (
        max(0, left - pad),
        max(0, top - pad),
        min(cutout.width, right + pad),
        min(cutout.height, bottom + pad),
    )
    cropped = cutout.crop(box)
    scale = args.height / cropped.height
    resized = cropped.resize((max(1, int(cropped.width * scale)), args.height), Image.LANCZOS)
    resized.save(args.output, optimize=True)

    coverage = float((np.array(resized)[:, :, 3] > 200).mean()) * 100
    print(f"{args.output}: {resized.width}x{resized.height}, {coverage:.1f}% opaque")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
