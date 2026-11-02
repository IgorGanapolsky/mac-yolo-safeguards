#!/usr/bin/env python3
"""
Stripe Checkout & Distribution Link Generator (mac-yolo-safeguards)
Generates the public-facing landing and purchase integration script.
"""
import json
from pathlib import Path

def generate_distribution_links():
    distribution_data = {
        "product_name": "Mac YOLO Safeguards",
        "tagline": "Autonomous Mac Performance, Thermal Rescue & AI Orchestration Suite",
        "download_url": "file:///Users/iganapolsky/.hermes/cache/scratch/dmg_stage/MacYoloSafeguards.app",
        "purchase_tiers": [
            {
                "name": "Standard License",
                "price_usd": 49,
                "checkout_link": "https://buy.stripe.com/starter"
            },
            {
                "name": "Pro & Autonomous Suite",
                "price_usd": 499,
                "checkout_link": "https://buy.stripe.com/sprint"
            },
            {
                "name": "Enterprise Deployment",
                "price_usd": 2500,
                "checkout_link": "https://buy.stripe.com/enterprise"
            }
        ]
    }
    
    out_path = Path("/Users/iganapolsky/.hermes/cache/scratch/public_distribution_links.json")
    out_path.write_text(json.dumps(distribution_data, indent=2))
    print(json.dumps(distribution_data, indent=2))
    print(f"[+] Public distribution links persisted to {out_path}")

if __name__ == "__main__":
    generate_distribution_links()
