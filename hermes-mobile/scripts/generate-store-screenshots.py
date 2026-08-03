#!/usr/bin/env python3
"""Generate six deterministic, privacy-safe Hermes Mobile store screenshots."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont, __version__ as PILLOW_VERSION


ROOT = Path(__file__).resolve().parents[1]
SCENE_VERSION = "deterministic-product-render-v2"
REQUIRED_PILLOW_VERSION = "11.3.0"

COLORS = {
    "page_top": (8, 13, 28),
    "page_bottom": (22, 20, 57),
    "screen": (9, 14, 29),
    "surface": (20, 27, 48),
    "surface_alt": (26, 35, 61),
    "line": (62, 74, 108),
    "white": (247, 249, 255),
    "muted": (164, 174, 199),
    "cyan": (38, 216, 238),
    "purple": (107, 92, 255),
    "green": (54, 211, 153),
    "amber": (251, 191, 36),
    "red": (248, 113, 113),
}

SCENES: tuple[dict[str, str], ...] = (
    {
        "id": "connect",
        "stem": "01_approve",
        "headline": "Connect your computer",
        "subtitle": "Home Wi-Fi or Tailscale",
        "accent": "cyan",
    },
    {
        "id": "run",
        "stem": "02_block",
        "headline": "Run your AI from anywhere",
        "subtitle": "Send work, files, and follow-ups",
        "accent": "purple",
    },
    {
        "id": "approve",
        "stem": "03_standing",
        "headline": "Approve risky actions",
        "subtitle": "Block or allow once in one tap",
        "accent": "amber",
    },
    {
        "id": "rules",
        "stem": "04_pair",
        "headline": "Stay on top of approvals",
        "subtitle": "Prioritize alerts. Decide one at a time",
        "accent": "red",
    },
    {
        "id": "learn",
        "stem": "05_thumbgate",
        "headline": "Teach Hermes what works",
        "subtitle": "Feedback improves future runs",
        "accent": "green",
    },
    {
        "id": "switch",
        "stem": "06_works",
        "headline": "One phone. Every computer.",
        "subtitle": "Switch machines without losing context",
        "accent": "cyan",
    },
)

OUTPUTS = (
    {
        "deviceClass": "play",
        "directory": "fastlane/metadata/android/en-US/images/phoneScreenshots",
        "size": (1080, 1920),
        "suffix": ".png",
        "tablet": False,
    },
    {
        "deviceClass": "iphone",
        "directory": "fastlane/screenshots/en-US",
        "size": (1290, 2796),
        "suffix": "_67.png",
        "tablet": False,
    },
    {
        "deviceClass": "ipad",
        "directory": "fastlane/screenshots/en-US",
        "size": (2048, 2732),
        "suffix": "_ipad129.png",
        "tablet": True,
    },
)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    del bold
    if PILLOW_VERSION != REQUIRED_PILLOW_VERSION:
        raise RuntimeError(
            f"Pillow {REQUIRED_PILLOW_VERSION} is required for byte-identical store assets; "
            f"found {PILLOW_VERSION}"
        )
    return ImageFont.load_default(size=size)


def fit_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    start_size: int,
    minimum: int,
    bold: bool = True,
) -> ImageFont.FreeTypeFont:
    for size in range(start_size, minimum - 1, -2):
        candidate = font(size, bold=bold)
        if draw.textbbox((0, 0), text, font=candidate)[2] <= max_width:
            return candidate
    return font(minimum, bold=bold)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def gradient(size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, COLORS["page_top"])
    draw = ImageDraw.Draw(image)
    top = COLORS["page_top"]
    bottom = COLORS["page_bottom"]
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(round(a + (b - a) * ratio) for a, b in zip(top, bottom))
        draw.line((0, y, width, y), fill=color)
    return image


def rounded_panel(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    *,
    outline: tuple[int, int, int] | None = None,
    radius: int = 26,
    width: int = 2,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    size: int,
    *,
    color: tuple[int, int, int] | None = None,
    bold: bool = False,
) -> None:
    draw.text(xy, value, font=font(size, bold=bold), fill=color or COLORS["white"])


def draw_pill(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    label: str,
    *,
    fill: tuple[int, int, int],
    color: tuple[int, int, int] | None = None,
    outline: tuple[int, int, int] | None = None,
    size: int = 25,
) -> None:
    rounded_panel(draw, box, fill, outline=outline, radius=(box[3] - box[1]) // 2, width=2)
    label_font = font(size, bold=True)
    bounds = draw.textbbox((0, 0), label, font=label_font)
    x = box[0] + (box[2] - box[0] - (bounds[2] - bounds[0])) // 2
    y = box[1] + (box[3] - box[1] - (bounds[3] - bounds[1])) // 2 - bounds[1]
    draw.text((x, y), label, font=label_font, fill=color or COLORS["white"])


def draw_header(draw: ImageDraw.ImageDraw, width: int, title: str, detail: str) -> None:
    draw_text(draw, (58, 66), title, 44, bold=True)
    draw_pill(
        draw,
        (width - 288, 60, width - 58, 116),
        detail,
        fill=(20, 56, 52),
        color=COLORS["green"],
        outline=(44, 111, 93),
        size=22,
    )
    draw.line((58, 150, width - 58, 150), fill=COLORS["line"], width=2)


def draw_bottom_navigation(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    active: str,
) -> None:
    top = height - 132
    draw.rectangle((0, top, width, height), fill=(11, 17, 34))
    draw.line((0, top, width, top), fill=COLORS["line"], width=2)
    tabs = (("Hermes", "hermes"), ("Leash", "leash"), ("Settings", "settings"))
    segment = width // len(tabs)
    for index, (label, key) in enumerate(tabs):
        center = segment * index + segment // 2
        selected = key == active
        color = COLORS["purple"] if selected else COLORS["muted"]
        draw.ellipse((center - 13, top + 22, center + 13, top + 48), fill=color)
        text_font = font(23, bold=selected)
        bounds = draw.textbbox((0, 0), label, font=text_font)
        draw.text(
            (center - (bounds[2] - bounds[0]) // 2, top + 66),
            label,
            font=text_font,
            fill=color,
        )


def draw_machine_row(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    name: str,
    route: str,
    state: str,
    state_color: tuple[int, int, int],
) -> None:
    rounded_panel(draw, box, COLORS["surface"], outline=COLORS["line"], radius=24)
    x1, y1, x2, y2 = box
    draw.ellipse((x1 + 28, y1 + 35, x1 + 64, y1 + 71), fill=state_color)
    draw_text(draw, (x1 + 86, y1 + 25), name, 31, bold=True)
    draw_text(draw, (x1 + 86, y1 + 70), route, 23, color=COLORS["muted"])
    pill_width = 160
    draw_pill(
        draw,
        (x2 - pill_width - 28, y1 + 43, x2 - 28, y1 + 91),
        state,
        fill=(21, 31, 55),
        color=state_color,
        outline=state_color,
        size=20,
    )


def draw_connect(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    draw_header(draw, width, "Choose your computer", "Searching")
    draw_text(draw, (70, 205), "Nearby and saved computers", 28, color=COLORS["muted"])
    row_width = width - 140
    draw_machine_row(
        draw,
        (70, 260, 70 + row_width, 410),
        "Studio",
        "Tailscale",
        "Connected",
        COLORS["green"],
    )
    draw_machine_row(
        draw,
        (70, 440, 70 + row_width, 590),
        "Laptop",
        "Home Wi-Fi",
        "Available",
        COLORS["cyan"],
    )
    draw_machine_row(
        draw,
        (70, 620, 70 + row_width, 770),
        "Build server",
        "Tailscale",
        "Available",
        COLORS["purple"],
    )
    rounded_panel(draw, (70, 830, width - 70, 1050), COLORS["surface_alt"], radius=28)
    draw_text(draw, (105, 875), "Connect another computer", 34, bold=True)
    draw_text(draw, (105, 930), "Scan a pairing code or enter a secure address.", 24, color=COLORS["muted"])
    draw_pill(
        draw,
        (105, 990, width - 105, 1055),
        "Scan pairing code",
        fill=COLORS["purple"],
        size=25,
    )


def draw_run(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    draw_header(draw, width, "Chat with your computer", "Connected")
    draw_text(draw, (70, 205), "Release workspace", 26, color=COLORS["cyan"], bold=True)
    rounded_panel(draw, (250, 275, width - 70, 430), COLORS["purple"], radius=28)
    draw_text(draw, (285, 315), "Prepare a safe release plan.", 30, bold=True)
    rounded_panel(draw, (70, 480, width - 210, 735), COLORS["surface"], outline=COLORS["line"], radius=28)
    draw_text(draw, (105, 520), "Release plan ready", 33, bold=True)
    checklist = (
        ("✓", "Tests passed"),
        ("✓", "No secrets detected"),
        ("✓", "Rollback prepared"),
    )
    for index, (mark, label) in enumerate(checklist):
        y = 585 + index * 50
        draw_text(draw, (110, y), mark, 27, color=COLORS["green"], bold=True)
        draw_text(draw, (150, y), label, 25, color=COLORS["muted"])
    rounded_panel(draw, (70, 790, width - 70, 875), COLORS["surface_alt"], radius=22)
    draw_text(draw, (105, 817), "release-plan.md", 25, color=COLORS["cyan"], bold=True)
    rounded_panel(draw, (70, 1040, width - 70, 1135), COLORS["surface"], outline=COLORS["line"], radius=30)
    draw_text(draw, (110, 1071), "Ask Hermes to work on your computer", 24, color=COLORS["muted"])
    draw.ellipse((width - 150, 1060, width - 90, 1120), fill=COLORS["purple"])


def draw_approve(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    draw_header(draw, width, "Leash approval", "Action paused")
    rounded_panel(draw, (70, 225, width - 70, 940), COLORS["surface"], outline=(112, 87, 47), radius=32)
    draw_pill(
        draw,
        (110, 275, 350, 335),
        "APPROVAL REQUIRED",
        fill=(76, 53, 27),
        color=COLORS["amber"],
        outline=(128, 90, 36),
        size=20,
    )
    draw_text(draw, (110, 385), "Publish changes", 40, bold=True)
    draw_text(draw, (110, 445), "This action affects the production branch.", 25, color=COLORS["muted"])
    rounded_panel(draw, (110, 515, width - 110, 665), (11, 18, 34), radius=20)
    draw_text(draw, (145, 555), "git push origin main", 29, color=COLORS["white"], bold=True)
    draw_text(draw, (145, 610), "Risk: production write", 23, color=COLORS["amber"])
    draw_text(draw, (110, 715), "Hermes is waiting for your decision.", 25, color=COLORS["muted"])
    draw_pill(
        draw,
        (110, 790, (width // 2) - 16, 870),
        "Block",
        fill=(72, 34, 48),
        color=COLORS["red"],
        outline=COLORS["red"],
        size=27,
    )
    draw_pill(
        draw,
        ((width // 2) + 16, 790, width - 110, 870),
        "Allow once",
        fill=COLORS["purple"],
        size=27,
    )


def draw_rule_row(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    detail: str,
    color: tuple[int, int, int],
) -> None:
    rounded_panel(draw, box, COLORS["surface"], outline=COLORS["line"], radius=24)
    x1, y1, x2, _ = box
    draw.ellipse((x1 + 30, y1 + 37, x1 + 66, y1 + 73), fill=color)
    draw_text(draw, (x1 + 88, y1 + 25), title, 29, bold=True)
    draw_text(draw, (x1 + 88, y1 + 72), detail, 22, color=COLORS["muted"])
    draw_pill(
        draw,
        (x2 - 126, y1 + 45, x2 - 28, y1 + 93),
        "ON",
        fill=(25, 61, 51),
        color=COLORS["green"],
        outline=COLORS["green"],
        size=21,
    )


def draw_rules(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    draw_header(draw, width, "Approval settings", "Ready")
    draw_text(draw, (70, 205), "Choose how pending decisions reach you", 27, color=COLORS["muted"])
    draw_rule_row(
        draw,
        (70, 270, width - 70, 430),
        "Quick-approve layout",
        "One approval at a time with bigger buttons",
        COLORS["amber"],
    )
    draw_rule_row(
        draw,
        (70, 460, width - 70, 620),
        "Deny tool → capture block",
        "Capture rejected tools to ThumbGate",
        COLORS["purple"],
    )
    draw_rule_row(
        draw,
        (70, 650, width - 70, 810),
        "Allow tool → capture approval",
        "Capture approved tools to ThumbGate",
        COLORS["green"],
    )
    rounded_panel(draw, (70, 865, width - 70, 1030), COLORS["surface_alt"], radius=24)
    draw_text(draw, (105, 905), "Decide without opening your computer", 30, bold=True)
    draw_text(draw, (105, 955), "Hermes keeps pending approvals in one place.", 23, color=COLORS["muted"])


def draw_learn(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    draw_header(draw, width, "Reply feedback", "Saved")
    rounded_panel(draw, (70, 235, width - 70, 515), COLORS["surface"], outline=COLORS["line"], radius=28)
    draw_text(draw, (110, 280), "Release notes drafted", 34, bold=True)
    draw_text(draw, (110, 345), "Clear summary, risk notes, and rollback steps", 24, color=COLORS["muted"])
    draw.line((110, 405, width - 110, 405), fill=COLORS["line"], width=2)
    draw_text(draw, (110, 445), "Was this useful?", 25, color=COLORS["muted"])
    draw_pill(
        draw,
        (width - 400, 430, width - 240, 490),
        "Helpful",
        fill=(22, 66, 56),
        color=COLORS["green"],
        outline=COLORS["green"],
        size=22,
    )
    draw_pill(
        draw,
        (width - 220, 430, width - 90, 490),
        "Improve",
        fill=COLORS["surface_alt"],
        color=COLORS["muted"],
        outline=COLORS["line"],
        size=22,
    )
    rounded_panel(draw, (70, 580, width - 70, 820), (16, 48, 46), outline=(44, 118, 99), radius=28)
    draw.ellipse((110, 625, 160, 675), fill=COLORS["green"])
    draw_text(draw, (190, 615), "Preference remembered", 34, bold=True)
    draw_text(draw, (190, 675), "Future replies will keep the concise release format.", 24, color=COLORS["muted"])
    draw_text(draw, (70, 900), "You stay in control", 31, bold=True)
    draw_text(draw, (70, 955), "Review or remove saved preferences at any time.", 24, color=COLORS["muted"])


def draw_switch(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    draw_header(draw, width, "Your computers", "3 ready")
    draw_text(draw, (70, 205), "Continue the same work on another machine", 27, color=COLORS["muted"])
    draw_machine_row(
        draw,
        (70, 270, width - 70, 430),
        "Studio",
        "Current session · Tailscale",
        "Active",
        COLORS["green"],
    )
    draw_machine_row(
        draw,
        (70, 460, width - 70, 620),
        "Laptop",
        "Home Wi-Fi",
        "Ready",
        COLORS["cyan"],
    )
    draw_machine_row(
        draw,
        (70, 650, width - 70, 810),
        "Build server",
        "Secure tunnel",
        "Ready",
        COLORS["purple"],
    )
    rounded_panel(draw, (70, 870, width - 70, 1040), COLORS["surface_alt"], radius=26)
    draw_text(draw, (105, 910), "Your conversation moves with you", 31, bold=True)
    draw_text(draw, (105, 965), "Switch computers without starting over.", 24, color=COLORS["muted"])


SCENE_DRAWERS = {
    "connect": (draw_connect, "settings"),
    "run": (draw_run, "hermes"),
    "approve": (draw_approve, "leash"),
    "rules": (draw_rules, "settings"),
    "learn": (draw_learn, "leash"),
    "switch": (draw_switch, "settings"),
}


def render_product_screen(scene: dict[str, str], tablet: bool) -> Image.Image:
    logical_size = (1400, 1500) if tablet else (1000, 1600)
    screen = Image.new("RGB", logical_size, COLORS["screen"])
    draw = ImageDraw.Draw(screen)
    scene_drawer, active_tab = SCENE_DRAWERS[scene["id"]]

    if tablet:
        working = Image.new("RGB", (1000, 1600), COLORS["screen"])
        working_draw = ImageDraw.Draw(working)
        scene_drawer(working_draw, 1000, 1600)
        draw_bottom_navigation(working_draw, 1000, 1600, active_tab)
        working = working.resize((938, 1500), Image.Resampling.LANCZOS)
        screen.paste(working, ((1400 - 938) // 2, 0))
        draw.line((215, 0, 215, 1500), fill=(32, 42, 72), width=2)
        draw.line((1185, 0, 1185, 1500), fill=(32, 42, 72), width=2)
    else:
        scene_drawer(draw, 1000, 1600)
        draw_bottom_navigation(draw, 1000, 1600, active_tab)

    return screen


def render_frame(
    scene: dict[str, str],
    size: tuple[int, int],
    tablet: bool,
) -> Image.Image:
    width, height = size
    image = gradient(size)
    draw = ImageDraw.Draw(image)
    accent = COLORS[scene["accent"]]

    orb = Image.new("RGBA", size, (0, 0, 0, 0))
    orb_draw = ImageDraw.Draw(orb)
    orb_size = int(width * 0.72)
    orb_draw.ellipse(
        (width - orb_size // 2, -orb_size // 2, width + orb_size // 2, orb_size // 2),
        fill=(*accent, 48),
    )
    orb = orb.filter(ImageFilter.GaussianBlur(radius=max(28, width // 28)))
    image = Image.alpha_composite(image.convert("RGBA"), orb).convert("RGB")
    draw = ImageDraw.Draw(image)

    left = int(width * 0.07)
    draw_pill(
        draw,
        (left, int(height * 0.035), left + int(width * 0.29), int(height * 0.075)),
        "HERMES MOBILE",
        fill=(15, 48, 62),
        color=COLORS["cyan"],
        outline=(31, 104, 120),
        size=max(22, width // 39),
    )

    headline_y = int(height * 0.095)
    headline_font = fit_font(
        draw,
        scene["headline"],
        int(width * 0.86),
        max(58, width // 13),
        max(42, width // 22),
        bold=True,
    )
    draw.text((left, headline_y), scene["headline"], font=headline_font, fill=COLORS["white"])
    headline_bounds = draw.textbbox((left, headline_y), scene["headline"], font=headline_font)
    subtitle_y = headline_bounds[3] + int(height * 0.015)
    subtitle_font = fit_font(
        draw,
        scene["subtitle"],
        int(width * 0.86),
        max(31, width // 31),
        max(24, width // 45),
        bold=False,
    )
    draw.text((left, subtitle_y), scene["subtitle"], font=subtitle_font, fill=COLORS["muted"])

    product = render_product_screen(scene, tablet)
    available = (
        int(width * 0.07),
        int(height * 0.275),
        int(width * 0.93),
        int(height * 0.965),
    )
    available_width = available[2] - available[0]
    available_height = available[3] - available[1]
    scale = min(available_width / product.width, available_height / product.height)
    product = product.resize(
        (round(product.width * scale), round(product.height * scale)),
        Image.Resampling.LANCZOS,
    )
    x = (width - product.width) // 2
    y = available[1] + (available_height - product.height) // 2

    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (x - 15, y + 25, x + product.width + 15, y + product.height + 45),
        radius=max(34, width // 27),
        fill=(0, 0, 0, 145),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(18, width // 60)))
    image = Image.alpha_composite(image.convert("RGBA"), shadow)

    mask = Image.new("L", product.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, product.width - 1, product.height - 1),
        radius=max(28, width // 32),
        fill=255,
    )
    image.paste(product, (x, y), mask)
    frame_draw = ImageDraw.Draw(image)
    frame_draw.rounded_rectangle(
        (x, y, x + product.width - 1, y + product.height - 1),
        radius=max(28, width // 32),
        outline=(90, 102, 146, 255),
        width=max(3, width // 260),
    )
    return image.convert("RGB")


def clean_output_directories(output_root: Path) -> None:
    for output in OUTPUTS:
        directory = output_root / output["directory"]
        directory.mkdir(parents=True, exist_ok=True)
        for stale in directory.glob("*.png"):
            stale.unlink()


def generate_assets(output_root: Path = ROOT) -> dict[str, Any]:
    clean_output_directories(output_root)
    assets: dict[str, dict[str, Any]] = {}

    for output in OUTPUTS:
        for scene in SCENES:
            relative = Path(output["directory"]) / f'{scene["stem"]}{output["suffix"]}'
            destination = output_root / relative
            image = render_frame(scene, output["size"], output["tablet"])
            image.save(destination, format="PNG", optimize=True, compress_level=9)
            assets[relative.as_posix()] = {
                "deviceClass": output["deviceClass"],
                "scene": scene["id"],
                "width": image.width,
                "height": image.height,
                "sha256": sha256(destination),
            }

    manifest: dict[str, Any] = {
        "schemaVersion": 2,
        "source": SCENE_VERSION,
        "renderer": {
            "pillow": REQUIRED_PILLOW_VERSION,
            "font": "Pillow embedded default",
        },
        "frames": len(SCENES),
        "scenes": [
            {
                "id": scene["id"],
                "headline": scene["headline"],
                "subtitle": scene["subtitle"],
            }
            for scene in SCENES
        ],
        "assets": dict(sorted(assets.items())),
    }
    manifest_path = output_root / "docs/store-assets/generated-manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT,
        help="repository-shaped output root; defaults to hermes-mobile",
    )
    args = parser.parse_args()
    manifest = generate_assets(args.output_root.resolve())
    print(
        json.dumps(
            {
                "ok": True,
                "source": manifest["source"],
                "frames": manifest["frames"],
                "assets": len(manifest["assets"]),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
