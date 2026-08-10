import sys, json, time, re
sys.path.insert(0, '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools')
from browseros_mcp import rpc_call

# snapshot current full state to find full-screen button
s = rpc_call('snapshot', {'page': 613})
t = s.get('text') or json.dumps(s)
print('CURRENT full-screen/maximize refs:')
for line in t.splitlines():
    if re.search(r'full screen|Maximize|Minimize|Close chat|More|ellipsis|reply|react|delete', line, re.I):
        print('  ', line[:150])

# Count eazyigz message groups (lines "eazyigz123 said") across whole drawer
groups = t.count('eazyigz123 said ')
print('eazyigz123 said groups:', groups)
print('Plane said groups:', t.count('Plane-Elevator3798 said '))

# Try clicking Maximize (full screen) e523
m = re.findall(r'button "([^"]*)" \[ref=(e\d+)\]', t)
for label, ref in m:
    if 'full screen' in label or 'Maximize' in label or 'Expand' in label or 'Close chat' in label or 'Minimize' in label:
        print('Candidate:', label, ref)
fs = [r for l,r in m if 'full screen' in l.lower() or 'maximize' in l.lower() or 'expand' in l.lower()]
if fs:
    c = rpc_call('act', {'page':613,'kind':'click','ref':fs[0]})
    print('FULLSCREEN CLICK', fs[0], json.dumps(c)[:50])
time.sleep(6)
s2 = rpc_call('snapshot', {'page': 613})
t2 = s2.get('text') or json.dumps(s2)
open('/tmp/fullchat.txt','w').write(t2)
print('AFTER EXPAND groups eazyigz:', t2.count('eazyigz123 said '), 'Plane:', t2.count('Plane-Elevator3798 said '))
for line in t2.splitlines():
    if re.search(r'eazyigz123 said|Plane-Elevator3798 said|More|\u2026|menu', line, re.I):
        print('  >>', line[:150])