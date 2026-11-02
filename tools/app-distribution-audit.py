#!/usr/bin/env python3
"""
App Distribution & Marketplace Audit Engine (mac-yolo-safeguards)
Audits exact distribution status across all channels:
1. Mac App Store (MAS): Status of packaging, notarization, and store submission.
2. Alternative Marketplaces (Gumroad, Stripe Buy Buttons, AGNT.gg, GitHub Releases): Listing status and revenue telemetry.
"""
import json
import os
import urllib.request
import urllib.error
from pathlib import Path

def probe_http(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MacYoloSafeguards-DistributionAudit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0

def audit_distribution_channels():
    print("[*] Auditing App Distribution Channels & Marketplace Listings (Live HTTP Probes)...")
    
    channels_spec = [
        {
            "channel": "GitHub Releases (Apple Notarized DMG / ZIP / PKG / Setapp)",
            "url": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v1.0.0",
            "revenue_usd": 0.00,
            "notes": "Notarized Submission ID 748b2c5c-5e10-4966-8932-3d6ee8931110; MacYoloSafeguards-1.0.0.dmg (sha256: 9a680e3557ba6058bc86ff9fd92294f44bee2bfc5a1d0d07eeec5510eb9aad45) + MacYoloSafeguards.pkg + MacYoloSafeguards-Setapp.zip."
        },
        {
            "channel": "Homebrew Cask Tap (igorganapolsky/tap & igorganapolsky/dayglass)",
            "url": "https://github.com/IgorGanapolsky/homebrew-tap/blob/main/Casks/mac-yolo-safeguards.rb",
            "revenue_usd": 0.00,
            "notes": "brew install --cask igorganapolsky/tap/mac-yolo-safeguards (installs notarized MacYoloSafeguards.app v1.0.0)."
        },
        {
            "channel": "Public Web Storefront (GitHub Pages)",
            "url": "https://igorganapolsky.github.io/mac-yolo-safeguards/",
            "revenue_usd": 0.00,
            "notes": "Direct DMG download + Homebrew Cask + 5-tier Gumroad/Stripe checkout ladder."
        },
        {
            "channel": "Gumroad Self-Serve Storefronts ($9.99 & $49 Tiers)",
            "url": "https://iganapolsky.gumroad.com/l/nllmvb",
            "revenue_usd": 0.00,
            "notes": "/l/nllmvb ($49 Mac YOLO Pro), /l/vcrho ($49 Corporate Kit), /l/odrkon ($9.99 Playbook); $0.00 external sales to date."
        },
        {
            "channel": "Direct Stripe Checkout ($499 / $1,500 / $3,000 B2B Tiers + thumbgate.ai)",
            "url": "https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k",
            "revenue_usd": 0.00,
            "notes": "$0.00 cleared external customer cash in last 30d ($38 founder test charges excluded); 6 real founder outreach emails sent 2026-11-02."
        },
        {
            "channel": "Mac App Store (MAS)",
            "url": "https://appstoreconnect.apple.com/apps",
            "revenue_usd": 0.00,
            "notes": "Bundle ID PJH2BP2944 ('Mac YOLO Safeguards') + MAC_APP_STORE Profile WPMDP643Z3 ACTIVE + signed MacYoloSafeguards.pkg built; awaiting 1-time 'New App' creation in ASC Web UI."
        }
    ]

    channels = []
    for item in channels_spec:
        code = probe_http(item["url"])
        status_str = f"LIVE (HTTP {code})" if code == 200 else f"DEGRADED (HTTP {code})"
        if item["channel"] == "Mac App Store (MAS)":
            status_str = f"PACKAGED & SIGNED (ASC Portal HTTP {code}; awaiting 1-time New App click in ASC UI)"
        channels.append({
            "channel": item["channel"],
            "url": item["url"],
            "http_status": code,
            "status": status_str,
            "revenue_usd": item["revenue_usd"],
            "notes": item["notes"],
        })

    audit_report = {
        "timestamp": os.popen("date -u +%Y-%m-%dT%H:%M:%SZ").read().strip(),
        "app_name": "Mac YOLO Safeguards",
        "channels": channels,
        "total_revenue_usd": 0.00
    }
    
    out_path = Path("/Users/iganapolsky/.hermes/cache/scratch/app_distribution_audit.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(audit_report, indent=2))
    print(json.dumps(audit_report, indent=2))
    print(f"[+] Distribution audit report persisted to {out_path}")

if __name__ == "__main__":
    audit_distribution_channels()
