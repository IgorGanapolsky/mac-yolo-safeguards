import sys, json, time, re
sys.path.insert(0, '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools')
from browseros_mcp import rpc_call

s = rpc_call('snapshot', {'page': 613})
t = s.get('text') or json.dumps(s)
# locate Open chat and any conversation entries
for line in t.splitlines():
    if re.search(r'Open chat|"Plane|"eazyigz|Direct chat|conversation|chat', line, re.I):
        print('  >>', line[:150])
print('--- trying click Open chat e440 ---')
for i in range(4):
    c = rpc_call('act', {'page': 613, 'kind': 'click', 'ref': 'e440'})
    print('click', i, json.dumps(c)[:40])
    time.sleep(5)
    s2 = rpc_call('snapshot', {'page': 613})
    t2 = s2.get('text') or json.dumps(s2)
    print('  PLANE:', 'Plane' in t2, 'len:', len(t2))
    if 'Plane' in t2:
        open('/tmp/drawer_chatlist.txt','w').write(t2)
        for line in t2.splitlines():
            if re.search(r'Plane|eazyigz|Direct|message|Chat', line, re.I):
                print('  >>', line[:150])
        break
    # if e440 disappeared, find new Open chat ref
    m2 = re.findall(r'button "Open chat" \[ref=(e\d+)\]', t2)
    print('  Open chat refs now:', m2)