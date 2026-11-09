#!/usr/bin/env python3
"""Cut the mascot (or a logo lockup) out of its background into a transparent PNG.

Two modes:

  --bg white   render on a near-white backdrop (character art). Alpha is the
               colour distance from white, ramped over a small band, so light
               skin and highlights stay opaque.

  --bg flat    flat vector art on white (logo lockups). Colour-to-alpha with the
               ink's own core darkness normalised out, which keeps the wordmark
               solid and the anti-aliased edges halo-free.

  --bg photo   anything else (the old circuit-board hero). Uses OpenCV GrabCut
               with the seeds below, which assume one standing figure roughly
               centred in the frame.

`rembg`/u2net would be nicer, but its model lives on GitHub release assets, which
this sandbox cannot reach, so both paths are model-free.

Usage:
    python3 tools/cutout_mascot.py <source> <out.png> [--bg white|photo]
                                   [--height 720 | --width 1200] [--padding 8]

Requires: pillow, opencv-python-headless, numpy
    pip install --break-system-packages pillow opencv-python-headless numpy
"""

from __future__ import annotations

import argparse
import sys

import cv2
import numpy as np
from PIL import Image


def white_background_alpha(image: np.ndarray, t0: float = 10.0, t1: float = 44.0) -> np.ndarray:
    """Rendered character on white: ramp the colour distance from white.

    Unlike the max-channel formula below this keeps skin tones (≈230,200,180)
    fully opaque — they are far from white, just not *dark*.
    """
    distance = np.sqrt(((255.0 - image) ** 2).sum(axis=2))
    return np.clip((distance - t0) / (t1 - t0), 0.0, 1.0)


def flat_background_alpha(image: np.ndarray) -> np.ndarray:
    """Flat logo art on white: colour-to-alpha, ink normalised to full opacity."""
    alpha = np.clip(((255.0 - image) / 255.0).max(axis=2), 0.0, 1.0)
    alpha = np.where(alpha < 0.06, 0.0, alpha)

    # Dark-but-not-black ink (#231F20) only ever reaches ~0.88 with the raw
    # formula. Normalise by the ink's core level so flat areas are fully opaque.
    ink = alpha[alpha > 0.3]
    core = float(np.percentile(ink, 90)) if ink.size else 1.0
    normalised = np.clip(alpha / max(core, 1e-3), 0.0, 1.0)
    return np.where(alpha == 0, 0.0, normalised)


def photo_background_alpha(image: np.ndarray) -> np.ndarray:
    """GrabCut matte for busy photographic backdrops."""
    height, width = image.shape[:2]
    mask = np.full((height, width), cv2.GC_PR_BGD, np.uint8)

    mask[: int(height * 0.02), :] = cv2.GC_BGD
    mask[int(height * 0.99) :, :] = cv2.GC_BGD
    mask[:, : int(width * 0.18)] = cv2.GC_BGD
    mask[:, int(width * 0.88) :] = cv2.GC_BGD
    mask[int(height * 0.04) : int(height * 0.78), int(width * 0.26) : int(width * 0.82)] = (
        cv2.GC_PR_FGD
    )
    mask[int(height * 0.78) : int(height * 0.80), int(width * 0.30) : int(width * 0.78)] = (
        cv2.GC_PR_FGD
    )

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        image.astype(np.uint8), mask, None, background_model, foreground_model, 8, cv2.GC_INIT_WITH_MASK
    )

    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1.0, 0.0)
    binary = (alpha * 255).astype(np.uint8)
    _, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if len(stats) > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        binary = np.where(labels == biggest, 255, 0).astype(np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(binary, (0, 0), 1.6).astype(np.float64) / 255.0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="opaque render of the mascot or logo")
    parser.add_argument("output", help="where to write the transparent PNG")
    parser.add_argument("--bg", choices=("white", "flat", "photo"), default="white")
    parser.add_argument("--height", type=int, help="resize to this height in px")
    parser.add_argument("--width", type=int, help="resize to this width in px")
    parser.add_argument("--padding", type=int, default=8, help="transparent padding in px")
    args = parser.parse_args()

    bgr = cv2.imread(args.source, cv2.IMREAD_COLOR)
    if bgr is None:
        print(f"cannot read {args.source}", file=sys.stderr)
        return 1
    rgb = bgr[:, :, ::-1].astype(np.float32)

    if args.bg == "white":
        alpha = white_background_alpha(rgb)
    elif args.bg == "flat":
        alpha = flat_background_alpha(rgb)
    else:
        alpha = photo_background_alpha(rgb)

    # Un-premultiply: P = a*F + (1-a)*255  ->  F = (P - (1-a)*255) / a
    safe = np.maximum(alpha, 1e-3)[..., None]
    foreground = np.clip((rgb - (1.0 - safe) * 255.0) / safe, 0, 255)

    rgba = np.dstack([foreground, alpha * 255.0]).astype(np.uint8)
    cutout = Image.fromarray(rgba, "RGBA")

    bbox = cutout.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        pad = args.padding
        cutout = cutout.crop(
            (
                max(0, bbox[0] - pad),
                max(0, bbox[1] - pad),
                min(cutout.width, bbox[2] + pad),
                min(cutout.height, bbox[3] + pad),
            )
        )

    if args.height:
        cutout = cutout.resize(
            (max(1, int(cutout.width * args.height / cutout.height)), args.height), Image.LANCZOS
        )
    elif args.width:
        cutout = cutout.resize(
            (args.width, max(1, int(cutout.height * args.width / cutout.width))), Image.LANCZOS
        )

    cutout.save(args.output, optimize=True)
    coverage = float((np.array(cutout)[:, :, 3] > 200).mean()) * 100
    print(f"{args.output}: {cutout.width}x{cutout.height}, {coverage:.1f}% opaque")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
