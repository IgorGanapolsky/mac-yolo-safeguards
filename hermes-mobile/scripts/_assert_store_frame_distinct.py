import sys
from pathlib import Path
from PIL import Image

out = Path(sys.argv[1])
a = out / "01_approve.png"
b = out / "05_thumbgate.png"
if not a.is_file() or not b.is_file():
    print("similarity: skip (missing 01 or 05 raw frame)")
    sys.exit(0)

def sim(p1, p2):
    i1 = Image.open(p1).convert("RGB").resize((270, 480))
    i2 = Image.open(p2).convert("RGB").resize((270, 480))
    pa, pb = i1.tobytes(), i2.tobytes()
    same = sum(1 for x, y in zip(pa, pb) if x == y)
    return 100.0 * same / len(pa)

score = sim(a, b)
print(f"similarity 01_approve vs 05_thumbgate: {score:.2f}%")
if score >= 95.0:
    print("FAIL: 05_thumbgate must be visually distinct from 01_approve (<95% similar)")
    sys.exit(1)
