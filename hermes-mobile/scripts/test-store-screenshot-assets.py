#!/usr/bin/env python3
"""Regression tests for deterministic, customer-safe store screenshots."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from itertools import combinations
from pathlib import Path
import platform

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "scripts/generate-store-screenshots.py"
FRAME_DEVICE = ROOT / "scripts/frame-store-captures.py"
IOS_DIR = ROOT / "fastlane/screenshots/en-US"
PLAY_DIR = ROOT / "fastlane/metadata/android/en-US/images/phoneScreenshots"
MANIFEST = ROOT / "docs/store-assets/generated-manifest.json"
APPROVALS_SCREEN = ROOT / "src/screens/ApprovalsScreen.tsx"

EXPECTED_SCENE_IDS = (
    "connect",
    "run",
    "approve",
    "rules",
    "learn",
    "switch",
)
DEVICE_SOURCE = "device-capture-framed-v1"
EXPECTED_DIMENSIONS = {
    "play": (1080, 1920),
    "iphone": (1290, 2796),
    "ipad": (2048, 2732),
}
FORBIDDEN_COPY = re.compile(
    r"759k|very large session|typeable|probe|smoke test|127\.0\.0\.1|"
    r"\b100\.\d+\.\d+\.\d+\b|/Users/|igorganapolsky|force-leak|"
    r"YOLO_MEM|not paired|gateway healthy|railway\.app",
    re.IGNORECASE,
)
INVENTED_CONTROL_COPY = re.compile(
    r"Set safety rules once|Stop destructive commands automatically|"
    r"Block force push|Ask before production writes|Block secret sharing",
    re.IGNORECASE,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_generator():
    spec = importlib.util.spec_from_file_location("store_screenshot_generator", GENERATOR)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load store screenshot generator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def image_difference_percent(a: Path, b: Path) -> float:
    first = Image.open(a).convert("RGB").resize((180, 320))
    second = Image.open(b).convert("RGB").resize((180, 320))
    stat = ImageStat.Stat(ImageChops.difference(first, second))
    return 100.0 * sum(stat.mean) / (3 * 255)


class StoreScreenshotAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = GENERATOR.read_text(encoding="utf-8")
        cls.frame_source = (
            FRAME_DEVICE.read_text(encoding="utf-8") if FRAME_DEVICE.is_file() else ""
        )
        cls.is_v2 = 'SCENE_VERSION = "deterministic-product-render-v2"' in cls.source
        cls.manifest = (
            json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.is_file() else {}
        )
        cls.is_device = cls.manifest.get("source") == DEVICE_SOURCE

    def require_assets(self) -> None:
        if not self.is_v2 and not self.is_device:
            self.skipTest("need Pillow v2 generator or device-capture-framed-v1 manifest")

    def test_01_pipeline_is_declared(self) -> None:
        self.assertTrue(
            self.is_v2 or FRAME_DEVICE.is_file(),
            "need generate-store-screenshots.py v2 and/or frame-store-captures.py",
        )
        if self.is_device:
            self.assertIn("device-capture-framed", self.frame_source)
            self.assertIn("raw-sanitized", self.frame_source)
        else:
            self.assertNotIn("resolve_raw", self.source)
        self.assertIsNone(FORBIDDEN_COPY.search(self.source))
        if self.frame_source:
            self.assertIsNone(FORBIDDEN_COPY.search(self.frame_source))

    def test_02_two_runs_are_byte_deterministic(self) -> None:
        if self.is_device:
            self.skipTest("device frames are not re-generated in CI; hash locked via manifest")
        if not self.is_v2:
            self.skipTest("Pillow v2 only")
        generator = load_generator()
        self.assertEqual(generator.PILLOW_VERSION, generator.REQUIRED_PILLOW_VERSION)
        self.assertNotIn("/System/Library/Fonts", self.source)
        self.assertNotIn("/usr/share/fonts", self.source)
        with tempfile.TemporaryDirectory() as first_tmp, tempfile.TemporaryDirectory() as second_tmp:
            first_root = Path(first_tmp)
            second_root = Path(second_tmp)
            first_manifest = generator.generate_assets(first_root)
            second_manifest = generator.generate_assets(second_root)
            self.assertEqual(first_manifest["scenes"], second_manifest["scenes"])
            self.assertEqual(first_manifest["assets"], second_manifest["assets"])
            for rel_path in first_manifest["assets"]:
                self.assertEqual(sha256(first_root / rel_path), sha256(second_root / rel_path))

    def test_03_committed_assets_match_manifest_hashes(self) -> None:
        self.require_assets()
        committed = self.manifest
        self.assertTrue(committed.get("assets"), "manifest missing assets")
        if self.is_device:
            self.assertEqual(committed.get("source"), DEVICE_SOURCE)
        elif platform.system() != "Darwin":
            self.skipTest(
                "Pillow golden lock is Darwin-only; device path uses manifest hashes on all OSes"
            )
        else:
            generator = load_generator()
            with tempfile.TemporaryDirectory() as tmp:
                generated = generator.generate_assets(Path(tmp))
                self.assertEqual(committed, generated)
        for rel_path, attributes in committed["assets"].items():
            committed_path = ROOT / rel_path
            self.assertTrue(committed_path.is_file(), rel_path)
            self.assertEqual(sha256(committed_path), attributes["sha256"])

    def test_04_exactly_six_unique_play_assets(self) -> None:
        self.require_assets()
        paths = sorted(PLAY_DIR.glob("*.png"))
        self.assertEqual(len(paths), 6)
        self.assertEqual(len({sha256(path) for path in paths}), 6)
        for path in paths:
            with Image.open(path) as image:
                self.assertEqual(image.size, EXPECTED_DIMENSIONS["play"])
        for first, second in combinations(paths, 2):
            self.assertGreater(
                image_difference_percent(first, second),
                1.0,
                f"{first.name} and {second.name} are visually near-duplicates",
            )
        # iPhone optional when device path only ships Play first
        iphone = sorted(IOS_DIR.glob("*_67.png"))
        if iphone:
            self.assertEqual(len(iphone), 6)
            for path in iphone:
                with Image.open(path) as image:
                    self.assertEqual(image.size, EXPECTED_DIMENSIONS["iphone"])

    def test_05_scene_copy_is_customer_safe(self) -> None:
        self.require_assets()
        if self.is_device:
            scenes = self.manifest.get("scenes") or []
            self.assertEqual(len(scenes), 6)
            visible = " ".join(
                str(value)
                for scene in scenes
                for value in scene.values()
                if isinstance(value, str)
            )
            self.assertIsNone(FORBIDDEN_COPY.search(visible))
            self.assertEqual(len({scene.get("headline") for scene in scenes}), 6)
            return
        generator = load_generator()
        scenes = generator.SCENES
        self.assertEqual(tuple(scene["id"] for scene in scenes), EXPECTED_SCENE_IDS)
        self.assertEqual(len({scene["headline"] for scene in scenes}), 6)
        visible_copy = " ".join(
            str(value)
            for scene in scenes
            for value in scene.values()
            if isinstance(value, str)
        )
        self.assertIsNone(FORBIDDEN_COPY.search(visible_copy))
        self.assertIsNone(INVENTED_CONTROL_COPY.search(self.source))

    def test_06_local_ocr_finds_no_forbidden_copy(self) -> None:
        self.require_assets()
        tesseract = shutil.which("tesseract")
        if not tesseract:
            self.skipTest("tesseract is unavailable")
        targets = list(PLAY_DIR.glob("*.png")) + list(IOS_DIR.glob("*_67.png"))
        self.assertTrue(targets, "no store PNGs to OCR")
        for path in sorted(targets):
            result = subprocess.run(
                [tesseract, str(path), "stdout"],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIsNone(
                FORBIDDEN_COPY.search(result.stdout),
                f"forbidden public copy detected in {path.name}: {result.stdout[:200]}",
            )


if __name__ == "__main__":
    unittest.main()
