# Mac YOLO Safeguards: 10-10-10 scorecard

Revenue = clients × revenue per client × retention. Raising each by 10% gives about 33% growth, but
only once the first lever is above zero. Every number below comes from a read-only query run on
November 12, 2026 around 11:30 AM ET. Where no data source exists, the row says "not available".

## Scorecard

| Lever | Measure | Value | Query behind it |
| --- | --- | --- | --- |
| Clients | Paying Mac YOLO customers, ever | **0** | Stripe dashboard, Payments, "Succeeded" filter (account acct_1RNcJ1GGBpd520QY). 8 succeeded payments in all, none for Mac YOLO: seven $10 and one $149 subscription for other products on the shared account. |
| Clients | Pro Guard ($19/mo) checkouts paid | 0 | Same list: no $19 payment succeeded. One $19 payment from Apr 24, 2026 is "Incomplete". |
| Clients | Partner Pilot ($3,000) checkouts | 4 started, 0 paid | Stripe Payments, "All": four $3,000 payments marked "Canceled" (Nov 10 at 10:47 AM ×2, Nov 11 at 2:04 AM ×2). |
| Clients | App downloads from GitHub releases | 136 across v1.0.0 to v1.2.1 | `gh api repos/IgorGanapolsky/mac-yolo-safeguards/releases --paginate -q '.[] \| [.tag_name, ([.assets[].download_count]\|add)]'`. Breakdown: v1.0.0 45, v1.1.0 18, v1.1.1 11, v1.1.2 37, v1.2.0 20, v1.2.1 5. Includes our own build checks and agent fetches. The Homebrew cask downloads from the same release, so it's counted here. |
| Clients | Active installs | not available | The free app sends nothing home. Only Pro keys call `/license/refresh`. |
| Clients | Site visits and clicks on /go/pro | not available | The Worker doesn't store request logs or analytics. |
| Revenue per client | Average paid amount | not available | There are no Mac YOLO payments to average. List prices are $19/mo (Pro Guard) and $3,000 (Partner Pilot). |
| Retention | Renewals, cancellations | not available | There are no Mac YOLO subscriptions to renew. |
| Retention | Refunds | 0 for Mac YOLO | Stripe Payments, "Refunded" filter. |
| Retention | Uninstalls | not available | No uninstall signal exists. |

## Weakest lever: clients

At zero clients, improving revenue per client or retention multiplies nothing. The free app was the
only funnel step that could be changed without a price, payment or store change. Before this, a
free user met Pro only through a gear-menu item.

**Shipped:** a once-a-day notice for free users, sent only when their Mac hits a problem Auto-Guard fixes
(leftover agent processes holding memory, or under 10 GB of free disk). It says what Auto-Guard would
have done and opens the pricing page when clicked.
[PR #2322](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2322).

## For Igor to decide (not done here)

- **A 7-day free trial on Pro Guard.** That changes the Stripe price or payment link, so it needs Igor's approval.
- **Count notice clicks.** Adding `?from=app` to the pricing link and storing per-day counts in the Worker would measure this change. That adds the first stored analytics to the site.
- **Partner Pilot.** All four $3,000 checkouts were canceled. Reaching out to whoever started them is outreach, so it waits for Igor's go-ahead.
