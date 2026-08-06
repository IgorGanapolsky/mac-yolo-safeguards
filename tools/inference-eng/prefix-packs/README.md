# Prefix packs (KV / prompt-cache reuse)

| File | Use for |
|------|---------|
| `coding-system.md` | code / plan / judge agent turns (SuperGrok) |
| `draft-system.md` | outreach drafts / batch content (free/local) |

**Rule:** paste pack as the first system content; put volatile context (issue id, date, files)
*after* the pack so prefixes stay stable.

Load via:

```bash
node tools/inference-eng/load-prefix-pack.js coding
node tools/inference-eng/load-prefix-pack.js draft
```
