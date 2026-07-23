
## Shipped (2026-07-23)

- Dashboard **Continuity runs** metric + **Included VPS runs** panel (`used/limit/remaining`).
- `GET /api/me` returns `continuityUsage`.
- Optional **run pack** checkout when `STRIPE_CONTINUITY_PACK_PRICE_ID` is set; webhook adds `cloud_task_bonus`.
- Governance limits use **base plan quota + bonus**.
