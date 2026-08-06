#!/usr/bin/env python3
import sys
import json
import browser_cookie3
import requests

def post_reply(parent_id, text):
    cj = browser_cookie3.chrome(domain_name='reddit.com')
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    }
    
    # 1. Fetch modhash / session info from reddit
    me_res = requests.get('https://www.reddit.com/api/me.json', cookies=cj, headers=headers)
    if me_res.status_code != 200:
        print(f"Failed to fetch account info: {me_res.status_code}")
        return False
        
    modhash = me_res.json().get('data', {}).get('modhash', '')
    
    # 2. Post comment via API
    post_data = {
        'thing_id': parent_id,
        'text': text,
        'api_type': 'json',
        'uh': modhash
    }
    
    comment_res = requests.post('https://www.reddit.com/api/comment', data=post_data, cookies=cj, headers=headers)
    print(f"Post status: {comment_res.status_code}")
    print("Response:", comment_res.text[:500])
    return comment_res.status_code == 200

if __name__ == '__main__':
    parent = sys.argv[1] if len(sys.argv) > 1 else 't1_p22hi9k'
    body = """Writing the bypass reason directly into a git commit trailer or audit ledger is essential because silent env vars quickly turn into permanent invisible overrides.

For time-boxing, we solved this by attaching a 15-minute TTL lease to the approval key instead of relying on a toggle. When an override is requested, the hook generates an expiring lease token in local storage that auto-evicts after 15 minutes or after 1 execution, whichever comes first.

If the agent tries to reuse the bypass on a second run or past the TTL window, the PreToolUse hook intercepts it again and requires a fresh justification. Pairing a short TTL lease with mandatory receipt writing (`receipts/bypass-audit.jsonl` logged to telemetry) gives you the flexibility to unblock an emergency without creating a permanent un-audited back door."""
    
    success = post_reply(parent, body)
    if success:
        print("✅ Reply successfully posted to Reddit!")
    else:
        print("❌ Reply failed.")
