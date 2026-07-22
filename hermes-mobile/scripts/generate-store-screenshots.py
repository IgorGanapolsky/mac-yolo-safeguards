#!/usr/bin/env python3
"""Generate readable, privacy-safe Hermes Mobile store screenshots.

The previous generator framed live dogfood captures. That made the product UI tiny and
allowed stale errors, private machine names, and Mac-only copy into the first sales
impression. These frames are deterministic product-story renders of capabilities that
exist in Hermes Mobile; no personal runtime data or generative text is used.
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_PLAY = ROOT / "fastlane/metadata/android/en-US/images/phoneScreenshots"
OUT_IOS = ROOT / "fastlane/screenshots/en-US"
OUT_FEATURE = ROOT / "fastlane/metadata/android/en-US/images/featureGraphic.png"

COLORS = {
    "bg": (7, 10, 20),
    "panel": (18, 23, 38),
    "panel2": (23, 30, 49),
    "line": (48, 57, 79),
    "text": (247, 248, 252),
    "muted": (166, 174, 194),
    "cyan": (34, 211, 238),
    "purple": (103, 80, 246),
    "green": (16, 185, 129),
    "orange": (245, 158, 11),
    "red": (248, 82, 92),
}


@dataclass(frozen=True)
class Frame:
    stem: str
    headline: str
    subtitle: str
    screen: str


FRAMES = [
    Frame("01_approve", "Connect any computer", "Tailscale, home Wi-Fi, or USB", "connect"),
    Frame("02_block", "Control your AI agent", "Chat and send files from anywhere", "chat"),
    Frame("03_standing", "Approve risky actions", "Allow once or block in one tap", "approval"),
    Frame("04_pair", "Set safety rules once", "Stop destructive commands automatically", "rules"),
    Frame("05_thumbgate", "Hermes learns what works", "Rate replies and keep the context", "memory"),
    Frame("06_works", "One phone. Every computer.", "Move between your machines instantly", "machines"),
]

MAX_PAIR_SIMILARITY = 90.0
BASE_PHONE = (900, 1740)
BANNED_PUBLIC_COPY = (
    r"\byour mac\b",
    r"\bmac from phone\b",
    "pay once",
    "759k",
    "igors-",
    r"\b100\.",
    "not connected",
    "outdated connection",
    "replies may fail",
)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        "/System/Library/Fonts/SFNSRounded.ttf" if bold else "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ]
    for path in paths:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def text_height(draw: ImageDraw.ImageDraw, value: str, fnt: ImageFont.FreeTypeFont) -> int:
    box = draw.textbbox((0, 0), value, font=fnt)
    return box[3] - box[1]


def wrap_lines(draw: ImageDraw.ImageDraw, value: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=fnt)[2] > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    max_width: int,
    spacing: int = 12,
) -> int:
    x, y = xy
    line_h = text_height(draw, "Ag", fnt)
    for line in wrap_lines(draw, value, fnt, max_width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += line_h + spacing
    return y


def rounded_card(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    *,
    fill: tuple[int, int, int] = COLORS["panel2"],
    outline: tuple[int, int, int] = COLORS["line"],
    radius: int = 30,
    width: int = 2,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_status_bar(draw: ImageDraw.ImageDraw) -> None:
    draw.text((52, 38), "9:41", font=font(30, True), fill=COLORS["text"])
    draw.text((710, 38), "5G  100%", font=font(26, True), fill=COLORS["muted"])


def draw_header(draw: ImageDraw.ImageDraw, title: str, status: str | None = None) -> None:
    draw.text((48, 114), "H", font=font(44, True), fill=COLORS["purple"])
    draw.text((118, 112), title, font=font(40, True), fill=COLORS["text"])
    draw.text((802, 112), "•••", font=font(30, True), fill=COLORS["muted"])
    if status:
        draw.ellipse((52, 190, 70, 208), fill=COLORS["green"])
        draw.text((88, 181), status, font=font(27, True), fill=COLORS["green"])
    draw.line((42, 238, 858, 238), fill=COLORS["line"], width=2)


def draw_tabs(draw: ImageDraw.ImageDraw, active: str) -> None:
    draw.line((0, 1600, 900, 1600), fill=COLORS["line"], width=2)
    tabs = [(170, "Hermes"), (440, "Leash"), (710, "Settings")]
    for x, label in tabs:
        color = COLORS["purple"] if label == active else COLORS["muted"]
        draw.text((x - 48, 1640), label, font=font(25, True), fill=color)
        if label == active:
            draw.ellipse((x - 5, 1688, x + 5, 1698), fill=COLORS["cyan"])


def connection_card(draw: ImageDraw.ImageDraw, y: int, title: str, route: str, selected: bool = False) -> None:
    outline = COLORS["cyan"] if selected else COLORS["line"]
    rounded_card(draw, (64, y, 836, y + 190), outline=outline, radius=32, width=4 if selected else 2)
    ring = COLORS["green"] if selected else COLORS["muted"]
    draw.ellipse((98, y + 60, 158, y + 120), outline=ring, width=7)
    if selected:
        draw.ellipse((116, y + 78, 140, y + 102), fill=ring)
    draw.text((190, y + 42), title, font=font(35, True), fill=COLORS["text"])
    draw.text((190, y + 100), route, font=font(27), fill=COLORS["muted"])
    if selected:
        draw.text((190, y + 141), "Ready now", font=font(25, True), fill=COLORS["green"])


def screen_connect(draw: ImageDraw.ImageDraw) -> None:
    draw_header(draw, "Choose your computer")
    draw.text((64, 282), "YOUR COMPUTERS", font=font(25, True), fill=COLORS["muted"])
    connection_card(draw, 340, "Workstation", "Tailscale", selected=True)
    connection_card(draw, 560, "Home server", "Home Wi-Fi")
    connection_card(draw, 780, "Nearby computer", "USB cable")
    rounded_card(draw, (64, 1038, 836, 1148), fill=COLORS["purple"], outline=COLORS["purple"], radius=28)
    label = "Connect"
    width = draw.textbbox((0, 0), label, font=font(33, True))[2]
    draw.text(((900 - width) // 2, 1072), label, font=font(33, True), fill=COLORS["text"])
    draw.text((64, 1210), "Add by Tailscale address", font=font(29, True), fill=COLORS["cyan"])
    rounded_card(draw, (64, 1270, 836, 1375), fill=COLORS["panel"], radius=25)
    draw.text((96, 1300), "computer-name.tailnet.ts.net", font=font(25), fill=COLORS["muted"])
    draw_tabs(draw, "Settings")


def screen_chat(draw: ImageDraw.ImageDraw) -> None:
    draw_header(draw, "New chat", "Your computer · Connected · Tailscale")
    rounded_card(draw, (70, 310, 710, 490), fill=(36, 33, 42), radius=34)
    draw.text((108, 350), "Review the release", font=font(31, True), fill=COLORS["text"])
    draw.text((108, 402), "and run the checks.", font=font(31), fill=COLORS["text"])
    rounded_card(draw, (190, 550, 830, 780), fill=COLORS["panel2"], radius=34)
    draw.text((228, 590), "All checks passed.", font=font(31, True), fill=COLORS["text"])
    draw.text((228, 650), "The release is ready", font=font(29), fill=COLORS["text"])
    draw.text((228, 700), "for your approval.", font=font(29), fill=COLORS["text"])
    rounded_card(draw, (228, 810, 390, 878), fill=(25, 45, 42), outline=COLORS["green"], radius=22)
    draw.text((264, 826), "Helpful", font=font(23, True), fill=COLORS["green"])
    rounded_card(draw, (410, 810, 590, 878), radius=22)
    draw.text((446, 826), "Improve", font=font(23, True), fill=COLORS["muted"])
    rounded_card(draw, (64, 1390, 836, 1518), fill=(27, 31, 42), outline=COLORS["line"], radius=58)
    draw.text((104, 1431), "Message your computer…", font=font(28), fill=COLORS["muted"])
    draw.ellipse((742, 1404, 818, 1480), fill=COLORS["text"])
    draw.text((768, 1416), "↑", font=font(36, True), fill=COLORS["bg"])
    draw_tabs(draw, "Hermes")


def screen_approval(draw: ImageDraw.ImageDraw) -> None:
    draw_header(draw, "Leash", "1 action needs approval")
    draw.text((64, 285), "PROTECTED ACTION", font=font(25, True), fill=COLORS["orange"])
    rounded_card(draw, (64, 340, 836, 1050), fill=(31, 25, 39), outline=COLORS["orange"], radius=36, width=4)
    draw.text((104, 392), "Production deploy", font=font(39, True), fill=COLORS["text"])
    draw.text((104, 465), "Hermes wants to run:", font=font(27), fill=COLORS["muted"])
    rounded_card(draw, (104, 530, 796, 650), fill=(10, 13, 22), outline=COLORS["line"], radius=20)
    draw.text((138, 566), "npm run deploy", font=font(31, True), fill=COLORS["cyan"])
    draw.text((104, 720), "Why approval is required", font=font(28, True), fill=COLORS["text"])
    draw.text((104, 775), "This action writes to production.", font=font(26), fill=COLORS["muted"])
    rounded_card(draw, (104, 865, 432, 970), fill=(49, 25, 35), outline=COLORS["red"], radius=25)
    draw.text((214, 896), "Block", font=font(30, True), fill=COLORS["red"])
    rounded_card(draw, (462, 865, 796, 970), fill=COLORS["purple"], outline=COLORS["purple"], radius=25)
    draw.text((529, 896), "Allow once", font=font(30, True), fill=COLORS["text"])
    draw.text((64, 1115), "You stay in control", font=font(34, True), fill=COLORS["green"])
    draw.text((64, 1170), "Nothing runs until you decide.", font=font(27), fill=COLORS["muted"])
    draw_tabs(draw, "Leash")


def rule_card(draw: ImageDraw.ImageDraw, y: int, title: str, detail: str) -> None:
    rounded_card(draw, (64, y, 836, y + 185), radius=30)
    draw.text((100, y + 38), title, font=font(29, True), fill=COLORS["text"])
    draw.text((100, y + 92), detail, font=font(24), fill=COLORS["muted"])
    draw.rounded_rectangle((710, y + 60, 798, y + 112), radius=26, fill=(24, 104, 92))
    draw.ellipse((752, y + 58, 806, y + 114), fill=(105, 224, 200))


def screen_rules(draw: ImageDraw.ImageDraw) -> None:
    draw_header(draw, "Safety rules", "Synced to your computer")
    draw.text((64, 285), "AUTOMATIC PROTECTION", font=font(25, True), fill=COLORS["muted"])
    rule_card(draw, 345, "Block destructive commands", "rm, disk erase, and force-push")
    rule_card(draw, 560, "Protect production", "Require approval before deploys")
    rule_card(draw, 775, "Guard credentials", "Block access to private keys")
    rounded_card(draw, (64, 1045, 836, 1185), fill=(18, 42, 44), outline=COLORS["green"], radius=30)
    draw.text((104, 1081), "✓  Three protections active", font=font(30, True), fill=COLORS["green"])
    draw.text((104, 1132), "Rules follow your active computer.", font=font(24), fill=COLORS["muted"])
    draw_tabs(draw, "Leash")


def screen_memory(draw: ImageDraw.ImageDraw) -> None:
    draw_header(draw, "Reply feedback", "Hermes remembers what works")
    rounded_card(draw, (64, 310, 836, 795), fill=COLORS["panel2"], radius=34)
    draw.text((104, 360), "Release summary", font=font(31, True), fill=COLORS["cyan"])
    body = "The build passed its safety checks and is ready for review."
    draw_wrapped(draw, (104, 430), body, font(30), COLORS["text"], 670, spacing=18)
    draw.text((104, 640), "Was this useful?", font=font(27, True), fill=COLORS["muted"])
    rounded_card(draw, (104, 695, 286, 770), fill=(27, 44, 43), outline=COLORS["green"], radius=24)
    draw.text((140, 713), "Helpful", font=font(23, True), fill=COLORS["green"])
    rounded_card(draw, (310, 695, 502, 770), radius=24)
    draw.text((348, 713), "Improve", font=font(23, True), fill=COLORS["muted"])
    rounded_card(draw, (64, 865, 836, 1055), fill=(20, 39, 48), outline=COLORS["cyan"], radius=32)
    draw.text((104, 910), "Preference remembered", font=font(32, True), fill=COLORS["cyan"])
    draw.text((104, 970), "Future summaries stay concise.", font=font(27), fill=COLORS["muted"])
    draw.text((64, 1140), "Your feedback stays with Hermes", font=font(29, True), fill=COLORS["text"])
    draw_tabs(draw, "Hermes")


def machine_card(draw: ImageDraw.ImageDraw, y: int, title: str, route: str, active: bool = False) -> None:
    outline = COLORS["cyan"] if active else COLORS["line"]
    rounded_card(draw, (64, y, 836, y + 205), outline=outline, radius=32, width=4 if active else 2)
    color = COLORS["green"] if active else COLORS["cyan"]
    draw.ellipse((102, y + 67, 162, y + 127), outline=color, width=7)
    draw.ellipse((121, y + 86, 143, y + 108), fill=color)
    draw.text((194, y + 43), title, font=font(34, True), fill=COLORS["text"])
    draw.text((194, y + 102), route, font=font(27), fill=COLORS["muted"])
    draw.text((194, y + 150), "Active now" if active else "Ready to connect", font=font(25, True), fill=color)


def screen_machines(draw: ImageDraw.ImageDraw) -> None:
    draw_header(draw, "Your computers", "Switch without losing your place")
    draw.text((64, 285), "AVAILABLE NOW", font=font(25, True), fill=COLORS["muted"])
    machine_card(draw, 345, "Workstation", "Tailscale · Connected", active=True)
    machine_card(draw, 585, "Laptop", "Home Wi-Fi")
    machine_card(draw, 825, "Home server", "Tailscale")
    rounded_card(draw, (64, 1100, 836, 1218), fill=COLORS["purple"], outline=COLORS["purple"], radius=28)
    label = "Find computers"
    width = draw.textbbox((0, 0), label, font=font(31, True))[2]
    draw.text(((900 - width) // 2, 1138), label, font=font(31, True), fill=COLORS["text"])
    draw.text((64, 1285), "Use the same app across your machines.", font=font(26), fill=COLORS["muted"])
    draw_tabs(draw, "Settings")


SCREEN_DRAWERS: dict[str, Callable[[ImageDraw.ImageDraw], None]] = {
    "connect": screen_connect,
    "chat": screen_chat,
    "approval": screen_approval,
    "rules": screen_rules,
    "memory": screen_memory,
    "machines": screen_machines,
}


def render_phone(screen: str) -> Image.Image:
    phone = Image.new("RGB", BASE_PHONE, COLORS["bg"])
    draw = ImageDraw.Draw(phone)
    draw_status_bar(draw)
    SCREEN_DRAWERS[screen](draw)
    return phone


def gradient_background(size: tuple[int, int], accent: tuple[int, int, int]) -> Image.Image:
    w, h = size
    image = Image.new("RGBA", size, COLORS["bg"] + (255,))
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        (int(w * 0.18), -int(h * 0.20), int(w * 1.45), int(h * 0.56)),
        fill=accent + (82,),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(max(70, w // 7)))
    image = Image.alpha_composite(image, glow)
    return image.convert("RGB")


def paste_phone(base: Image.Image, phone: Image.Image, top: int) -> None:
    w, h = base.size
    max_w = int(w * 0.88)
    max_h = h - top + int(h * 0.035)
    scale = min(max_w / phone.width, max_h / phone.height)
    pw, ph = int(phone.width * scale), int(phone.height * scale)
    resized = phone.resize((pw, ph), Image.Resampling.LANCZOS)
    x = (w - pw) // 2

    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x - 14, top - 14, x + pw + 14, top + ph + 20), radius=max(34, w // 28), fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(12, w // 55)))
    base.paste(shadow, (0, 0), shadow)

    frame = Image.new("RGBA", (pw + 24, ph + 24), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle((0, 0, pw + 23, ph + 23), radius=max(28, w // 32), fill=(6, 8, 15), outline=COLORS["purple"], width=max(5, w // 150))
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw, ph), radius=max(24, w // 36), fill=255)
    frame.paste(resized, (12, 12), mask)
    base.paste(frame, (x - 12, top - 12), frame)


def make_frame(frame: Frame, canvas: tuple[int, int], outfile: Path) -> None:
    w, h = canvas
    accent = COLORS["cyan"] if frame.screen in {"connect", "chat", "machines"} else COLORS["purple"]
    image = gradient_background(canvas, accent)
    draw = ImageDraw.Draw(image)

    left = int(w * 0.065)
    max_width = int(w * 0.87)
    brand = font(max(28, w // 31), True)
    headline = font(max(56, w // 14), True)
    subtitle = font(max(28, w // 31), False)
    y = int(h * 0.035)
    draw.text((left, y), "HERMES MOBILE", font=brand, fill=COLORS["cyan"])
    y += int(h * 0.045)
    y = draw_wrapped(draw, (left, y), frame.headline, headline, COLORS["text"], max_width, spacing=max(8, w // 100))
    y += int(h * 0.012)
    y = draw_wrapped(draw, (left, y), frame.subtitle, subtitle, COLORS["muted"], max_width, spacing=max(6, w // 140))
    top = max(y + int(h * 0.035), int(h * 0.225))

    paste_phone(image, render_phone(frame.screen), top)
    outfile.parent.mkdir(parents=True, exist_ok=True)
    image.save(outfile, format="PNG", optimize=True)


def make_feature_graphic() -> None:
    """Render the Play browse graphic around the product outcome, never price/platform lock-in."""
    w, h = 1024, 500
    image = gradient_background((w, h), COLORS["cyan"])
    draw = ImageDraw.Draw(image)

    # Compact vector mark; avoids coupling the graphic to adaptive-icon padding.
    mark = (58, 58, 150, 150)
    draw.rounded_rectangle(mark, radius=24, fill=COLORS["purple"])
    draw.rounded_rectangle((82, 78, 96, 132), radius=7, fill=COLORS["text"])
    draw.rounded_rectangle((112, 78, 126, 132), radius=7, fill=COLORS["text"])
    draw.rounded_rectangle((86, 99, 122, 113), radius=7, fill=COLORS["cyan"])
    draw.text((176, 62), "HERMES MOBILE", font=font(27, True), fill=COLORS["cyan"])

    draw.text((58, 184), "Control your AI agent", font=font(53, True), fill=COLORS["text"])
    draw.text((58, 248), "from anywhere", font=font(53, True), fill=COLORS["text"])
    draw.text((60, 332), "Connect. Chat. Approve safely.", font=font(29), fill=COLORS["muted"])

    pill_y = 402
    pills = [
        (58, 245, "TAILSCALE"),
        (266, 433, "HOME WI-FI"),
        (454, 580, "USB"),
    ]
    for x1, x2, label in pills:
        rounded_card(draw, (x1, pill_y, x2, pill_y + 56), fill=(18, 31, 45), outline=COLORS["cyan"], radius=28)
        label_font = font(20, True)
        label_width = draw.textbbox((0, 0), label, font=label_font)[2]
        draw.text((x1 + (x2 - x1 - label_width) // 2, pill_y + 17), label, font=label_font, fill=COLORS["cyan"])

    # A single high-signal approval card makes the differentiator legible at browse size.
    rounded_card(draw, (675, 70, 966, 430), fill=(18, 22, 37), outline=COLORS["purple"], radius=34, width=4)
    draw.text((716, 112), "LEASH", font=font(22, True), fill=COLORS["orange"])
    draw.text((716, 158), "Action needs", font=font(31, True), fill=COLORS["text"])
    draw.text((716, 198), "approval", font=font(31, True), fill=COLORS["text"])
    rounded_card(draw, (716, 260, 925, 310), fill=(9, 12, 21), outline=COLORS["line"], radius=14)
    draw.text((738, 275), "npm run deploy", font=font(19, True), fill=COLORS["cyan"])
    rounded_card(draw, (716, 338, 812, 390), fill=(48, 24, 35), outline=COLORS["red"], radius=17)
    draw.text((742, 353), "Block", font=font(18, True), fill=COLORS["red"])
    rounded_card(draw, (828, 338, 925, 390), fill=COLORS["purple"], outline=COLORS["purple"], radius=17)
    draw.text((842, 353), "Allow", font=font(18, True), fill=COLORS["text"])

    OUT_FEATURE.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT_FEATURE, format="PNG", optimize=True)


def pixel_similarity(a: Path, b: Path) -> float:
    i1 = Image.open(a).convert("RGB").resize((270, 480))
    i2 = Image.open(b).convert("RGB").resize((270, 480))
    pa, pb = i1.tobytes(), i2.tobytes()
    return 100.0 * sum(1 for x, y in zip(pa, pb) if x == y) / len(pa)


def validate_pairwise(files: list[Path]) -> dict[str, float]:
    report: dict[str, float] = {}
    bad: list[str] = []
    for a, b in combinations(files, 2):
        score = pixel_similarity(a, b)
        key = f"{a.stem}_vs_{b.stem}"
        report[key] = round(score, 2)
        if score >= MAX_PAIR_SIMILARITY:
            bad.append(f"{key}={score:.1f}%")
    if bad:
        raise SystemExit("Generated store frames are too similar: " + "; ".join(bad))
    return report


def contrast_ratio(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    def luminance(rgb: tuple[int, int, int]) -> float:
        normalized = []
        for channel in rgb:
            value = channel / 255.0
            normalized.append(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4)
        return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2]

    lighter, darker = sorted((luminance(a), luminance(b)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def validate_public_copy() -> dict[str, float]:
    visible = "\n".join(
        [f"{frame.headline}\n{frame.subtitle}" for frame in FRAMES]
        + [
            "Your computer Connected Tailscale",
            "Choose your computer Workstation Home server Nearby computer",
            "Production deploy npm run deploy Allow once Block",
            "Safety rules Protect production Guard credentials",
            "Preference remembered Helpful Improve",
        ]
    ).lower()
    hits = [term for term in BANNED_PUBLIC_COPY if re.search(term, visible)]
    if hits:
        raise SystemExit(f"Banned store copy present: {hits}")

    ratios = {
        "headline_on_background": round(contrast_ratio(COLORS["text"], COLORS["bg"]), 2),
        "subtitle_on_background": round(contrast_ratio(COLORS["muted"], COLORS["bg"]), 2),
        "cyan_on_background": round(contrast_ratio(COLORS["cyan"], COLORS["bg"]), 2),
    }
    low = {name: value for name, value in ratios.items() if value < 4.5}
    if low:
        raise SystemExit(f"Store text fails WCAG AA contrast: {low}")
    return ratios


def main() -> int:
    contrast = validate_public_copy()
    for out_dir in (OUT_PLAY, OUT_IOS):
        out_dir.mkdir(parents=True, exist_ok=True)
        for stale in out_dir.glob("*.png"):
            stale.unlink(missing_ok=True)

    for idx, frame in enumerate(FRAMES, start=1):
        make_frame(frame, (1080, 1920), OUT_PLAY / f"{frame.stem}.png")
        make_frame(frame, (1290, 2796), OUT_IOS / f"{frame.stem}_67.png")
        make_frame(frame, (2048, 2732), OUT_IOS / f"{frame.stem}_ipad129.png")
        print(f"frame {idx}/6: {frame.headline}")

    make_feature_graphic()
    print("feature graphic: Control your AI agent from anywhere")

    play_files = sorted(OUT_PLAY.glob("*.png"))
    similarity = validate_pairwise(play_files)
    assets: dict[str, dict[str, int]] = {}
    for path in play_files + sorted(OUT_IOS.glob("*.png")):
        with Image.open(path) as img:
            assets[str(path.relative_to(ROOT))] = {"width": img.width, "height": img.height}
    with Image.open(OUT_FEATURE) as feature:
        if feature.size != (1024, 500):
            raise SystemExit(f"Play feature graphic has invalid dimensions: {feature.size}")
        assets[str(OUT_FEATURE.relative_to(ROOT))] = {"width": feature.width, "height": feature.height}

    manifest = ROOT / "docs/store-assets/generated-manifest.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(
        json.dumps(
            {
                "generator": "deterministic-product-story-v2",
                "privacy": "No runtime screenshots, personal identifiers, addresses, or user content",
                "frames": [
                    {"stem": f.stem, "headline": f.headline, "subtitle": f.subtitle, "screen": f.screen}
                    for f in FRAMES
                ],
                "assets": assets,
                "contrastRatios": contrast,
                "framedSimilarity": similarity,
                "ascNote": "Only _67 + ipad129 emitted to avoid APP_IPHONE_67 double-upload",
            },
            indent=2,
        )
        + "\n"
    )
    print(
        json.dumps(
            {
                "ok": True,
                "frames": len(FRAMES),
                "assets": len(assets),
                "maxSimilarity": max(similarity.values()),
                "contrastRatios": contrast,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
