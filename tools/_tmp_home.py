import sys, json, time
sys.path.insert(0, '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools')
from browseros_mcp import rpc_call
import re

# fresh home snapshot on 613
nav = rpc_call('navigate', {'page': 613, 'url': 'https://www.reddit.com/'})
print('NAV', json.dumps(nav)[:80])
time.sleep(9)
s = rpc_call('snapshot', {'page': 613})
t = s.get('text') or json.dumps(s)
open('/tmp/home_full.txt', 'w').write(t)
# find all actionable refs near chat/Plane
print('LEN:', len(t), 'OPENCHAT:', 'Open chat' in t, 'PLANE:', 'Plane' in t)
print('CHAT-related lines:')
for line in t.splitlines():
    if re.search(r'chat|Chat|message|Message|drawer|inbox', line, re.I):
        print('  ', line[:140])