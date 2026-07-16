#!/usr/bin/env python3
"""Generate July 2026 ASO captioned store screenshots (6 frames) for Play + App Store.

Hard rules:
- Raw frames must already be distinct product moments (Chat / Leash approve / Settings
  safeguard rules / QR pair / ThumbGate options / Settings).
- Do NOT blank the phone UI into a spinner placeholder — that caused ASC duplicates.
- Emit ONE iPhone size for deliver (6.7"/APP_IPHONE_67). Shipping both _65 and _67 into
  the same Fastlane screenshots folder made ASC upload each frame twice into APP_IPHONE_67.
"""
from __future__ import annotations

import json
import sys
from itertools import combinations
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW_ANDROID = ROOT / "fastlane/store-capture/raw"
RAW_IOS = ROOT / "fastlane/metadata/ios/en-US/screenshots"
PROOFS = ROOT / "docs/proofs/device-test-2026-06-25"

OUT_PLAY = ROOT / "fastlane/metadata/android/en-US/images/phoneScreenshots"
OUT_IOS = ROOT / "fastlane/screenshots/en-US"

COLORS = {
    "bg": (11, 15, 25),
    "band": (17, 24, 39),
    "text": (243, 244, 246),
    "muted": (156, 163, 175),
    "cyan": (34, 211, 238),
}

FRAMES = [
    ("01_approve.png", "Approve AI agents from phone", "Deny risky commands in one tap"),
    ("02_block.png", "Block destructive commands remotely", "Stop rm, force-push, prod writes"),
    ("03_standing.png", "Standing gate rules synced", "Persistent allow and block policies"),
    ("04_pair.png", "Pair your Mac in one scan", "QR pairing, no cloud account"),
    ("05_thumbgate.png", "ThumbGate memory on replies", "Capture operator feedback per reply"),
    ("06_works.png", "Settings for your Mac link", "Machines, notifications, and keys"),
]

MAX_PAIR_SIMILARITY = 90.0


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ]
    for path in paths:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, start_size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    size = start_size
    while size >= 22:
        f = font(size, bold=bold)
        if draw.textbbox((0, 0), text, font=f)[2] <= max_width:
            return f
        size -= 2
    return font(22, bold=bold)


def resolve_raw(name: str) -> Path:
    for base in (RAW_ANDROID, RAW_IOS, PROOFS):
        candidate = base / name
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"Missing raw screenshot for {name}. Capture distinct frames into {RAW_ANDROID} "
        "(do not fall back to shared proof stubs — that creates ASC duplicates)."
    )


def prepare_phone(img: Image.Image) -> Image.Image:
    """Keep real UI. Only normalize mode — privacy scrub belongs in raw capture sanitize."""
    return img.convert("RGB")


