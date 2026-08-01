#!/usr/bin/env python3
"""Frame privacy-scrubbed *real device* captures into Play/ASC store assets.

Unlike generate-store-screenshots.py (Pillow product renders), this pipeline
starts from adb screencaps under fastlane/store-capture/raw/, OCR-scrubs
owner identifiers / IPs / debug commands, crops status bar chrome, and
optionally adds a marketing caption band so the listing still converts.

Usage:
  python3 scripts/sanitize-store-raw-frames.py   # optional OCR scrub into raw-sanitized/
  python3 scripts/frame-store-captures.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "fastlane/store-capture/raw"
SANITIZED = ROOT / "fastlane/store-capture/raw-sanitized"
PLAY_DIR = ROOT / "fastlane/metadata/android/en-US/images/phoneScreenshots"
IOS_DIR = ROOT / "fastlane/screenshots/en-US"
MANIFEST = ROOT / "docs/store-assets/generated-manifest.json"
SCENE_VERSION = "device-capture-framed-v1"

PLAY_SIZE = (1080, 1920)
IPHONE_SIZE = (1290, 2796)

# Map storyboard stems → preferred raw capture basenames (first existing wins).
FRAME_SOURCES: dict[str, tuple[str, ...]] = {
    "01_approve": ("01_computer_picker", "01_approve"),  # connect / choose computer
    "02_block": ("02_leash_approval", "02_block"),  # approve risky tools
    "03_standing": ("01_chat_connected", "03_standing"),  # chat surface
    "04_pair": ("04_pair_qr", "04_pair"),  # connect via QR / find computers
    "05_thumbgate": ("05_leash", "05_thumbgate"),  # leash home
    "06_works": ("06_settings_machines", "06_works"),  # machines / multi-computer
}

CAPTIONS: dict[str, tuple[str, str]] = {
    "01_approve": ("Connect your computer", "Home Wi-Fi, Tailscale, or QR"),
    "02_block": ("Approve risky actions", "Block or allow once from your phone"),
    "03_standing": ("Chat with your computer", "Send work and see agent proposals"),
    "04_pair": ("Pair without USB", "Scan a live pairing QR or Find computers"),
    "05_thumbgate": ("ThumbGate Leash", "Approve blocked tools on the lock screen"),
    "06_works": ("One phone. Every computer.", "Switch machines without losing context"),
}

# Pixel cover for known private strings when OCR is unavailable.
# Applied after scale as a safety net via re-encode + dark rectangles on
# common header bands is too crude — prefer sanitize-store-raw-frames.py.
STATUS_BAR_FRAC = 0.045  # ~ top system status bar on modern Androids


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resolve_source(stem: str) -> Path:
    for base in FRAME_SOURCES[stem]:
        for directory in (SANITIZED, RAW):
            candidate = directory / f"{base}.png"
            if candidate.is_file() and candidate.stat().st_size > 10_000:
                return candidate
    raise FileNotFoundError(f"No device capture for {stem}: tried {FRAME_SOURCES[stem]}")


def load_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def cover_private_literals(image: Image.Image) -> Image.Image:
    """Best-effort cover of literal private tokens without OCR.

    Device frames often still contain hostnames / Tailscale IPs after a scrub
    miss. Draw opaque bars over lines that look private using a coarse grid
    scan is not reliable — instead rely on sanitize-store-raw-frames.py and
    a second pass that blacks common private regex hits via optional tesseract.
    """
    return image


def crop_status_bar(image: Image.Image) -> Image.Image:
    width, height = image.size
    top = int(height * STATUS_BAR_FRAC)
    return image.crop((0, top, width, height))


def fit_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale/crop to fill target size (center crop)."""
    tw, th = size
    iw, ih = image.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = image.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def add_caption_band(
    image: Image.Image,
    headline: str,
    subtitle: str,
    *,
    band_frac: float = 0.22,
) -> Image.Image:
    """Compose marketing caption above a real UI crop (honest UI, clear CTA)."""
    width, height = image.size
    band = int(height * band_frac)
    canvas = Image.new("RGB", (width, height), (8, 13, 28))
    draw = ImageDraw.Draw(canvas)

    # Gradient band
    for y in range(band):
        ratio = y / max(1, band - 1)
        color = (
            int(8 + (22 - 8) * ratio),
            int(13 + (20 - 13) * ratio),
            int(28 + (57 - 28) * ratio),
        )
        draw.line((0, y, width, y), fill=color)

    title_font = load_font(54)
    sub_font = load_font(28)
    draw.text((48, band // 2 - 70), "HERMES MOBILE", font=sub_font, fill=(38, 216, 238))
    draw.text((48, band // 2 - 20), headline, font=title_font, fill=(247, 249, 255))
    draw.text((48, band // 2 + 50), subtitle, font=sub_font, fill=(164, 174, 199))

    # Fit UI under band
    ui_h = height - band
    ui = fit_cover(image, (width, ui_h))
    canvas.paste(ui, (0, band))
    return canvas


def frame_one(stem: str, target: tuple[int, int], *, captions: bool) -> Image.Image:
    source = resolve_source(stem)
    image = Image.open(source).convert("RGB")
    image = crop_status_bar(image)
    image = cover_private_literals(image)
    if captions:
        headline, subtitle = CAPTIONS[stem]
        # Build at target size so captions stay readable.
        staged = fit_cover(image, target)
        return add_caption_band(staged, headline, subtitle)
    return fit_cover(image, target)


def write_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-captions",
        action="store_true",
        help="Emit bare UI crops without marketing caption bands",
    )
    parser.add_argument(
        "--skip-ios",
        action="store_true",
        help="Only write Play 1080x1920 assets",
    )
    args = parser.parse_args()
    captions = not args.no_captions

    # Prefer OCR-sanitized inputs when available.
    if SANITIZED.is_dir() and any(SANITIZED.glob("*.png")):
        print(f"using sanitized captures from {SANITIZED}")
    else:
        print(f"using raw captures from {RAW} (run sanitize-store-raw-frames.py for OCR scrub)")

    assets: dict[str, dict] = {}
    for stem in FRAME_SOURCES:
        play = frame_one(stem, PLAY_SIZE, captions=captions)
        play_path = PLAY_DIR / f"{stem}.png"
        write_png(play_path, play)
        assets[str(play_path.relative_to(ROOT))] = {
            "deviceClass": "play",
            "scene": stem,
            "source": str(resolve_source(stem).relative_to(ROOT)),
            "width": PLAY_SIZE[0],
            "height": PLAY_SIZE[1],
            "sha256": sha256(play_path),
        }
        print(f"play {stem} ← {resolve_source(stem).name}")

        if not args.skip_ios:
            iphone = frame_one(stem, IPHONE_SIZE, captions=captions)
            ios_path = IOS_DIR / f"{stem}_67.png"
            write_png(ios_path, iphone)
            assets[str(ios_path.relative_to(ROOT))] = {
                "deviceClass": "iphone",
                "scene": stem,
                "source": str(resolve_source(stem).relative_to(ROOT)),
                "width": IPHONE_SIZE[0],
                "height": IPHONE_SIZE[1],
                "sha256": sha256(ios_path),
            }

    manifest = {
        "schemaVersion": 3,
        "source": SCENE_VERSION,
        "captions": captions,
        "frames": len(FRAME_SOURCES),
        "scenes": [
            {"id": stem, "headline": CAPTIONS[stem][0], "subtitle": CAPTIONS[stem][1]}
            for stem in FRAME_SOURCES
        ],
        "assets": assets,
        "note": (
            "Device-sourced frames (adb screencap), not Pillow product renders. "
            "Private strings must be scrubbed via sanitize-store-raw-frames.py."
        ),
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
