"""signals.py — "สัญญาณกลาง" ของ MotorBoy Fusion Core (interface แช่แข็ง)

สเปกข้อ 3 ห้ามเปลี่ยน interface ไฟล์นี้จึงเป็นที่อยู่เดียวของ 3 dataclass นั้น:

    ModuleSignal  : score -2..+2, confidence 0-100, reason ภาษาไทยสั้น ๆ, source
    BacktestSignal: win_rate, trades, profit_factor, max_dd, reason
    FusionResult  : decision, final_score, final_confidence, veto_triggered, reasons, breakdown

หมายเหตุการบ้าน: ถ้าทีมมี `fusion_core.py` (Production) อยู่แล้ว ให้ import
ModuleSignal จากที่นั่นแทนไฟล์นี้ — โมดูล 02/03/01/04 ลอง `fusion_core` ก่อนเสมอ
และถอยมาใช้ไฟล์นี้เฉพาะตอนที่ยังไม่มี เพื่อให้ทุกไฟล์รันเดี่ยวได้ตั้งแต่วันแรก

ทุกฟังก์ชันในระบบต้องรับ symbol + asset_type เป็น parameter ห้ามล็อกชื่อสินทรัพย์
ไฟล์นี้ไม่มี logic การเทรดใด ๆ มีแต่การตรวจความถูกต้องของข้อมูล
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

# ---------------------------------------------------------------- asset types

# 5 กลุ่มตามสเปกข้อ 5 — "Preset ตามประเภทสินทรัพย์ ไม่ใช่ตามชื่อเหรียญ"
CANONICAL_ASSET_TYPES: tuple[str, ...] = ("crypto", "stock", "forex", "gold_index")

# ชื่อที่ผู้เรียกอาจส่งมาแบบอื่น (ห้ามเพิ่ม preset ใหม่ แต่รับ alias ได้)
_ASSET_ALIASES: Mapping[str, str] = {
    "crypto": "crypto",
    "crypto_major": "crypto",
    "crypto_meme": "crypto",
    "coin": "crypto",
    "stock": "stock",
    "thai_stock": "stock",
    "us_stock": "stock",
    "equity": "stock",
    "forex": "forex",
    "fx": "forex",
    "currency": "forex",
    "gold": "gold_index",
    "gold_index": "gold_index",
    "index": "gold_index",
    "commodity": "gold_index",
}

# ใช้เมื่อ caller ไม่ระบุ asset_type เลย (สเปกข้อ 5: "default")
DEFAULT_ASSET_TYPE = "default"

VALID_DECISIONS: tuple[str, ...] = (
    "STRONG BUY",
    "BUY",
    "WAIT",
    "SELL",
    "STRONG SELL",
    "NO TRADE",
)


def canonical_asset_type(raw: Any) -> str:
    """แปลงชื่อประเภทสินทรัพย์ให้เป็นมาตรฐาน (ไม่รู้จัก -> 'default' ไม่ throw)."""
    if not isinstance(raw, str):
        return DEFAULT_ASSET_TYPE
    key = raw.strip().lower().replace("-", "_").replace(" ", "_")
    return _ASSET_ALIASES.get(key, DEFAULT_ASSET_TYPE)


def _check_score(score: Any) -> int:
    """score ต้องเป็นจำนวนเต็ม -2..+2 เท่านั้น (สเปกข้อ 3)."""
    if isinstance(score, bool) or not isinstance(score, int):
        raise ValueError(f"score ต้องเป็น int -2..+2 (ได้ {score!r})")
    if score < -2 or score > 2:
        raise ValueError(f"score ต้องอยู่ระหว่าง -2 ถึง +2 (ได้ {score})")
    return score


def _check_confidence(confidence: Any) -> int:
    """confidence ต้องเป็น 0..100 (สเปกข้อ 3)."""
    if isinstance(confidence, bool) or not isinstance(confidence, int):
        raise ValueError(f"confidence ต้องเป็น int 0..100 (ได้ {confidence!r})")
    if confidence < 0 or confidence > 100:
        raise ValueError(f"confidence ต้องอยู่ระหว่าง 0 ถึง 100 (ได้ {confidence})")
    return confidence


def _check_text(value: Any, name: str, max_chars: int = 200) -> str:
    """reason/source ต้องเป็นข้อความสั้น ๆ ไม่ว่าง (กัน prompt ขยะหลุดเข้าหัวหน้า)."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} ห้ามว่าง")
    return value.strip()[:max_chars]


# ------------------------------------------------------------------ ModuleSignal


