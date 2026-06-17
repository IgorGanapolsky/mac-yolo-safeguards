import urllib.request
import gzip

url = "https://storage.googleapis.com/eas-workflows-production/logs/4ed13e30-9b97-4ddd-8a12-59106cae90d6/b0f77c8e-12fe-43bf-9d9f-dd7b41410350/2026-06-15T20%3A39%3A11Z-b16a2330-d5a6-4a6e-89a1-c13281dcd0c6.txt?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=www-production%40exponentjs.iam.gserviceaccount.com%2F20260616%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20260616T024110Z&X-Goog-Expires=900&X-Goog-SignedHeaders=host&X-Goog-Signature=74841fdac1790fb9bbf6f12cce76cb49ae3220d3d506bda1a6ad233956c24a32c13b78bc2895b598277d426dbe5edd0896348e8adeb1f168b3f7c84331af2c89619e8dbdc7f690b23562743517c89143c64aeb208f3812f0923a4a67692dcf98bcae2aba63ba44e06d4257b91a9b74f2b40a01d483ce7890a318f84e5fa683188d969e9a81efbce92ae37d18bcfdad1e3ab7454053997d3022849837e65cb202885c62e2f1b396a1d9706256c4f5ae2d61e7d54f8383ae9f63cd7b7433fb26bafdc1367c7c76c90a92d39ef06a766b7702a307c348a67155db966d8adfc610a6a4be1c803e50cb99857598e2459d94396b295a11f6875cfa920bdf3f8b4daba7"

req = urllib.request.Request(url)

try:
    response = urllib.request.urlopen(req)
    headers = response.info()
    print("Headers:", dict(headers))
    data = response.read()
    print("Raw Data Size:", len(data))
    
    # Try raw gzip decompression
    try:
        decompressed = gzip.decompress(data)
        print("Successfully decompressed raw gzip data. Size:", len(decompressed))
        text = decompressed.decode('utf-8', errors='ignore')
    except Exception as e:
        print("Failed direct gzip decompress:", e)
        text = data.decode('utf-8', errors='ignore')
        
    lines = text.split('\n')
    print(f"Total lines: {len(lines)}")
    print("\n--- LAST 40 LINES ---")
    for line in lines[-40:]:
        # Try parsing JSON line if it looks like one
        if line.strip().startswith('{') and line.strip().endswith('}'):
            try:
                obj = json.loads(line)
                msg = obj.get('msg', '')
                if msg:
                    print(f"[{obj.get('phase', 'LOG')}] {msg}")
                    continue
            except:
                pass
        print(line[:200]) # Print max 200 chars per line
except Exception as e:
    print("Error:", e)
