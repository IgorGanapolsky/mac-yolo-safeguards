#!/usr/bin/env python3
"""Reddit Answers Pain-Point Intel Harvest - headless Playwright with Chrome cookies."""

import os, time, re, json
from pathlib import Path
from datetime import datetime
import browser_cookie3
from playwright.sync_api import sync_playwright

OUTPUT_PATH = "/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/outreach/reddit-answers-intel-" + datetime.today().strftime("%Y-%m-%d") + ".md"
QUERIES = [
    "what are the biggest problems with AI phone answering for restaurants",
    "what's the hardest problem with AI agents breaking in production",
    "biggest problems with appointment booking and no-shows for med spas"
]

def get_cookies():
    cj = browser_cookie3.chrome(
        cookie_file=os.path.expanduser("~/Library/Application Support/Google/Chrome/Profile 1/Cookies")
    )
    return [{"name": c.name, "value": c.value} for c in cj if "reddit" in (c.domain or "") and c.value]

def harvest(query):
    print(f"\n--- Harvest: {query[:40]}... ---")
    retries = 3
    for r in range(retries):
        print(f"[/1 retries] Attempt #{r+1}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            for cookie in get_cookies():
                try: page.add_cookies([cookie])
                except: pass
            
            # Navigate and fill
            page.goto("https://www.reddit.com/answers/")
            time.sleep(6)
            
            ta = page.locator("guides-textarea-input textarea").first
            ta.click()
            page.keyboard.press("Control+a")
            page.keyboard.press("Delete")
            
            for c in query:
                page.keyboard.type(c, delay=25)
            time.sleep(2)
            
            try:
                page.locator("guides-search-input-base button").last.click(force=True)
            except Exception as e:
                print(f"  Submit click failed: {e}")
                continue
            
            try:
                new_url = page.wait_for_url("**/answers/**", timeout=20000).url
            except:
                new_url = page.url
                
            # Extract via reload (CRITICAL PER SKILL)
            if "?q=" not in new_url.split("#")[0]:
                answer_page = f"https://www.reddit.com/answers/?q={re.sub(r'[ \\n<>\"']+", " +", query)}&source=ANSWERS"
                page.goto(answer_page, timeout=30000)
            time.sleep(10)
            
            # Poll for Sources: signal
            for poll in range(6):
                time.sleep(2)
                inner = page.evaluate("document.body.innerText")
                
                if "Sources:" in inner and len(inner) > 800:
                    print("[+] Answer found via polling!")
                    
                    # Clean nav chrome
                    for cutoff in ["Reddit Rules", "Communities for Further"]:
                        idx = inner.find(cutoff)
                        if idx > 0:
                            inner = inner[:idx].rstrip()
                            break
                    
                    # Extract quotes
                    lines = inner.split("\\n")
                    quotes = []
                    for line in lines:
                        if len(line) > 25 and (chr(34) in line or chr(39) in line):
                            clean = re.sub(r"[<>=]", "", line).strip()
                            if len(clean.strip()) > 15 and (chr(34) in clean or chr(39) in clean):
                                quotes.append(clean.strip())
                    
                    return "\\n".join(quotes[:3]) if quotes else inner[:2000]
                
                except Exception as e:
                    print(f"[-] Error: {e}")
                    break
                
            page.close()
            browser.close()
            
            if r == retries - 1:
                return None
            time.sleep(1)

def main():
    all_pains = []
    
    for query in QUERIES:    
        result = harvest(query)
        
        if result:
            query_keywords = ["restaurant"] if any(k in query.lower() for k in ["restaurant", "phone answering"]) else ("agent" if any(k in query.lower() for k in ["production", "breaking"]) else "med-spa")
            
            hook_map = {
                "restaurant": f"We saw you mentioning \"{result.split(chr(39))[1][:70] if chr(39) in result else result[8:30]...}\" - our Restaurant AI solves this ($499 setup, $150/mo)",
                "agent": f"Production breaks like \"{quote}" if quote := (re.search(r'["\\u2018][^"\u2019]{1,70}["\\u2019]', result or result) else None).group() else result[5:30]+"...\" - ThumbGate fixes this breaking pattern"
            }
            
            all_pains.append({
                "query": query,
                "pain": result[:500],
                "sharp_quote": re.search(r'["\\u2018][^"\u2019]+["\\u2019]', result or result.replace("\\n", "")) or "N/A"
            })

def capture_memory():
    from hermes_tools import mcp__thumbgate__capture_memory_feedback
    mcp__thumbgate__capture_memory_feedback("""signal=recurring_job_complete
summary=reddit-answers-pain-intel cron harvest
queries_run=3 per rotation
workflow=headless_playwright+browser_cookie3+keyboard.type_submit_click+reloads_for_ss
lessons_learned=reload_page_to_force_ssr_is_mandatory;poll_for_sources_signal_before_returning
""")

if __name__ == "__main__":
    result = """# Reddit Answers Pain-Point Intel Harvest
**Date**: %(datetime)s

## Query Clusters

""" % ({\"datetime\": datetime.now().strftime(\"%Y-%m-%d %H:%M\")})
    
    for item in all_pains:
        if item.get(\"pain\"):
            result += f"### **{item['query'][:60]}**\\n\\n"{item['pain']}\\n\\n"**Sharpest Quote**: `{item.get('sharp_quote', 'None')[:100]}`\\n\\n---\\n\\n\"
    
    OUTPUT_PATH.write_text(result)
    print(f"\\n[+] Intel written: {OUTPUT_PATH}")
    
if __name__ == \"__main__\":
    try:    
        main()
        capture_memory()        
    except Exception as e:
        (f\"Error: {e}\")
