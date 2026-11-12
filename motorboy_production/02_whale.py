#!/usr/bin/env python3
"""02_whale.py — โมดูล "เงินใหญ่" (Whale / Money Flow) แบบ UNIVERSAL

แนวคิด: คำว่า "วาฬ" ในที่นี้ = เงินใหญ่ของสินทรัพย์นั้น ๆ ไม่ใช่แค่คริปโต

    crypto     -> Exchange Inflow/Outflow, Stablecoin, Funding, OI, Tx ใหญ่
    stock      -> Fund Flow / สถาบัน, Block Trade, Insider, Short Interest
    forex      -> COT Positioning, Bank Flow, Central Bank Bias, ดอกเบี้ยคาดหวัง
    gold_index -> ETF Flow, Fund Flow, ธนาคารกลางซื้อทอง, Futures Net Long

กฎที่ไฟล์นี้ยึด:
  · ไม่มีชื่อเหรียญ/หุ้น/คู่เงินใด ๆ ใน logic — รับ symbol/asset_type เป็น parameter
  · ทิศทางทั้งหมดถูกแปลงเป็นหน่วย [-1, +1] ก่อน แล้วค่อยรวมเป็น score -2..+2
  · ข้อมูลไม่ครบ = มั่นใจต่ำ (ไม่ใช่เดาให้มั่นใจสูง)
  · ไม่เรียก API จริง: รับ mock_data เข้ามา (ต่อ API ทีหลังโดยไม่แตะ scoring)

วิธีรัน:
    python motorboy_production/02_whale.py --symbol BTCUSDT --asset_type crypto
    python motorboy_production/02_whale.py --symbol AAPL --asset_type stock --bias bear
    python motorboy_production/02_whale.py --symbol EURUSD --asset_type forex --json
    python motorboy_production/02_whale.py --symbol XAUUSD --asset_type gold --mock flow.json
    python motorboy_production/02_whale.py --schema            # ดู field ที่รองรับ
    python motorboy_production/02_whale.py --selftest          # เทสทุกสินทรัพย์

ผลลัพธ์: ModuleSignal(score -2..+2, confidence 0-100, reason ภาษาไทย, source)
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

# ให้รันได้ทั้งแบบ `python 02_whale.py` และถูกโหลดด้วย importlib จาก main.py
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

try:  # ถ้ารีโปมี fusion_core.py (Production, frozen) ให้ใช้ interface จากที่นั่นก่อน
    from fusion_core import ModuleSignal  # type: ignore
except Exception:  # ยังไม่มี -> ใช้สำเนา interface ที่แช่แข็งไว้ใน signals.py
    from signals import ModuleSignal  # type: ignore

try:
    from signals import DEFAULT_ASSET_TYPE, canonical_asset_type  # type: ignore
except Exception:  # pragma: no cover - fusion_core อาจมี helper พวกนี้อยู่แล้ว

    def canonical_asset_type(raw: Any) -> str:  # type: ignore[no-redef]
        """fallback แบบง่าย: ไม่รู้จัก = default"""
        key = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
        return {
            "crypto": "crypto",
            "crypto_major": "crypto",
            "crypto_meme": "crypto",
            "stock": "stock",
            "th": "stock",  # แท็บหุ้นไทยของแอป
            "thai_stock": "stock",
            "thai_stocks": "stock",
            "us": "stock",  # แท็บหุ้นนอกของแอป
            "us_stock": "stock",
            "foreign_stocks": "stock",
            "forex": "forex",
            "fx": "forex",
            "gold": "gold_index",
            "gold_index": "gold_index",
            "index": "gold_index",
            "indices": "gold_index",
        }.get(key, "default")

    DEFAULT_ASSET_TYPE = "default"


# --------------------------------------------------------------- field schema


@dataclass(frozen=True)
class FlowField:
    """ตัวชี้วัดโฟลว์ 1 ตัว

    keys      : ชื่อ field ที่ยอมรับใน mock_data (เรียงจากชื่อหลัก -> ชื่อสำรอง)
    label_th  : ป้ายภาษาไทยสั้น ๆ ที่จะโผล่ใน reason
    scale     : ค่าที่ถือว่า "สุดทาง" (saturate) ของตัวชี้วัดนั้น
    center    : ค่ากลาง (ใช้กับ ratio ที่ปกติอยู่ 0..1 เช่น 0.5)
    invert    : True = ค่าติดลบเป็น bullish (เช่น เงินไหลออกจาก Exchange)
    weight    : น้ำหนักภายในโมดูล (ไม่ใช่ weight ของ Fusion — คนละชั้น)
    unit      : usd | pct | ratio | count | enum (ใช้ตอนพิมพ์ค่า)
    enum_map  : สำหรับข้อมูลเชิงคุณภาพ เช่น hawkish/dovish
    """

    keys: tuple[str, ...]
    label_th: str
    scale: float
    weight: float = 1.0
    center: float = 0.0
    invert: bool = False
    unit: str = "usd"
    enum_map: tuple[tuple[str, float], ...] = ()


@dataclass(frozen=True)
class Reading:
    """ผลอ่านตัวชี้วัด 1 ตัว: ค่าดิบ + ค่าที่ normalize แล้ว (-1..+1)"""

    field: FlowField
    raw: Any
    unit_value: float


# ------------------------------------------------------- profiles by asset type
# ห้ามใช้ชื่อสินทรัพย์เป็นตัวเลือก — เลือกจาก asset_type เท่านั้น (สเปกข้อ 5)

CRYPTO_FIELDS: tuple[FlowField, ...] = (
    FlowField(
        keys=("exchange_netflow_usd", "exchange_net_flow_usd", "netflow_usd"),
        label_th="เงินเข้า-ออก Exchange",
        scale=20_000_000,
        weight=1.5,
        invert=True,  # ไหลออก = เก็บของ = bullish
    ),
    FlowField(
        keys=("stablecoin_inflow_usd", "stablecoin_exchange_inflow_usd"),
        label_th="Stablecoin เข้า Exchange",
        scale=50_000_000,
        weight=1.0,
    ),
    FlowField(
        keys=("large_tx_net_buy_ratio", "whale_buy_ratio"),
        label_th="สัดส่วน Tx ใหญ่ฝั่งซื้อ",
        scale=0.5,
        center=0.5,
        weight=1.0,
        unit="ratio",
    ),
    FlowField(
        keys=("funding_rate_pct", "funding_rate"),
        label_th="Funding Rate",
        scale=0.05,
        weight=0.7,
        invert=True,  # funding สูง = long แน่น = เสี่ยงพักฐาน
        unit="pct",
    ),
    FlowField(
        keys=("open_interest_change_pct", "oi_change_pct"),
        label_th="OI เปลี่ยน",
        scale=10.0,
        weight=0.5,
        unit="pct",
    ),
)

STOCK_FIELDS: tuple[FlowField, ...] = (
    FlowField(
        keys=("institutional_net_buy_usd", "fund_flow_usd", "foreign_net_buy_usd"),
        label_th="Fund Flow สถาบัน",
        scale=10_000_000,
        weight=1.5,
    ),
    FlowField(
        keys=("block_trade_premium_pct", "block_trade_pct"),
        label_th="Block Trade ส่วนเกิน",
        scale=2.0,
        weight=1.0,
        unit="pct",
    ),
    FlowField(
        keys=("insider_net_buy_usd", "insider_buy_usd"),
        label_th="Insider ซื้อสุทธิ",
        scale=2_000_000,
        weight=0.8,
    ),
    FlowField(
        keys=("short_interest_change_pct", "short_change_pct"),
        label_th="Short Interest เปลี่ยน",
        scale=20.0,
        weight=0.6,
        invert=True,  # short เพิ่ม = เงินใหญ่เดิมพันขาลง
        unit="pct",
    ),
)

FOREX_FIELDS: tuple[FlowField, ...] = (
    FlowField(
        keys=("cot_net_position_pct", "cot_net_pct"),
        label_th="COT Net Position",
        scale=30.0,
        weight=1.5,
        unit="pct",
    ),
    FlowField(
        keys=("central_bank_bias", "cb_bias"),
        label_th="ท่าทีธนาคารกลาง",
        scale=1.0,
        weight=1.2,
        unit="enum",
        enum_map=(("hawkish", 1.0), ("neutral", 0.0), ("dovish", -1.0)),
    ),
    FlowField(
        keys=("bank_flow_usd", "bank_flow"),
        label_th="Bank Flow",
        scale=1_000_000_000,
        weight=1.0,
    ),
    FlowField(
        keys=("rate_expectation_change_bp", "rate_change_bp"),
        label_th="ดอกเบี้ยคาดหวัง",
        scale=25.0,
        weight=0.7,
        unit="count",
    ),
)

GOLD_INDEX_FIELDS: tuple[FlowField, ...] = (
    FlowField(
        keys=("etf_net_flow_usd", "etf_flow_usd"),
        label_th="ETF Flow",
        scale=500_000_000,
        weight=1.5,
    ),
    FlowField(
        keys=("fund_flow_index", "fund_flow"),
        label_th="Fund Flow Index",
        scale=60.0,
        weight=1.0,
        unit="count",
    ),
    FlowField(
        keys=("central_bank_gold_buy_tonnes", "cb_gold_buy_tonnes"),
        label_th="ธนาคารกลางซื้อทอง",
        scale=30.0,
        weight=1.0,
        invert=True,  # ขายทอง = ลบ ... ค่าบวก (ซื้อ) = bullish
        unit="count",
    ),
    FlowField(
        keys=("futures_net_long_change_pct", "net_long_change_pct"),
        label_th="Futures Net Long เปลี่ยน",
        scale=15.0,
        weight=0.6,
        unit="pct",
    ),
)

DEFAULT_FIELDS: tuple[FlowField, ...] = (
    FlowField(keys=("net_flow_usd", "netflow_usd"), label_th="Net Flow", scale=10_000_000),
    FlowField(
        keys=("positioning_change_pct", "positioning_pct"),
        label_th="Positioning เปลี่ยน",
        scale=20.0,
        weight=0.8,
        unit="pct",
    ),
    FlowField(
        keys=("large_tx_net_buy_ratio", "whale_buy_ratio"),
        label_th="สัดส่วนไม้ใหญ่ฝั่งซื้อ",
        scale=0.5,
        center=0.5,
        weight=0.8,
        unit="ratio",
    ),
)

PROFILES: dict[str, tuple[FlowField, ...]] = {
    "crypto": CRYPTO_FIELDS,
    "stock": STOCK_FIELDS,
    "forex": FOREX_FIELDS,
    "gold_index": GOLD_INDEX_FIELDS,
    DEFAULT_ASSET_TYPE: DEFAULT_FIELDS,
}

# ใช้เป็น source ของ ModuleSignal (บอกว่าอ่านข้อมูลจากชั้นไหน)
PROFILE_SOURCE: dict[str, str] = {
    "crypto": "on-chain: exchange netflow, stablecoin, OI, funding",
    "stock": "institutional: fund flow, block trade, insider, short interest",
    "forex": "positioning: COT, bank flow, central bank, rate expectations",
    "gold_index": "fund flow: ETF, fund index, central bank, futures",
    DEFAULT_ASSET_TYPE: "generic money flow",
}

# เกณฑ์แปลงคะแนน [-1..+1] -> score [-2..+2] (deadzone กันสัญญาณรบกวน)
DEADZONE = 0.15
STRONG_AT = 0.45


# ------------------------------------------------------------------- utilities


def _clamp(value: float, low: float, high: float) -> float:
    """จำกัดค่าให้อยู่ในช่วง [low, high]"""
    return low if value < low else high if value > high else value


def _to_float(value: Any) -> float | None:
    """แปลงเป็น float แบบทนมือ: รับ '$12.5M', '3.5%', '1,200', True/False ปัดทิ้ง"""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().replace(",", "").replace("%", "").replace("$", "")
        multiplier = 1.0
        if text[-1:].upper() in {"K", "M", "B"} and len(text) > 1:
            multiplier = {"K": 1_000.0, "M": 1_000_000.0, "B": 1_000_000_000.0}[text[-1].upper()]
            text = text[:-1]
        try:
            return float(text) * multiplier
        except ValueError:
            return None
    return None


def _unit_from_enum(raw: Any, enum_map: Sequence[tuple[str, float]]) -> float | None:
    """แปลงข้อมูลเชิงคุณภาพ (hawkish/dovish) เป็นตัวเลข -1..+1"""
    if not enum_map:
        return None
    key = str(raw or "").strip().lower()
    for name, value in enum_map:
        if name == key:
            return _clamp(float(value), -1.0, 1.0)
    return None


def _field_value(field: FlowField, mock: Mapping[str, Any]) -> Any | None:
    """หยิบค่าจาก mock_data ตามชื่อที่รองรับ (ชื่อแรกที่มีค่าไม่ None ชนะ)"""
    for key in field.keys:
        if key in mock and mock[key] is not None:
            return mock[key]
    return None


def read_fields(fields: Iterable[FlowField], mock: Mapping[str, Any]) -> list[Reading]:
    """อ่านทุกตัวชี้วัดที่ "มีข้อมูลจริง" — ตัวที่ไม่มีข้อมูลถูกข้าม (ไม่เดา)"""
    readings: list[Reading] = []
    for field in fields:
        raw = _field_value(field, mock)
        if raw is None:
            continue
        if field.unit == "enum":
            unit_value = _unit_from_enum(raw, field.enum_map)
            if unit_value is None:
                continue
        else:
            number = _to_float(raw)
            if number is None:
                continue
            unit_value = _clamp((number - field.center) / field.scale, -1.0, 1.0)
            if field.invert:
                unit_value = -unit_value
        readings.append(Reading(field=field, raw=raw, unit_value=unit_value))
    return readings


def compose(readings: Sequence[Reading], fields: Sequence[FlowField]) -> tuple[float, float, float]:
    """รวมทุกตัวชี้วัดเป็น (total, coverage, agreement)

    total     : -1..+1 (ทิศทางเงินใหญ่สุทธิ)
    coverage  : 0..1 สัดส่วนน้ำหนักที่มีข้อมูลจริง
    agreement : 0..1 ตัวชี้วัดไปทางเดียวกันแค่ไหน (1 = เห็นตรงกันหมด)
    """
    if not readings:
        return 0.0, 0.0, 0.0
    total_weight = sum(f.weight for f in fields) or 1.0
    present_weight = sum(r.field.weight for r in readings) or 1.0
    weighted = sum(r.field.weight * r.unit_value for r in readings)
    abs_weighted = sum(r.field.weight * abs(r.unit_value) for r in readings)
    total = _clamp(weighted / present_weight, -1.0, 1.0)
    coverage = _clamp(present_weight / total_weight, 0.0, 1.0)
    agreement = 0.0 if abs_weighted == 0 else _clamp(abs(weighted) / abs_weighted, 0.0, 1.0)
    return total, coverage, agreement


def score_from_total(total: float) -> int:
    """แปลง total [-1..+1] เป็น score -2..+2 (มี deadzone กันสัญญาณรบกวน)"""
    if total >= STRONG_AT:
        return 2
    if total >= DEADZONE:
        return 1
    if total <= -STRONG_AT:
        return -2
    if total <= -DEADZONE:
        return -1
    return 0


def confidence_from(total: float, coverage: float, agreement: float) -> int:
    """ความมั่นใจ 0-100: แรง + ข้อมูลครบ + เห็นตรงกัน (ข้อมูลไม่ครบถูกลงโทษ)"""
    magnitude = abs(total)
    raw = 100.0 * (0.55 * magnitude + 0.30 * coverage * agreement + 0.15 * coverage)
    return int(round(_clamp(raw, 0.0, 100.0)))


def _money(value: float) -> str:
    """พิมพ์จำนวนเงินแบบอ่านง่าย ($1.2B / $18.0M / -$450K)"""
    sign = "-" if value < 0 else ""
    size = abs(value)
    if size >= 1_000_000_000:
        return f"{sign}${size / 1_000_000_000:.2f}B"
    if size >= 1_000_000:
        return f"{sign}${size / 1_000_000:.1f}M"
    if size >= 1_000:
        return f"{sign}${size / 1_000:.0f}K"
    return f"{sign}${size:.0f}"


def format_value(reading: Reading) -> str:
    """พิมพ์ค่าดิบของตัวชี้วัดตามหน่วยของมัน (ใช้ใน reason และตาราง)"""
    if reading.field.unit == "enum":
        return str(reading.raw).strip().lower()
    number = _to_float(reading.raw)
    if number is None:
        return str(reading.raw)
    if reading.field.unit == "usd":
        return _money(number)
    if reading.field.unit == "pct":
        return f"{number:+.2f}%"
    if reading.field.unit == "ratio":
        return f"{number:.2f}"
    return f"{number:+.0f}"


def build_reason(readings: Sequence[Reading], total: float, coverage: float) -> str:
    """สร้างเหตุผลภาษาไทยสั้น ๆ จากตัวชี้วัดที่ "เด่นที่สุด" """
    if not readings:
        return "ยังไม่มีข้อมูลโฟลว์เงินใหญ่ — ขอเป็นกลางก่อน"

    dominant = max(readings, key=lambda r: r.field.weight * abs(r.unit_value))
    if total >= STRONG_AT:
        verb = "เงินใหญ่เข้าของชัด"
    elif total >= DEADZONE:
        verb = "เงินใหญ่เริ่มเข้าของ"
    elif total <= -STRONG_AT:
        verb = "เงินใหญ่เทขายหนัก"
    elif total <= -DEADZONE:
        verb = "เงินใหญ่เริ่มเทขาย"
    else:
        verb = "เงินใหญ่ยังไม่ชัด"

    reason = f"{verb}: {dominant.field.label_th} {format_value(dominant)}"
    if coverage < 0.6:
        reason += f" (ข้อมูลครบ {int(round(coverage * 100))}%)"
    return reason[:200]


# ------------------------------------------------------------------ public API


def analyze_flow(
    symbol: str,
    asset_type: str,
    mock_data: Mapping[str, Any] | None = None,
) -> ModuleSignal:
    """อ่านโฟลว์เงินใหญ่ของสินทรัพย์ใด ๆ แล้วคืน ModuleSignal

    symbol     : ชื่อสินทรัพย์ เช่น BTCUSDT / AAPL / EURUSD / XAUUSD / SET50
    asset_type : crypto | stock | forex | gold_index (+ alias และ 'default')
    mock_data  : dict ข้อมูลดิบตาม schema ของ asset_type (None = ยังไม่ต่อ API)
    """
    asset = canonical_asset_type(asset_type)
    profile = PROFILES.get(asset, DEFAULT_FIELDS)
    symbol_text = str(symbol or "").strip().upper()
    if not symbol_text:
        raise ValueError("ต้องระบุ symbol (ห้ามล็อกชื่อสินทรัพย์ในโค้ด)")

    if not mock_data:
        return ModuleSignal(
            symbol=symbol_text,
            asset_type=asset,
            score=0,
            confidence=0,
            reason="ยังไม่มีข้อมูลโฟลว์เงินใหญ่ — ยังไม่ต่อ API (ใช้ Mock Data ก่อน)",
            source=f"whale:{asset}:no-data",
        )

    readings = read_fields(profile, mock_data)
    total, coverage, agreement = compose(readings, profile)
    return ModuleSignal(
        symbol=symbol_text,
        asset_type=asset,
        score=score_from_total(total),
        confidence=confidence_from(total, coverage, agreement),
        reason=build_reason(readings, total, coverage),
        source=f"whale:{asset}:{PROFILE_SOURCE.get(asset, 'generic money flow')}",
    )


def describe_flow(
    symbol: str, asset_type: str, mock_data: Mapping[str, Any] | None
) -> dict[str, Any]:
    """คืนข้อมูลเชิงลึกสำหรับพิมพ์ตาราง (ใช้ใน CLI/เทส) — ไม่ใช่ interface หลัก"""
    asset = canonical_asset_type(asset_type)
    profile = PROFILES.get(asset, DEFAULT_FIELDS)
    readings = read_fields(profile, mock_data or {})
    total, coverage, agreement = compose(readings, profile)
    return {
        "asset_type": asset,
        "signal": analyze_flow(symbol, asset_type, mock_data),
        "readings": readings,
        "total": total,
        "coverage": coverage,
        "agreement": agreement,
    }


# ----------------------------------------------------------------- mock maker

_BIAS_DIRECTION = {"bull": 1, "bear": -1}


def sample_mock(asset_type: str, bias: str = "bull") -> dict[str, Any]:
    """สร้าง mock_data ตัวอย่างตาม asset_type (ไม่ผูกกับชื่อสินทรัพย์ใด ๆ)"""
    asset = canonical_asset_type(asset_type)
    profile = PROFILES.get(asset, DEFAULT_FIELDS)
    strength = 0.95 if bias in _BIAS_DIRECTION else 0.10
    direction = _BIAS_DIRECTION.get(bias, 1)

    data: dict[str, Any] = {}
    for index, field in enumerate(profile):
        key = field.keys[0]
        if field.unit == "enum":
            # neutral -> เลือกค่าที่ใกล้ 0 ที่สุด (ไม่ยัด hawkish/dovish ให้เป็นกลาง)
            if bias not in _BIAS_DIRECTION:
                best = min(field.enum_map, key=lambda item: abs(item[1]), default=("neutral", 0.0))
            else:
                best = max(field.enum_map, key=lambda item: item[1] * direction, default=("neutral", 0.0))
            data[key] = best[0]
            continue
        # neutral: สลับเครื่องหมายไปมาเพื่อให้ total ใกล้ 0 (ไม่ใช่เดาให้มั่นใจ)
        sign = direction if bias in _BIAS_DIRECTION else (1 if index % 2 == 0 else -1)
        jitter = 0.90 + 0.05 * (index % 3)
        unit_value = sign * strength * jitter
        raw = unit_value * field.scale
        if field.invert:
            raw = -raw
        if field.center:
            raw = field.center + raw
        data[key] = round(raw, 6)
    return data


# ------------------------------------------------------------------------ CLI


def _print_schema() -> None:
    """พิมพ์ schema ของทุก asset_type ให้ทีมต่อ API รู้ว่าต้องส่งอะไร"""
    print("🐋 02_WHALE — field ที่รองรับ (ส่งมาเฉพาะตัวที่มีข้อมูลได้)")
    for asset, fields in PROFILES.items():
        print(f"\n[{asset}]  source: {PROFILE_SOURCE[asset]}")
        for field in fields:
            flags = []
            if field.invert:
                flags.append("invert")
            if field.center:
                flags.append(f"center={field.center}")
            suffix = f"  ({', '.join(flags)})" if flags else ""
            print(f"  - {field.keys[0]:<32} {field.label_th}{suffix}")


def _print_breakdown(detail: Mapping[str, Any]) -> None:
    """พิมพ์ตารางตัวชี้วัดที่อ่านได้ + แท่งทิศทาง (−1..+1)"""
    readings: Sequence[Reading] = detail["readings"]
    print("-" * 62)
    for reading in readings:
        bar_len = int(round(abs(reading.unit_value) * 10))
        bar = ("+" if reading.unit_value >= 0 else "-") * bar_len
        print(
            f"  {reading.field.label_th:<28} {format_value(reading):>12}  "
            f"[{bar:<10}] {reading.unit_value:+.2f}"
        )
    missing = [f.label_th for f in PROFILES[detail["asset_type"]] if f not in {r.field for r in readings}]
    if missing:
        print(f"  (ไม่มีข้อมูล: {', '.join(missing)})")
    print("-" * 62)


def _print_signal(signal: ModuleSignal) -> None:
    """พิมพ์สรุป ModuleSignal แบบอ่านง่าย"""
    score_text = f"{signal.score:+d} / 2"
    print(f"  คะแนนเงินใหญ่ : {score_text:<8} ({signal.direction})")
    print(f"  ความมั่นใจ    : {signal.confidence}%")
    print(f"  เหตุผล        : {signal.reason}")
    print(f"  source        : {signal.source}")


def main(argv: Sequence[str] | None = None) -> int:
    """entry point ของ CLI — ใช้ mock data เท่านั้น (ยังไม่ต่อ API จริง)"""
    parser = argparse.ArgumentParser(
        description="MotorBoy 02_WHALE — อ่านโฟลว์เงินใหญ่แบบ UNIVERSAL (mock data)",
    )
    parser.add_argument("--symbol", help="ชื่อสินทรัพย์ เช่น BTCUSDT / AAPL / EURUSD / XAUUSD")
    parser.add_argument(
        "--asset_type",
        default=DEFAULT_ASSET_TYPE,
        help="crypto | forex | th | us | indices (หรือ stock / gold_index ; ไม่ระบุ = default)",
    )
    parser.add_argument(
        "--bias",
        choices=("bull", "bear", "neutral"),
        default="bull",
        help="ทิศทางของ mock data ตัวอย่าง (ค่าเริ่มต้น bull)",
    )
    parser.add_argument("--mock", help="ไฟล์ JSON ที่มีข้อมูลโฟลว์จริง/ปลอมของตัวเอง")
    parser.add_argument("--json", action="store_true", help="พิมพ์เป็น JSON อย่างเดียว")
    parser.add_argument("--schema", action="store_true", help="พิมพ์ field ที่รองรับทั้งหมด")
    parser.add_argument("--selftest", action="store_true", help="รันเทสในไฟล์ (ทุกสินทรัพย์)")
    args = parser.parse_args(argv)

    if args.schema:
        _print_schema()
        return 0
    if args.selftest:
        return _selftest()

    if not args.symbol:
        parser.error("ต้องระบุ --symbol (หรือใช้ --schema / --selftest)")

    mock: Mapping[str, Any] | None
    if args.mock:
        path = Path(args.mock)
        if not path.exists():
            print(f"❌ ไม่พบไฟล์ mock: {path}", file=sys.stderr)
            return 2
        try:
            mock = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            print(f"❌ JSON ไม่ถูกต้อง: {error}", file=sys.stderr)
            return 2
    else:
        mock = sample_mock(args.asset_type, args.bias)

    detail = describe_flow(args.symbol, args.asset_type, mock)
    signal: ModuleSignal = detail["signal"]

    if args.json:
        print(json.dumps(signal.to_dict(), ensure_ascii=False, indent=2))
        return 0

    print("🐋 02_WHALE — UNIVERSAL MONEY FLOW")
    print(f"symbol     : {signal.symbol}")
    print(f"asset_type : {signal.asset_type}")
    if not args.mock:
        print(f"ข้อมูล      : ตัวอย่าง (mock bias={args.bias}) — ยังไม่ต่อ API จริง")
    _print_breakdown(detail)
    print(f"  total={detail['total']:+.3f}  coverage={detail['coverage']:.2f}  "
          f"agreement={detail['agreement']:.2f}")
    _print_signal(signal)
    return 0


# -------------------------------------------------------------------- selftest


def _selftest() -> int:
    """เทสในไฟล์เอง (ไม่ต้องใช้ pytest): ครอบทั้ง 5 asset_type × 3 bias"""
    checks = 0
    failures: list[str] = []

    def check(condition: bool, message: str) -> None:
        nonlocal checks
        checks += 1
        if not condition:
            failures.append(message)

    types = ("crypto", "stock", "forex", "gold_index", DEFAULT_ASSET_TYPE)
    symbol_map = {
        "crypto": "BTCUSDT",
        "stock": "AAPL",
        "forex": "EURUSD",
        "gold_index": "XAUUSD",
        DEFAULT_ASSET_TYPE: "ANY",
    }

    for asset in types:
        for bias, expected_sign in (("bull", 1), ("bear", -1), ("neutral", 0)):
            signal = analyze_flow(symbol_map[asset], asset, sample_mock(asset, bias))
            check(-2 <= signal.score <= 2, f"{asset}/{bias}: score หลุดช่วง ({signal.score})")
            check(0 <= signal.confidence <= 100, f"{asset}/{bias}: confidence หลุดช่วง")
            check(bool(signal.reason), f"{asset}/{bias}: reason ว่าง")
            check(len(signal.reason) <= 200, f"{asset}/{bias}: reason ยาวเกิน 200")
            if expected_sign > 0:
                check(signal.score > 0, f"{asset}/bull: ควรเป็นบวก (ได้ {signal.score})")
                check(signal.confidence >= 55, f"{asset}/bull: มั่นใจต่ำเกิน ({signal.confidence})")
            elif expected_sign < 0:
                check(signal.score < 0, f"{asset}/bear: ควรเป็นลบ (ได้ {signal.score})")
                check(signal.confidence >= 55, f"{asset}/bear: มั่นใจต่ำเกิน ({signal.confidence})")
            else:
                check(signal.score == 0, f"{asset}/neutral: ควรเป็นกลาง (ได้ {signal.score})")

    # 1) ไม่มีข้อมูล -> กลาง + ไม่มั่นใจ (ห้ามเดา)
    empty = analyze_flow("BTCUSDT", "crypto", None)
    check(empty.score == 0 and empty.confidence == 0, "mock ว่างควรได้ 0/0")
    check("ยังไม่ต่อ API" in empty.reason, "mock ว่างควรบอกว่ายังไม่ต่อ API")

    # 2) asset_type แปลก ๆ -> default ไม่ crash
    weird = analyze_flow("ZZZ", "nft_jpeg", sample_mock("crypto", "bull"))
    check(weird.asset_type == DEFAULT_ASSET_TYPE, "asset_type ไม่รู้จักควรตกไป default")
    check(-2 <= weird.score <= 2, "default profile ต้องให้ score ในช่วง")

    # 3) ข้อมูลครึ่งเดียว -> ต้องมั่นใจน้อยกว่าข้อมูลครบ
    full_mock = sample_mock("crypto", "bull")
    half_mock = {k: full_mock[k] for k in list(full_mock)[:1]}
    full = analyze_flow("ETHUSDT", "crypto", full_mock)
    half = analyze_flow("ETHUSDT", "crypto", half_mock)
    check(half.confidence <= full.confidence, "ข้อมูลไม่ครบต้องมั่นใจไม่เกินข้อมูลครบ")

    # 4) ตัวชี้วัดสวนทางกัน -> ไม่ควรได้ score สุดโต่ง + มั่นใจลด
    mixed = dict(full_mock)
    mixed["exchange_netflow_usd"] = 25_000_000  # เงินไหลเข้า = ขาย (สวนทาง)
    mixed_signal = analyze_flow("SOLUSDT", "crypto", mixed)
    check(abs(mixed_signal.score) <= 1, "สัญญาณสวนทางกันไม่ควรได้ score สุดโต่ง")

    # 5) deterministic + ไม่ผูกชื่อสินทรัพย์
    a = analyze_flow("AAA", "stock", sample_mock("stock", "bull"))
    b = analyze_flow("AAA", "stock", sample_mock("stock", "bull"))
    check(a.to_dict() == b.to_dict(), "ผลลัพธ์ต้องคงที่เมื่อ input เดิม")

    # 6) ค่าที่ส่งมาเป็น string พร้อมหน่วย ต้องอ่านได้
    text_signal = analyze_flow("AAPL", "stock", {"institutional_net_buy_usd": "$12.5M"})
    check(text_signal.score > 0, "string '$12.5M' ควรอ่านเป็นบวกได้")

    # 7) Fusion ต้องอ่านต่อได้: to_dict ครบ key
    payload = a.to_dict()
    check(
        set(payload) == {"symbol", "asset_type", "score", "confidence", "reason", "source"},
        "to_dict ต้องมี key ครบตาม interface",
    )

    if failures:
        print(f"❌ selftest ไม่ผ่าน {len(failures)}/{checks}")
        for failure in failures:
            print(f"   - {failure}")
        return 1
    print(f"✅ selftest ผ่าน {checks}/{checks} ข้อ (5 asset_type × 3 bias + edge cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
