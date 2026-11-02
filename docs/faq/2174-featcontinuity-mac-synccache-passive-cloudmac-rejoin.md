# feat(continuity): Mac sync/cache + passive cloud→Mac rejoin

<!-- source: Merged PR | id: 2174 | closed: 2026-10-29T14:02:17.964Z -->

## Question

feat(continuity): Mac sync/cache + passive cloud→Mac rejoin

## Answer

- **VPS remains SSOT** for dashboard sends (Chief lock / no RUN ON Mac restore)
- New watermark `threads.cloud_rejoined_at` (independent of Mac→cloud `synced_at`)
- `POST /api/device/sessions/rejoin` list + ack
- Connector `syncRejoinPacks` injects cloud handoff into Hermes on wake (no local Run required)
- Claim-time handoff also advances `cloud_rejoined_at`
- Settings copy honesty: Mac = session sync

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2174)

---
