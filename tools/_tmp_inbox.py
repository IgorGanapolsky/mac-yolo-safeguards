import sys, json, time, re
sys.path.insert(0, '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools')
from browseros_mcp import rpc_call

for i in range(4):
    c = rpc_call('act', {'page': 613, 'kind': 'click', 'ref': 'e94'})
    print('click', i, json.dumps(c)[:40])
    time.sleep(5)
    s = rpc_call('snapshot', {'page': 613})
    t = s.get('text') or json.dumps(s)
    print('  PLANE:', 'Plane' in t, 'eaz:', 'eazyigz' in t, 'len:', len(t))
    if 'Plane' in t or 'eazyigz' in t:
        open('/tmp/drawer_inbox.txt', 'w').write(t)
        print('  SAVED drawer_inbox.txt')
        for line in t.splitlines():
            if re.search(r'Plane|chat|Chat|message|Message|Direct', line, re.I):
                print('  >>', line[:160])
        break