@dataclass(frozen=True)
class ModuleSignal:
    """ผลจากโมดูลลูก 1 ตัว (ข่าว / เงินใหญ่ / กราฟ / แบ็คเทส) ส่งให้หัวหน้าเท่านั้น"""

    symbol: str
    asset_type: str
    score: int
    confidence: int
    reason: str
    source: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "symbol", _check_text(self.symbol, "symbol", 32))
        object.__setattr__(self, "asset_type", canonical_asset_type(self.asset_type))
        object.__setattr__(self, "score", _check_score(self.score))
        object.__setattr__(self, "confidence", _check_confidence(self.confidence))
        object.__setattr__(self, "reason", _check_text(self.reason, "reason"))
        object.__setattr__(self, "source", _check_text(self.source, "source", 120))

    @property
    def direction(self) -> str:
        """ทิศทางแบบอ่านง่าย: บวก = เงินใหญ่เข้าของ, ลบ = เทขาย"""
        return "bullish" if self.score > 0 else "bearish" if self.score < 0 else "neutral"

    def to_dict(self) -> dict[str, Any]:
        """แปลงเป็น dict เพื่อส่งต่อ JSON / บันทึก log"""
        return {
            "symbol": self.symbol,
            "asset_type": self.asset_type,
            "score": self.score,
            "confidence": self.confidence,
            "reason": self.reason,
            "source": self.source,
        }


# ---------------------------------------------------------------- BacktestSignal


@dataclass(frozen=True)
class BacktestSignal:
    """ผลแบ็คเทส 100 ไม้ล่าสุด — ใช้เป็น "เบรกมือ" ไม่ใช่เป็นน้ำหนัก (กฎข้อ 3)"""

    symbol: str
    asset_type: str
    win_rate: float
    trades: int
    profit_factor: float
    max_dd: float
    reason: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "symbol", _check_text(self.symbol, "symbol", 32))
        object.__setattr__(self, "asset_type", canonical_asset_type(self.asset_type))
        object.__setattr__(self, "reason", _check_text(self.reason, "reason"))
        if not 0 <= float(self.win_rate) <= 100:
            raise ValueError(f"win_rate ต้องอยู่ 0..100 (ได้ {self.win_rate})")
        if float(self.max_dd) < 0:
            raise ValueError(f"max_dd ต้องไม่ติดลบ (ได้ {self.max_dd})")
        if int(self.trades) < 0:
            raise ValueError(f"trades ต้องไม่ติดลบ (ได้ {self.trades})")

    @property
    def is_enough_sample(self) -> bool:
        """100 ไม้คือขั้นต่ำก่อนคิดว่าจะเลื่อนขั้น Lab -> Production (สเปกข้อ 6)"""
        return int(self.trades) >= 100

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "asset_type": self.asset_type,
            "win_rate": self.win_rate,
            "trades": self.trades,
            "profit_factor": self.profit_factor,
            "max_dd": self.max_dd,
            "reason": self.reason,
        }


# ------------------------------------------------------------------ FusionResult


@dataclass(frozen=True)
class FusionResult:
    """คำตัดสินสุดท้ายของหัวหน้า — มีที่เดียว มีคนเดียว (สเปกข้อ 2)"""

    symbol: str
    asset_type: str
    decision: str
    final_score: float
    final_confidence: int
    veto_triggered: bool
    reasons: Sequence[str] = field(default_factory=tuple)
    breakdown: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        decision = str(self.decision).strip().upper()
        if decision not in VALID_DECISIONS:
            raise ValueError(f"decision ต้องเป็นหนึ่งใน {VALID_DECISIONS} (ได้ {self.decision!r})")
        object.__setattr__(self, "decision", decision)
        object.__setattr__(self, "symbol", _check_text(self.symbol, "symbol", 32))
        object.__setattr__(self, "asset_type", canonical_asset_type(self.asset_type))
        object.__setattr__(self, "final_confidence", _check_confidence(self.final_confidence))
        object.__setattr__(self, "reasons", tuple(str(r).strip() for r in self.reasons if str(r).strip()))

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "asset_type": self.asset_type,
            "decision": self.decision,
            "final_score": round(float(self.final_score), 4),
            "final_confidence": self.final_confidence,
            "veto_triggered": bool(self.veto_triggered),
            "reasons": list(self.reasons),
            "breakdown": dict(self.breakdown),
        }


__all__ = [
    "CANONICAL_ASSET_TYPES",
    "DEFAULT_ASSET_TYPE",
    "VALID_DECISIONS",
    "BacktestSignal",
    "FusionResult",
    "ModuleSignal",
    "canonical_asset_type",
]
