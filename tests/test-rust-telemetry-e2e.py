import json
from pathlib import Path

def test_e2e_pipeline():
    print("[*] Running E2E Pipeline Verification...")
    
    # Verify packaged app exists
    app_path = Path("/Applications/MacYoloSafeguards.app")
    assert app_path.exists(), "MacYoloSafeguards.app missing!"
    
    # Verify distribution links
    links_path = Path("/Users/iganapolsky/.hermes/cache/scratch/public_distribution_links.json")
    assert links_path.exists(), "Distribution links missing!"
    links = json.loads(links_path.read_text())
    assert len(links["purchase_tiers"]) == 3, "Stripe tiers missing!"
    
    print("[+] E2E Pipeline Verification PASSED successfully!")

if __name__ == "__main__":
    test_e2e_pipeline()
