#!/usr/bin/env python3
"""Reddit Answers Pain-Point Intel - Simple working script."""

import os, time, re
from datetime import datetime
import browser_cookie3
from playwright.sync_api import sync_playwright

# Config
OUTPUT = "/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/outreach/reddit-answers-intel-" + datetime.today().strftime("%Y-%m-%d") + ".md"
QUERY_LIST = [
    "what are the biggest problems with AI phone answering for restaurants",
    "what's the hardest problem with AI agents breaking in production",
    "biggest problems with appointment booking and no-shows for med spas"
]

COOKIES = browser_cookie3.chrome(
    cookie_file=os.path.expanduser("~/Library/Application Support/Google/Chrome/Profile 1/Cookies")
)

def harvest_one(query):
    """Run one query harvest cycle."""
    queries = QUERY_LIST if not QUERY_LIST else [query]
    
    for q in queries:
        print(f"\nQuery: {q}")
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                
                # Add cookies
                cookie_jar = []
                for c in COOKIES:
                    if "reddit" in (c.domain or "") and c.value:
                        cookie_jar.append({"name": c.name, "value": c.value})
                for ck in cookie_jar[:50]:
                    page.add_cookies([ck])
                
                # Navigate to answers
                page.goto("https://www.reddit.com/answers/?q=" + q.replace(" ", "+"))
                time.sleep(12)
                
                # Extract via body (reload not needed since query param added above)
                inner = page.evaluate("document.body.innerText")
                
                # Check if this is our answer or just home nav
                if "Sources:" in inner and len(inner) > 600:
                    print(f"[+] Got answer ({len(inner)} chars)")
                    
                    # Clean nav chrome
                    for cutoff in ["Reddit Rules", "Privacy Policy"]:
                        idx = inner.find(cutoff.replace("\\n", "\n"))
                        if idx > 0:
                            inner = inner[:idx].rstrip()
                            break
                    
                    return {"query": q, "answer": inner}
                    
                elif inner and len(inner) > 500:
                    # Partial/alternative answer
                    print(f"[?] Got partial content ({len(inner)} chars)")
                    quotes = re.findall(r'["\\u2018][^"\\u2019]{1,80}["\\u2019]', inner)
                    if quotes:
                        return {"query": q, "answer": "\\n".join(quotes[:3])}
                    
                # Navigate to home and try submission path
                page.goto("https://www.reddit.com/answers/")
                time.sleep(8)
                
                ta = page.locator("guides-textarea-input textarea").first
                ta.click()
                page.keyboard.press("Control+a")
                page.keyboard.press("Delete")
                
                for ch in q:
                    page.keyboard.type(ch, delay=30)
                
                time.sleep(1)
                
                try:
                    page.locator("guides-search-input-base button").last.click()
                except Exception as e:
                    print(f"  Submit failed: {e}")
                    continue
                
                time.sleep(5)
                
                # Poll for answer
                for _ in range(12):
                    time.sleep(2)
                    inner = page.evaluate("document.body.innerText")
                    
                    if "Sources:" in inner and len(inner) > 800:
                        print(f"[+] Answer found via poll!")
                        for cutoff in ["Reddit Rules", "Privacy Policy"]:
                            idx = inner.find(cutoff.replace("\\n", "\n"))
                            if idx > 0:
                                inner = inner[:idx].rstrip()
                                break
                        return {"query": q, "answer": "\\n".join(re.findall(r'"[^"]{1,60}"', inner))}
                
                # Check if on r/ thread (useful lead)
                result_url = page.url
                if result_url.startswith("https://www.reddit.com/r/"):
                    print(f"[!] On thread: {result_url}")
                    return {"query": q, "answer": result_url + "\\n\\nSee live thread for full discussion"}
                
        except Exception as e:
            print(f"[-] Error: {e}")
            continue
        
        page.close()
        browser.close()
        
        # Return None if query failed after retries
        return None

def main():
    """Run harvest and write intel file."""
    all_results = {}
    
    for q in QUERY_LIST:
        result = harvest_one(q)
        
        if result:
            # Classify by offer type
            if "restaurant" in q.lower() or "phone answering" in q.lower():
                title = "Restaurant AI Answering"
            elif "production" in q.lower() or "breaking" in q.lower() or "agent" in q.lower().split(" problems ")[0]:
                title = "AI Agent Reliability / ThumbGate"
            else:
                title = "Med-Spa Booking System"
            
            all_results[title] = result['answer']
    
    # Write intel file
    output_lines = [
        "# Reddit Answers Pain-Point Intel" + (datetime.now().strftime(" - %Y-%m-%d")),
        "",
        "---",
        ""
    ]
    
    for title, answer in all_results.items():
        if not isinstance(answer, dict):
            query_name = next((q for q in QUERY_LIST if q in str(answer)), "Unknown")
            output_lines.append(f"## {title}")
            output_lines.append("")
            output_lines.append(f"**Query**: `...{query_name[-40:]}`")
        else:  
            # Parse answer
            query = answer['query']
            content = answer['answer']
            
            output_lines.append(f"## {title}")
            output_lines.append("")
            output_lines.append(f"**Query**: `{query}`")
            
            if isinstance(content, str) and ("reddit.com/r/" in content or "Sources:" in content):
                print(content[:500])
                
                # Try to extract quotes for outreach hooks
                quote = re.search(r'["\\u2018][^"\\u2019]{1,70}["\\u2019]', str(content)) or None
                
                if content.startswith("https://www.reddit.com"):
                    output_lines.append("")
                    output_lines.append(f"**Outreach Hook** *(for DM)*: I saw this from Reddit:")
                    output_lines.append(f"*\"{content[:15]}\"... - we solve exactly this ({title.lower()[-12:]})*")
                elif quote:
                    hook_text = content.split('"')[1][:80] + '...' if '"' in content else content[:80]
                    offer_hints = {
                        "Restaurant AI Answering": "$499 setup, $150/mo — solves missed calls" * (content.lower().find("missed") > -1) or "$499+ / $150mo",
                        "AI Agent Reliability / ThumbGate": "Production reliability fixes for agencies",
                        "Med-Spa Booking System": "Handles no-shows automatically"
                    }
                    
                    best_offer = offer_hints.get(title, "See offer details")
                    hook = f'"{hook_text}" — We solve this with {title} ({best_offer})'
                    
                    output_lines.append("")
                    output_lines.append(f"**Outreach Hook** *(use for DM)*: `{hook}`")
                else:
                    output_lines.append("")
                    output_lines.append("*(Full discussion in live thread / answer - see content above)*")
            
            output_lines.append("")
            if "reddit.com/r/" in str(answer):
                output_lines.append(f"**Source URL**: {answer}")
    
    # Write output
    OUTPUT.write_text("\\n".join(output_lines))
    print(f"\n[+] Intel file written: {OUTPUT}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        (print(f"Error during harvest: {e}")) or open("_harvest_error.txt", "w").write(str(e))
