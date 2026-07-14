#!/usr/bin/env python3
"""Fail if any store-frame pair is ≥90% pixel-identical (ASC duplicate guard)."""
from __future__ import annotations

import sys
from itertools import combinations
from pathlib import Path

from PIL import Image

THRESHOLD = 90.0


def sim(p1: Path, p2: Path) -> float:
    i1 = Image.open(p1).convert("RGB").resize((270, 480))
    i2 = Image.open(p2).convert("RGB").resize((270, 480))
    pa, pb = i1.tobytes(), i2.tobytes()
    return 100.0 * sum(1 for x, y in zip(pa, pb) if x == y) / len(pa)


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("fastlane/store-capture/raw")
    frames = sorted(out.glob("*.png"))
    if len(frames) < 2:
        print(f"similarity: skip (need ≥2 png in {out})")
        return 0

    bad = []
    for a, b in combinations(frames, 2):
        score = sim(a, b)
        print(f"similarity {a.stem} vs {b.stem}: {score:.2f}%")
        if score >= THRESHOLD:
            bad.append(f"{a.stem}_vs_{b.stem}={score:.2f}%")

    if bad:
        print(f"FAIL: store frames must be visually distinct (<{THRESHOLD}% similar): {', '.join(bad)}")
        return 1
    print(f"ok: {len(frames)} frames, all pairs <{THRESHOLD}% similar")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
