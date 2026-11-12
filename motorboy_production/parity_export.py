#!/usr/bin/env python3
"""parity_export.py — ส่งออก "ผลเฉลย" จาก reference implementation (Python)

ทำไมต้องมี: ฝั่งแอปรันด้วย TypeScript (`src/fusion/`) แต่ต้นฉบับสูตรอยู่ที่
`02_whale.py` ถ้าใครแก้ฝั่งใดฝั่งหนึ่งแล้วอีกฝั่งไม่ตาม เราต้องรู้ทันที
ไฟล์นี้จึงสุ่มเคส (seed คงที่ = ผลซ้ำได้) แล้วเขียนผลของ Python ลงเป็น fixture
ให้ vitest ตรวจ parity

รันซ้ำเมื่อไหร่: หลังแก้สูตร/สเกล/น้ำหนัก ฝั่งใดฝั่งหนึ่ง

    python motorboy_production/parity_export.py
    npx vitest run src/__tests__/fusionWhale.test.ts

ไฟล์ผลลัพธ์: src/__tests__/fixtures/fusion-parity.json
"""

from __future__ import annotations

import importlib.util
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "motorboy_production" / "02_whale.py"
OUTPUT_PATH = ROOT / "src" / "__tests__" / "fixtures" / "fusion-parity.json"

CASE_COUNT = 40
SEED = 20261110
ASSET_TYPES = ("crypto", "stock", "forex", "gold_index", "default")


def load_whale():
    """โหลด 02_whale.py (ชื่อไฟล์ขึ้นต้นด้วยเลข import ตรง ๆ ไม่ได้)"""
    spec = importlib.util.spec_from_file_location("motorboy_whale_reference", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["motorboy_whale_reference"] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def make_mock(whale, asset: str, rng: random.Random) -> dict[str, object]:
    """สร้าง mock ที่บางเคส "ข้อมูลไม่ครบ" และบางเคสส่งมาเป็น string พร้อมหน่วย"""
    profile = whale.PROFILES[asset]
    keep = rng.randint(1, len(profile))
    chosen = rng.sample(list(profile), keep)

    mock: dict[str, object] = {}
    for field in chosen:
        key = field.keys[0]
        if field.unit == "enum":
            mock[key] = rng.choice([name for name, _ in field.enum_map])
            continue

        spread = rng.choice([0.1, 0.3, 0.6, 1.0, 1.4])  # รวมเคสที่เกินสเกล (ถูก clamp)
        value = rng.uniform(-spread, spread) * field.scale
        if field.center:
            value = field.center + value
        value = round(value, 6)

        if rng.random() < 0.15:  # จำลองค่าที่ API ส่งมาเป็นข้อความ
            mock[key] = f"${value:,.2f}" if field.unit == "usd" else f"{value:.2f}%"
        else:
            mock[key] = value
    return mock


def main() -> int:
    whale = load_whale()
    rng = random.Random(SEED)
    cases = []

    for index in range(CASE_COUNT):
        asset = ASSET_TYPES[index % len(ASSET_TYPES)]
        mock = make_mock(whale, asset, rng)
        detail = whale.describe_flow("SWEEP", asset, mock)
        signal = detail["signal"]
        cases.append(
            {
                "name": f"sweep-{index:02d}-{asset}",
                "assetType": asset,
                "data": mock,
                "score": signal.score,
                "confidence": signal.confidence,
                "total": round(detail["total"], 6),
                "coverage": round(detail["coverage"], 6),
                "agreement": round(detail["agreement"], 6),
                "reason": signal.reason,
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"✅ เขียน {len(cases)} เคส -> {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
