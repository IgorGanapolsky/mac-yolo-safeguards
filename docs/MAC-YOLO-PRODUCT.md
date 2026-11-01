# mac-yolo-safeguards product surfaces

ThumbGate is the business. The public site is [https://thumbgate.app/](https://thumbgate.app/).

On 2026-10-29T16:23:03Z, `GET https://thumbgate.app/api/billing/plan` returned:

```json
{"configured":true,"active":true,"unitAmount":1000,"currency":"usd","interval":"month"}
```

That unit amount is $10/month for Cloud Continuity. The package copies this snapshot. It does not call Stripe, create a price, or record a payment. `clearedRevenue` stays null. A listed price is not a receipt.

## Surfaces

| Surface | What it does |
| --- | --- |
| MCP `mac-yolo-product` | Stdio JSON-RPC tools `product_health`, `product_offer`, `product_surfaces` |
| HTTP service | Listens on `127.0.0.1:47831` only. `GET /health` and `GET /offer` |
| Menu bar | `macos/MacYoloProductApp.swift` polls `http://127.0.0.1:47831/health` and can open the hero URL when the menu item is clicked |

Any host other than `127.0.0.1` throws `loopback_only` before the socket opens. The service is not installed as a LaunchAgent. The Swift file is source only. This change does not compile it, launch it, or submit it anywhere.

An omitted plan uses the snapshot and sets `snapshot: true`. An explicit null plan leaves the price unknown. A non-negative integer price in US dollars per month is shown only when the amount divides evenly into dollars. 1000 is `$10/month`. 1999 is known and has no display string.

## Client config

This file does not edit `.mcp.json`. A client can add:

```json
{
  "mcpServers": {
    "mac-yolo-product": {
      "command": "bin/mac-yolo-product",
      "args": ["--mcp"]
    }
  }
}
```

`bin/mac-yolo-product --json` prints the fixture report and exits 0 only when the snapshot displays `$10/month`, cleared revenue is null, and the bind address is `127.0.0.1`.

## Separate unmerged catalog

Open PR 2212 carries a different MCP, HTTP service, and menu-bar file, plus a commercial catalog. Those files are not on `main` and this package does not import them.
