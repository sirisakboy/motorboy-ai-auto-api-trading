"""test_02_whale.py — เทสของโมดูลเงินใหญ่ (stdlib unittest ไม่ต้องลง pytest)

รัน:  python3 -m unittest discover -s motorboy_production/tests -v

หมายเหตุ: ไฟล์โมดูลชื่อ `02_whale.py` ขึ้นต้นด้วยตัวเลข จึง import ตรง ๆ ไม่ได้
เทสนี้จึงโหลดผ่าน importlib — วิธีเดียวกับที่ main.py จะใช้ในอนาคต
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "02_whale.py"
_SYS_MODULE_NAME = "motorboy_whale_02"


def load_whale():
    """โหลดโมดูล 02_whale.py เป็น Python module (ไม่พึ่งชื่อไฟล์)"""
    spec = importlib.util.spec_from_file_location(_SYS_MODULE_NAME, MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[_SYS_MODULE_NAME] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


whale = load_whale()

ASSET_SYMBOLS = {
    "crypto": "BTCUSDT",
    "stock": "AAPL",
    "forex": "EURUSD",
    "gold_index": "XAUUSD",
    "default": "ANYTHING",
}


class TestWhaleContract(unittest.TestCase):
    """สัญญาณต้องอยู่ในช่วงที่ Fusion อ่านได้เสมอ"""

    def test_score_and_confidence_ranges(self):
        for asset, symbol in ASSET_SYMBOLS.items():
            for bias in ("bull", "bear", "neutral"):
                signal = whale.analyze_flow(symbol, asset, whale.sample_mock(asset, bias))
                self.assertGreaterEqual(signal.score, -2)
                self.assertLessEqual(signal.score, 2)
                self.assertGreaterEqual(signal.confidence, 0)
                self.assertLessEqual(signal.confidence, 100)
                self.assertTrue(signal.reason.strip())

    def test_sign_follows_flow(self):
        for asset, symbol in ASSET_SYMBOLS.items():
            bull = whale.analyze_flow(symbol, asset, whale.sample_mock(asset, "bull"))
            bear = whale.analyze_flow(symbol, asset, whale.sample_mock(asset, "bear"))
            self.assertGreater(bull.score, 0, f"{asset}: bull ควรเป็นบวก")
            self.assertLess(bear.score, 0, f"{asset}: bear ควรเป็นลบ")
            self.assertGreaterEqual(bull.confidence, 55)
            self.assertGreaterEqual(bear.confidence, 55)

    def test_neutral_stays_in_deadzone(self):
        for asset, symbol in ASSET_SYMBOLS.items():
            signal = whale.analyze_flow(symbol, asset, whale.sample_mock(asset, "neutral"))
            self.assertEqual(signal.score, 0, f"{asset}: neutral ควรได้ 0")

    def test_signal_dict_shape_matches_interface(self):
        signal = whale.analyze_flow("BTCUSDT", "crypto", whale.sample_mock("crypto", "bull"))
        self.assertEqual(
            set(signal.to_dict()),
            {"symbol", "asset_type", "score", "confidence", "reason", "source"},
        )


class TestWhaleHonesty(unittest.TestCase):
    """ข้อมูลไม่ครบ/ไม่มี ต้องบอกตามจริง ไม่เดา"""

    def test_no_data_is_neutral_and_unconfident(self):
        signal = whale.analyze_flow("BTCUSDT", "crypto", None)
        self.assertEqual((signal.score, signal.confidence), (0, 0))
        self.assertIn("ยังไม่ต่อ API", signal.reason)

    def test_partial_coverage_lowers_confidence(self):
        full = whale.sample_mock("crypto", "bull")
        half = {next(iter(full)): next(iter(full.values()))}
        self.assertLessEqual(
            whale.analyze_flow("ETHUSDT", "crypto", half).confidence,
            whale.analyze_flow("ETHUSDT", "crypto", full).confidence,
        )

    def test_unknown_asset_type_falls_back_to_default(self):
        signal = whale.analyze_flow("ZZZ", "nft_jpeg", whale.sample_mock("crypto", "bull"))
        self.assertEqual(signal.asset_type, "default")
        self.assertGreaterEqual(signal.score, -2)
        self.assertLessEqual(signal.score, 2)

    def test_conflicting_flows_do_not_produce_extremes(self):
        mock = dict(whale.sample_mock("crypto", "bull"))
        mock["exchange_netflow_usd"] = 25_000_000  # ไหลเข้า = ขาย สวนทางตัวอื่น
        self.assertLessEqual(abs(whale.analyze_flow("SOLUSDT", "crypto", mock).score), 1)


class TestWhaleInput(unittest.TestCase):
    """input มาจาก API จริงได้หลายรูป ต้องอ่านได้โดยไม่พัง"""

    def test_string_values_with_units(self):
        signal = whale.analyze_flow("AAPL", "stock", {"institutional_net_buy_usd": "$12.5M"})
        self.assertGreater(signal.score, 0)

    def test_alias_keys_are_accepted(self):
        a = whale.analyze_flow("AAPL", "stock", {"fund_flow_usd": 9_000_000})
        b = whale.analyze_flow("AAPL", "stock", {"institutional_net_buy_usd": 9_000_000})
        self.assertEqual((a.score, a.confidence), (b.score, b.confidence))

    def test_asset_type_aliases_map_to_canonical(self):
        for alias in ("crypto_major", "crypto_meme", "coin"):
            self.assertEqual(whale.canonical_asset_type(alias), "crypto")
        self.assertEqual(whale.canonical_asset_type("gold"), "gold_index")
        self.assertEqual(whale.canonical_asset_type("index"), "gold_index")
        self.assertEqual(whale.canonical_asset_type("thai_stock"), "stock")

    def test_symbol_is_not_part_of_the_logic(self):
        mock = whale.sample_mock("forex", "bull")
        a = whale.analyze_flow("EURUSD", "forex", mock)
        b = whale.analyze_flow("USDJPY", "forex", mock)
        self.assertEqual((a.score, a.confidence, a.reason), (b.score, b.confidence, b.reason))

    def test_deterministic(self):
        mock = whale.sample_mock("gold_index", "bear")
        first = whale.analyze_flow("XAUUSD", "gold_index", mock).to_dict()
        second = whale.analyze_flow("XAUUSD", "gold_index", mock).to_dict()
        self.assertEqual(first, second)

    def test_empty_symbol_rejected(self):
        with self.assertRaises(ValueError):
            whale.analyze_flow("", "crypto", {})


class TestWhaleCli(unittest.TestCase):
    """ทุกไฟล์ต้องรันแล้วเห็นผลลัพธ์ได้เลย (สเปกข้อ 10)"""

    def _run(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(MODULE_PATH), *args],
            capture_output=True,
            text=True,
            timeout=60,
        )

    def test_each_asset_type_prints_a_signal(self):
        for asset, symbol in ASSET_SYMBOLS.items():
            result = self._run("--symbol", symbol, "--asset_type", asset)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("คะแนนเงินใหญ่", result.stdout)
            self.assertIn("ความมั่นใจ", result.stdout)

    def test_json_mode_is_pure_json(self):
        import json

        result = self._run("--symbol", "BTCUSDT", "--asset_type", "crypto", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("score", payload)
        self.assertIn("confidence", payload)

    def test_selftest_passes(self):
        result = self._run("--selftest")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("selftest ผ่าน", result.stdout)

    def test_missing_mock_file_exits_cleanly(self):
        result = self._run("--symbol", "BTCUSDT", "--mock", "/definitely/not/here.json")
        self.assertEqual(result.returncode, 2)
        self.assertIn("ไม่พบไฟล์ mock", result.stderr)


if __name__ == "__main__":
    unittest.main()