def paste_phone(base: Image.Image, phone: Image.Image, box: tuple[int, int, int, int], radius: int = 24) -> None:
    x1, y1, x2, y2 = box
    target_w = x2 - x1 - 16
    target_h = y2 - y1 - 16
    scale = min(target_w / phone.width, target_h / phone.height)
    nw = max(1, int(phone.width * scale))
    nh = max(1, int(phone.height * scale))
    resized = phone.resize((nw, nh), Image.Resampling.LANCZOS)
    px = x1 + (x2 - x1 - nw) // 2
    py = y1 + (y2 - y1 - nh) // 2
    frame = Image.new("RGBA", (x2 - x1, y2 - y1), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle((0, 0, x2 - x1 - 1, y2 - y1 - 1), radius=radius, outline=(55, 65, 81), width=8)
    mask = Image.new("L", (nw, nh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, nw, nh), radius=radius - 4, fill=255)
    frame.paste(resized, (px - x1, py - y1), mask)
    base.paste(frame, (x1, y1), frame)


def make_frame(
    raw_name: str,
    headline: str,
    subtitle: str,
    canvas: tuple[int, int],
    band_h: int,
    outfile: Path,
) -> None:
    w, h = canvas
    im = Image.new("RGBA", (w, h), COLORS["bg"])
    d = ImageDraw.Draw(im)

    left = int(w * 0.06)
    max_text_w = int(w * 0.88)
    margin = max(24, int(w * 0.028))
    gap = max(12, int(w * 0.014))

    brand_font = font(max(24, w // 34), True)
    title_font = fit_text(d, headline, max_text_w, max(40, w // 18), bold=True)
    sub_font = font(max(20, w // 40), False)

    def measure(f: ImageFont.FreeTypeFont, s: str) -> tuple[int, int]:
        box = d.textbbox((0, 0), s, font=f)
        return box[3] - box[1], box[1]

    brand_h, brand_off = measure(brand_font, "Hermes Mobile")
    title_h, title_off = measure(title_font, headline)
    sub_h, sub_off = measure(sub_font, subtitle)

    needed = margin + brand_h + gap + title_h + gap + sub_h + margin
    band = max(band_h, needed)

    d.rectangle((0, 0, w, band), fill=COLORS["band"])
    y = margin
    d.text((left, y - brand_off), "Hermes Mobile", font=brand_font, fill=COLORS["cyan"])
    y += brand_h + gap
    d.text((left, y - title_off), headline, font=title_font, fill=COLORS["text"])
    y += title_h + gap
    d.text((left, y - sub_off), subtitle, font=sub_font, fill=COLORS["muted"])

    raw = prepare_phone(Image.open(resolve_raw(raw_name)))
    paste_phone(im, raw, (int(w * 0.04), band + 20, w - int(w * 0.04), h - 20), radius=max(20, w // 50))
    outfile.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(outfile, quality=95)


def pixel_similarity(a: Path, b: Path) -> float:
    i1 = Image.open(a).convert("RGB").resize((270, 480))
    i2 = Image.open(b).convert("RGB").resize((270, 480))
    pa, pb = i1.tobytes(), i2.tobytes()
    return 100.0 * sum(1 for x, y in zip(pa, pb) if x == y) / len(pa)


def assert_raw_distinct() -> dict[str, float]:
    raws = [resolve_raw(name) for name, _, _ in FRAMES]
    report: dict[str, float] = {}
    bad: list[str] = []
    for a, b in combinations(raws, 2):
        score = pixel_similarity(a, b)
        key = f"{a.stem}_vs_{b.stem}"
        report[key] = round(score, 2)
        if score >= MAX_PAIR_SIMILARITY:
            bad.append(f"{key}={score:.1f}%")
    if bad:
        raise SystemExit(
            "Raw store frames are not distinct enough (would ship ASC duplicates): "
            + "; ".join(bad)
        )
    return report


def main() -> int:
    similarity = assert_raw_distinct()

    for out_dir in (OUT_PLAY, OUT_IOS):
        out_dir.mkdir(parents=True, exist_ok=True)
        for stale in out_dir.glob("*.png"):
            stale.unlink(missing_ok=True)

    for idx, (raw, headline, subtitle) in enumerate(FRAMES, start=1):
        # Stable stems (not headline-derived) so deliver ordering stays 01..06.
        stem = Path(raw).stem  # 01_approve … 06_works
        make_frame(raw, headline, subtitle, (1080, 1920), 120, OUT_PLAY / f"{stem}.png")
        # Single iPhone size for ASC APP_IPHONE_67 — do NOT also emit _65 here.
        make_frame(raw, headline, subtitle, (1290, 2796), 520, OUT_IOS / f"{stem}_67.png")
        make_frame(raw, headline, subtitle, (2048, 2732), 560, OUT_IOS / f"{stem}_ipad129.png")
        print(f"frame {idx}/6: {headline}")

    framed = sorted(OUT_PLAY.glob("*.png"))
    framed_sim: dict[str, float] = {}
    for a, b in combinations(framed, 2):
        framed_sim[f"{a.stem}_vs_{b.stem}"] = round(pixel_similarity(a, b), 2)
    bad_framed = {k: v for k, v in framed_sim.items() if v >= MAX_PAIR_SIMILARITY}
    if bad_framed:
        raise SystemExit(f"Framed screenshots still too similar: {bad_framed}")

    report = {}
    for path in sorted(OUT_PLAY.glob("*.png")) + sorted(OUT_IOS.glob("*.png")):
        with Image.open(path) as img:
            report[str(path.relative_to(ROOT))] = {"width": img.width, "height": img.height}

    manifest = ROOT / "docs/store-assets/generated-manifest.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(
        json.dumps(
            {
                "frames": len(FRAMES),
                "assets": report,
                "rawSimilarity": similarity,
                "framedSimilarity": framed_sim,
                "ascNote": "Only _67 + ipad129 emitted to avoid APP_IPHONE_67 double-upload",
            },
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"ok": True, "frames": len(FRAMES), "count": len(report), "maxRawSim": max(similarity.values())}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
