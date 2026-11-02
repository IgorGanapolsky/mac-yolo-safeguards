# fix: make the repo janitor drain a frozen board

<!-- source: Merged PR | id: 2199 | closed: 2026-10-29T14:02:17.964Z -->

## Question

fix: make the repo janitor drain a frozen board

## Answer

Why

The open board is frozen because the janitor was succeeding at doing nothing, and two required checks fail on every pull request.

- `pr-hygiene.yml` ran once a day, exempted every draft, and never touched issues. The 11 August drafts and 38 August issues could not age out.
- `Public funnel checks` failed when iTunes reported `resultCount` 0, even if no scanned doc still promotes an App Store URL. The old listing `id6786778037` is a 404.
- `macOS guard kit` failed `tests/test-agent-swarm-ha

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2199)

---
