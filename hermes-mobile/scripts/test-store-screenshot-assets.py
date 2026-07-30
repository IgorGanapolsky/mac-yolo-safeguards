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
EXPECTED_DIMENSIONS = {
    "play": (1080, 1920),
    "iphone": (1290, 2796),
    "ipad": (2048, 2732),
}
FORBIDDEN_COPY = re.compile(
    r"759k|very large session|typeable|probe|smoke test|127\.0\.0\.1|"
    r"\b100\.\d+\.\d+\.\d+\b|/Users/|igorganapolsky|force-leak|"
    r"YOLO_MEM|not paired|gateway healthy|railway\.app|\bUSB\b",
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
        cls.is_v2 = 'SCENE_VERSION = "deterministic-product-render-v2"' in cls.source

    def require_v2(self) -> None:
        if not self.is_v2:
            self.skipTest("full asset checks require the deterministic v2 generator")

    def test_01_generator_does_not_reuse_debug_capture_frames(self) -> None:
        self.assertTrue(
            self.is_v2,
            "legacy raw-device generator can preserve debug/private UI in public assets",
        )
        self.assertNotIn("raw-sanitized", self.source)
        self.assertNotIn("resolve_raw", self.source)
        self.assertIsNone(FORBIDDEN_COPY.search(self.source))

    def test_02_two_runs_are_byte_deterministic(self) -> None:
        self.require_v2()
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

    def test_03_committed_assets_match_the_generator(self) -> None:
        self.require_v2()
        # Golden PNGs are produced on Darwin with Pillow 11.3.0 load_default metrics.
        # Linux CI default bitmap metrics differ (same Pillow pin) — compare would false-fail.
        if platform.system() != "Darwin":
            self.skipTest(
                "byte-identical store assets are golden-locked on Darwin; "
                "Linux font metrics for ImageFont.load_default differ under the same Pillow pin"
            )
        generator = load_generator()
        with tempfile.TemporaryDirectory() as tmp:
            generated_root = Path(tmp)
            generated = generator.generate_assets(generated_root)
            committed = json.loads(MANIFEST.read_text(encoding="utf-8"))
            self.assertEqual(committed, generated)
            for rel_path, attributes in committed["assets"].items():
                committed_path = ROOT / rel_path
                self.assertTrue(committed_path.is_file(), rel_path)
                self.assertEqual(sha256(committed_path), attributes["sha256"])
                self.assertEqual(sha256(generated_root / rel_path), attributes["sha256"])

    def test_04_exactly_six_unique_assets_per_device_class(self) -> None:
        self.require_v2()
        classes = {
            "play": sorted(PLAY_DIR.glob("*.png")),
            "iphone": sorted(IOS_DIR.glob("*_67.png")),
            "ipad": sorted(IOS_DIR.glob("*_ipad129.png")),
        }
        for device_class, paths in classes.items():
            with self.subTest(device_class=device_class):
                self.assertEqual(len(paths), 6)
                self.assertEqual(len({sha256(path) for path in paths}), 6)
                for path in paths:
                    with Image.open(path) as image:
                        self.assertEqual(image.size, EXPECTED_DIMENSIONS[device_class])
                for first, second in combinations(paths, 2):
                    self.assertGreater(
                        image_difference_percent(first, second),
                        1.0,
                        f"{first.name} and {second.name} are visually near-duplicates",
                    )

    def test_05_scene_copy_is_unique_and_customer_safe(self) -> None:
        self.require_v2()
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
        approvals_source = APPROVALS_SCREEN.read_text(encoding="utf-8")
        for shipped_control in (
            "Approval-first mode",
            "Quick-approve layout",
            "Thumbs down → remember block",
        ):
            self.assertIn(shipped_control, self.source)
            self.assertIn(shipped_control, approvals_source)

    def test_06_local_ocr_finds_no_forbidden_copy(self) -> None:
        self.require_v2()
        tesseract = shutil.which("tesseract")
        if not tesseract:
            self.skipTest("tesseract is unavailable")
        for path in sorted(IOS_DIR.glob("*_67.png")):
            result = subprocess.run(
                [tesseract, str(path), "stdout"],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIsNone(
                FORBIDDEN_COPY.search(result.stdout),
                f"forbidden public copy detected in {path.name}",
            )


if __name__ == "__main__":
    unittest.main()
