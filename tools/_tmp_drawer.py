import sys, json, time
sys.path.insert(0, '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools')
from browseros_mcp import rpc_call

# Ensure 613 is at home feed
rpc_call('act', {'page': 613, 'kind': 'click', 'ref': 'e5'})  # noop safety
nav = rpc_call('navigate', {'page': 613, 'url': 'https://www.reddit.com/'})
print('NAV', json.dumps(nav)[:120])
time.sleep(8)
s0 = rpc_call('snapshot', {'page': 613})
t0 = s0.get('text') or json.dumps(s0)
print('HOME OPENCHAT present:', 'Open chat' in t0)

# find Open chat ref
import re
m = re.findall(r'(button|link) "([^"]+)" \[ref=(e\d+)\]', t0)
openref = None
for kind, label, ref in m:
    if label == 'Open chat':
        openref = ref
print('OPENCHAT REF:', openref, m[:6])

if openref:
    for i in range(4):
        c = rpc_call('act', {'page': 613, 'kind': 'click', 'ref': openref})
        time.sleep(4)
        s = rpc_call('snapshot', {'page': 613})
        t = s.get('text') or json.dumps(s)
        found = 'Plane' in t
        print('attempt', i, 'click', json.dumps(c)[:40], 'PLANE:', found, 'len:', len(t))
        if found:
            open('/tmp/drawer_home.txt', 'w').write(t)
            print('SAVED /tmp/drawer_home.txt')
            break