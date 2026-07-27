#!/usr/bin/env python3
"""Privacy/debug scrub for store raw frames (real UI kept; ban phrases covered).

Covers OCR-found regions matching store-listing bans so framed marketing shots do not
ship mega-token warnings, typeable probes, Tailscale IPs, or hosted API URLs.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "fastlane/store-capture/raw"
SANITIZED = ROOT / "fastlane/store-capture/raw-sanitized"
BACKUP = ROOT / "fastlane/store-capture/raw-pre-scrub-20260723"

BAN = re.compile(
    r"(759k|156k|\d{2,4}k\s*tokens?|tokens?\)|typeable|probe-2|can.?t reach|"
    r"100\.\d+\.\d+\.\d+|railway\.app|MOON[- ]?DUST|force[- ]?leak|"
    r"Gateway healthy|Bearer|token for|/v1/feedback|npx thumbgate|"
    r"Igor-Mac|Igors-Mac|relay not paired|Direct link to|"
    r"/Users/igorganapolsky|workspace/git|Start a fresh|replies may take|"
    r"Pair Hermes relay|Hermes Relay|memory runaway|YOLO_MEM)",
    re.I,
)

PAD = 16


def tesseract_tsv(path: Path) -> list[dict]:
    with tempfile.TemporaryDirectory() as tmp:
        out_base = Path(tmp) / "ocr"
        subprocess.run(
            ["tesseract", str(path), str(out_base), "tsv"],
            check=True,
            capture_output=True,
        )
        lines = (out_base.with_suffix(".tsv")).read_text(
            encoding="utf-8", errors="replace"
        ).splitlines()
    if len(lines) < 2:
        return []
    header = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) != len(header):
            continue
        row = dict(zip(header, parts))
        try:
            conf = float(row.get("conf", "-1"))
        except ValueError:
            conf = -1
        text = (row.get("text") or "").strip()
        if conf < 0 or not text:
            continue
        rows.append(
            {
                "text": text,
                "left": int(row["left"]),
                "top": int(row["top"]),
                "width": int(row["width"]),
                "height": int(row["height"]),
                "block": row.get("block_num"),
                "par": row.get("par_num"),
                "line": row.get("line_num"),
            }
        )
    return rows


def cover_boxes(im: Image.Image, boxes: list[tuple[int, int, int, int]]) -> None:
    draw = ImageDraw.Draw(im)
    for x1, y1, x2, y2 in boxes:
        x1 = max(0, x1 - PAD)
        y1 = max(0, y1 - PAD)
        x2 = min(im.width, x2 + PAD)
        y2 = min(im.height, y2 + PAD)
        sample_y = max(0, y1 - 4)
        sample = im.crop((x1, sample_y, min(im.width, x1 + 8), min(im.height, sample_y + 8)))
        color = sample.resize((1, 1)).getpixel((0, 0)) if sample.height else (12, 16, 28)
        draw.rectangle((x1, y1, x2, y2), fill=color)


def scrub_one(src: Path, dest: Path) -> list[str]:
    im = Image.open(src).convert("RGB")
    rows = tesseract_tsv(src)
    hits: list[str] = []
    boxes: list[tuple[int, int, int, int]] = []
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        groups[(row["block"], row["par"], row["line"])].append(row)
    for group in groups.values():
        joined = " ".join(r["text"] for r in group)
        if BAN.search(joined) or any(BAN.search(r["text"]) for r in group):
            hits.append(joined)
            boxes.append(
                (
                    min(r["left"] for r in group),
                    min(r["top"] for r in group),
                    max(r["left"] + r["width"] for r in group),
                    max(r["top"] + r["height"] for r in group),
                )
            )
    full = " ".join(r["text"] for r in rows)
    if re.search(r"typeable|probe-2", full, re.I):
        boxes.append((40, int(im.height * 0.84), im.width - 40, int(im.height * 0.94)))
        hits.append("composer-probe-band")
    if boxes:
        cover_boxes(im, boxes)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, format="PNG", optimize=True)
    return hits


def main() -> int:
    SANITIZED.mkdir(parents=True, exist_ok=True)
    names = [
        "01_approve.png",
        "02_block.png",
        "03_standing.png",
        "04_pair.png",
        "05_thumbgate.png",
        "06_works.png",
    ]
    for name in names:
        src = BACKUP / name if (BACKUP / name).exists() else RAW / name
        if not src.exists():
            raise SystemExit(f"missing raw frame {name}")
        dest = SANITIZED / name
        hits = scrub_one(src, dest)
        shutil.copy2(dest, RAW / name)
        print(f"{name}: scrubbed {len(hits)} region(s)")
        for h in hits:
            print(f"  - {h[:100]}")
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
