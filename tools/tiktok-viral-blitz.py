#!/usr/bin/env python3
"""
Ultimate TikTok & Multi-Platform Viral Distribution Engine (mac-yolo-safeguards)
Generates high-retention TikTok video scripts, rendered 1080x1920 MP4 + 5-slide Photo Mode carousels,
captions, hashtags, and automated distribution payloads alongside Instagram Reels, YouTube Shorts,
X.com, Threads, Bluesky, LinkedIn, Dev.to, Hacker News, and Skool pointing directly to verified
live Gumroad ($9.99 / $49) and Stripe ($499 / $1,500 / $3,000) checkout links.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
REPO_ROOT = Path(__file__).resolve().parent.parent


def load_viral_generator():
    spec = importlib.util.spec_from_file_location(
        "viral_campaign_generator",
        str(REPO_ROOT / "tools" / "viral-campaign-generator.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def generate_tiktok_and_viral_payloads():
    gen = load_viral_generator()
    campaign = gen.generate_viral_campaign()
    tt = campaign["platforms"]["tiktok"]

    payloads = {
        "timestamp": campaign["timestamp"],
        "campaign": "Mac YOLO Safeguards TikTok & 10-Platform Viral Blitz",
        "campaign_id": campaign["campaign_id"],
        "outbound_spend_usd": 0.0,
        "checkout_ladder": {
            "playbook_9_99": gen.URLS["playbook_9_99"],
            "corporate_kit_49": gen.URLS["kit_49"],
            "diagnostic_499": gen.URLS["diagnostic_499"],
            "hardening_sprint_1500": gen.URLS["sprint_1500"],
            "partner_pilot_3000": gen.URLS["pilot_3000"],
        },
        "tiktok_script": {
            "hook": tt["hook"],
            "body": (
                "Every time I ran unattended coding swarms (Claude Code, Cursor, Hermes), orphaned child processes "
                "drove my Mac to Load Average 307 and risked $400 overnight API bills. So I built Mac YOLO Safeguards: "
                "a 474 KB native Rust HUD (11.32x faster scan), OS process-group reaper (with Herdr session protection), "
                "and a Gurobi-certified $10/mo token budget gate."
            ),
            "cta": (
                f"Grab the $9.99 Playbook ({gen.URLS['playbook_9_99']}), the $49 No-Approval Corporate-Expense Kit "
                f"({gen.URLS['kit_49']}), or book a $499 Live Diagnostic ({gen.URLS['diagnostic_499']})!"
            ),
            "video_mp4": tt["video_mp4"],
            "photo_mode_slides": tt["photo_mode_files"],
            "compose_url": tt["compose_url"],
            "api_endpoint": tt["api_endpoint"],
            "gate": tt["gate"],
            "hashtags": [
                "#ClaudeCode",
                "#CursorAI",
                "#TechTok",
                "#MacOS",
                "#RustLang",
                "#AIEngineering",
                "#FinOps",
                "#CodingTok",
            ],
        },
        "platforms": campaign["platforms"],
        "visual_self_qa": campaign["assets"]["visual_self_qa"],
        "all_gates_allow": campaign["all_gates_allow"],
        "status": "READY_FOR_GLOBAL_BLITZ",
    }

    out_path = Path("/Users/iganapolsky/.hermes/cache/scratch/tiktok_and_viral_blitz.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payloads, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": payloads["all_gates_allow"],
                "campaign": payloads["campaign"],
                "tiktok_video_mp4": tt["video_mp4"],
                "tiktok_photo_slides_count": len(tt["photo_mode_files"]),
                "platforms_count": len(payloads["platforms"]),
                "checkout_ladder": payloads["checkout_ladder"],
                "out_path": str(out_path),
            },
            indent=2,
        )
    )
    return payloads


if __name__ == "__main__":
    generate_tiktok_and_viral_payloads()
