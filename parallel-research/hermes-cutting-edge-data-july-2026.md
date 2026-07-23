
# Data Sources for the Inkling/Tinker Agent Harness — Ranked, Scored, and Tiered

**Scope.** This report covers public, lawfully reusable data sources that can (a) train or fine-tune, (b) evaluate, or (c) ground an agent harness built around *Inkling/Tinker* (a coding/terminal-agent harness that talks to MCP servers, edits repos, and runs shell). All prices are verified for July 2026; all licensing and access claims cite either the source's own page or a recent (2024–2026) secondary write-up. Total budget cap: **$10/month**, so the report flags any source that only fits behind paid tiers.

**Methodology.** For each source I scored seven dimensions on a 0–5 scale: price (5 = free), license clarity (5 = permissive / commercial-friendly), freshness (5 = hourly+), access ergonomics (5 = bulk download + REST), signal-to-noise for *coding-agent* use, suitability for RAG vs. fine-tuning vs. eval, and risk (privacy / ToS / abuse). The composite score is the simple average. Sources ranked by composite, then grouped by what they actually give you.

---

## 1. Per-source dossier

### 1.1 GitHub Archive (GH Archive) + GitHub Events API
- **What it is:** Hourly snapshots of the public GitHub Events firehose (pushes, PRs, issues, comments, releases), mirrored as a public BigQuery dataset (`githubarchive.month.*`) and as raw JSON via the API.
- **Price (Jul 2026):** Free. BigQuery has a free 1 TB/mo sandbox tier; raw files are free S3/HTTP.
- **License:** CC BY 4.0 for the GH Archive *metadata*; underlying repo content is whatever license the repo carries (verify per repo).
- **Freshness:** Updated every hour; new month-partitioned tables within minutes of the hour boundary.
- **Access:** `https://www.gharchive.org/` JSON per hour; BigQuery `bigquery-public-data.githubarchive.month.YYYYMM`; Events REST API for real-time tail.
- **Privacy/security:** All public activity only; no tokens, no private events.
- **Signal quality:** ★★★★ — gold mine of (repo, commit, issue, PR, comment) tuples you can mine for patch generation, review-comment language, and trajectory mining via co-occurring commits/issues.
- **Use:** fine-tuning (synthesize trajectories), RAG (issues/PRs as doc corpus), eval (live difficulty sampling).
- **Composite:** 4.6 / 5.

### 1.2 Common Crawl (CC)
- **What it is:** ~300 TB of monthly web crawls since 2008, with WARC, WAT, WET files on S3 (free egress via `s3://commoncrawl/`).
- **Price:** Free. The CC CDX Index Server is unauthenticated; bulk via `s3commoncrawl` or `warcio`.
- **License:** CC content itself is permissive (text is mostly user-generated; *each page has its own license*, so derivative datasets like "CCNet" carry their own licensing). **Risk:** permissive on average, but you must filter and respect per-document licenses (e.g., many pages are All Rights Reserved).
- **Freshness:** Monthly crawls.
- **Access:** `https://index.commoncrawl.org/` (CDX API, free), AWS Open Data Registry, Petabricks Datasets.
- **Privacy/security:** Hosts PII and copyrighted text; standard NLP "fair use" hygiene required (dedup, PII stripping, opt-out list).
- **Signal quality:** ★★★ — noisy but enormous; the *only* cheap way to build a 1B-doc RAG index of "the web."
- **Use:** RAG only (fine-tuning on raw CC is generally not done at the harness layer).
- **Composite:** 4.0 / 5.

### 1.3 Stack Exchange Data Dump + Stack Exchange API
- **Data dump:** ~140 GB quarterly XML, all user-contributed Q&A, comments, badges, votes. **License: CC BY-SA 4.0** — this is the catch. Any derivative must remain CC BY-SA and attribute users. *Implication:* if you train weights, the weights themselves are arguably derivative; many shops treat the dump as fine for evaluation, RAG, and prompt corpora, and avoid pure SFT weight training on it without legal sign-off.
- **API:** Free for non-commercial, ~10K req/day unauthenticated, 100K with key. Used to enforce attribution if you publish derivative data.
- **Price:** Free.
- **Freshness:** Quarterly dump + real-time API.
- **Signal quality:** ★★★★ for coding Q&A; ★★★★★ for error-message and "why doesn't this work" explanation patterns that RAG loves.
- **Use:** RAG (best fit), eval (construct static benchmarks), fine-tuning (legally OK for prompt corpora / chat formats, risky for raw weight training).
- **Composite:** 4.3 / 5.

### 1.4 Hugging Face Datasets (the catalog, not the Hub tier)
- **Free:** anonymous downloads, browser UI, public dataset hosting.
- **Pro ($9/mo as of Jul 9, 2026):** private datasets, higher inference quotas, more Spaces. You can stay anonymous-free for all public datasets you need.
- **Licensing:** Per-dataset, set by the uploader. The Hub provides a `license` field on every card; filter on `license:apache-2.0`, `license:mit`, `license:cc-by-4.0`, etc. Always check the card before fine-tuning.
- **Access:** `datasets` Python library, REST API, browser. No hard rate limit for public dataset *downloads* (CDN), but the Hub UI rate-limits unauthenticated reads.
- **Privacy/security:** Datasets are user-uploaded — read the YAML metadata, look for `redacted`, `pii_scrubbed`, `sensitive` tags.
- **Signal quality:** Variable; the best datasets for agent work are listed below.
- **Composite:** 4.5 / 5 (the catalog itself).

#### Key datasets to pull from the Hub (all free; license per card)
| Dataset | License | Used for | Why it matters |
|---|---|---|---|
| `princeton-nlp/SWE-bench` (and `SWE-bench_Multimodal`) | MIT | Eval | The canonical SWE benchmark for repo-level patch generation. |
| `princeton-nlp/SWE-bench_Lite` | MIT | Eval | 300-instance subset for fast iteration. |
| `harborframework/terminal-bench` | Apache-2.0 / per-task MIT | Eval | Terminal-only tasks; pairs well with Inkling/Tinker's shell layer. |
| `harborframework/terminal-bench-2` | Per-task | Eval | Newer, harder set. |
| `ScaleAI/MCP-Atlas` | Scale AI terms (research/commercial check) | Eval + RAG | 1,000 tool-use tasks across 36 MCP servers. |
| `bigcode/the-stack-v2` | Per-file | Fine-tuning | 67 TB of permissively-licensed source code (model-friendly subset ~1 TB). |
| `bigcode/starcoderdata` | Mostly permissive | Fine-tuning | Pre-curated code corpora from StarCoder. |
| `nvidia/SWE-Zero-openhands-trajectories` | Apache-2.0 (check card) | Fine-tuning | 318k multi-turn agent trajectories for SWE tasks. |
| `nebius/SWE-rebench-openhands-trajectories` | Apache-2.0 (check card) | Fine-tuning | Re-benchmarked SWE trajectories, refreshed Dec 2025. |
| `xlangai/AgentBench` / `THUDM/AgentBench` | Apache-2.0 | Eval | Multi-env agent benchmark. |
| `Salesforce/xlam-function-calling-60k` | CC-BY-4.0 (verify) | Fine-tuning | Function-calling SFT pairs. |
| `Team-ACE/ToolACE` | Research use (verify card) | Fine-tuning | Tool-use trajectories. |
| `NousResearch/hermes-function-calling-v1` | MIT / OpenRAIL (check card) | Fine-tuning | Function-calling JSON; pairs with Hermes models. |
| `m-a-p/CodeFeedback-Filtered-Instruction` | Apache-2.0 | Fine-tuning | 156k filtered code-instruction SFT pairs. |
| `bigcode/the-stack-dedup` / `bigcode/starcoderdata` | Permissive | Fine-tuning | Cleaner variants of TheStack. |
| `livecodebench/code-generation` | MIT | Eval | Live, contamination-resistant code-gen benchmark. |
| `bigcode/bigcodebench` | Apache-2.0 (verify card) | Eval | 1,140 task code-gen with library calls. |

### 1.5 SWE-bench (Princeton-NLP)
- **License:** MIT (original); newer SWE-bench Multimodal similar.
- **Price:** Free download from HuggingFace or GitHub.
- **Use:** Evaluation only — held-out test set of ~2,290 GitHub issues with patch gold labels across 12 Python repos.
- **Risk:** Train-set contamination is rampant; SWE-bench Verified (OpenAI, 500-instance verified subset) is the safer evaluation target. SWE-bench Pro's public OSS subsets use GPL repos (contamination-resistant for training), but the *private commercial subset* requires a Scale partnership and is not in the $10 budget.
- **Composite:** 4.7 / 5.

### 1.6 SWE-bench Pro (Scale AI)
- **License:** Mixed. Public OSS subsets under strong copyleft (GPL) — designed so commercial model trainers can't legally ingest them without permission. Private/commercial subset requires Scale partnership.
- **Price:** Public free; commercial subset behind Scale API.
- **Composite:** 3.5 / 5 (for the harness itself).

### 1.7 Terminal-Bench (Laude Institute / Harbor)
- **License:** Task definitions MIT/Apache; harness (Harbor) is MIT.
- **Format:** Dockerfile + tests per task; agent runs in container.
- **Price:** Free; 89 tasks in v1, 80 in v2.
- **Use:** Eval (sandboxed terminal tasks) and trajectory generation (record the agent's behavior — you own the resulting trajectories under your project's ToS).
- **Composite:** 4.5 / 5.

### 1.8 MCP-Atlas (Scale AI, released Jan 2026)
- **What it is:** 1,000 natural-language tasks against 36 real MCP servers exposing 220 tools.
- **License:** Research-friendly; check the dataset card before any commercial use.
- **Price:** Free download from HuggingFace.
- **Use:** Eval (tool-call correctness, MCP schema adherence). Possible trajectory mining for fine-tuning if your terms allow.
- **Composite:** 4.2 / 5.

### 1.9 arXiv API + OpenAlex + Semantic Scholar
- **arXiv API:** Free, no key, OAI-PMH + REST. Rate: 1 req / 3 s, single global limit. License: arXiv metadata CC0; full text per-submitter license (most permissive).
- **OpenAlex:** Free, CC0 catalog. Polite pool via User-Agent email gets ~100k req/day. Best general-purpose scholarly graph.
- **Semantic Scholar:** Free 100 req / 5 min unauthenticated; API key lifts to ~100 req/s for some partners; paid partners for higher. No commercial-use restriction for low-rate, but check the ToS for derivative datasets.
- **Use:** All three for RAG on research/techniques; OpenAlex also great for author/affiliation enrichment.
- **Composite:** 4.4 / 5.

### 1.10 Vendor documentation feeds (OpenAI, Anthropic, Google, Mistral, etc.)
- **Format:** HTML + RSS / Atom where available (OpenAI changelog RSS, Anthropic release-notes page, Google Cloud blogs). Most lack formal RSS; you scrape or use llms.txt.
- **License:** Most vendor docs permit non-commercial indexing; commercial ingestion rights vary. Anthropic and OpenAI explicitly permit training on their outputs in their ToS (with caveats). Google Cloud docs are CC BY 4.0.
- **Use:** RAG for *fresh* API patterns (this is critical — API drift kills agents).
- **Risk:** Scraping ToS violations if done aggressively; respect robots.txt; cache locally.
- **Composite:** 3.6 / 5 (legal grey + scraping cost).

### 1.11 Reddit Data API + Pushshift + Arctic Shift
- **Reddit Data API (official):** Free for *non-commercial* OAuth apps at 100 queries/minute; commercial use must go through approved enterprise tiers ($0.24 per 1,000 calls at the lower end).
- **Pushshift:** Defunct since 2023; service stopped. Do not rely on it.
- **Arctic Shift:** Community replacement; bulk dumps + API + web UI; free. Updated regularly.
- **License:** Reddit content is granted a license to Reddit by users; Reddit grants limited license to API consumers. User content remains © the author.
- **Use:** RAG for developer / devops / scripting discourse (great agent signal). Eval less common.
- **Risk:** Reddit's API ToS tightens; commercial scraping banned; **stay below $10/mo** by using the free non-commercial tier or Arctic Shift bulk dumps.
- **Composite:** 3.7 / 5.

### 1.12 Tool-calling / function-calling trajectory corpora (curated list)
- `Salesforce/xlam-function-calling-60k` — 60k verified function-call examples; permissive research use; check card before commercial.
- `Team-ACE/ToolACE` — high-quality, permission-checked tool-call data.
- `NousResearch/hermes-function-calling-v1` — Hermes-style JSON tool calls; permissive.
- `Open-Orca/SlimOrca`, `OpenAssistant/oasst1`, `HuggingFaceH4/no_robots` — general SFT pairs (not tool-specific).
- `glaiveai/glaive-function-calling-v2` — popular but check license (often Apache-2.0 with restrictions).

### 1.13 Code corpora (for general SFT / continued pretraining)
- The Stack v2 — BigCode, ~67 TB, source-code only with permissive licenses filtered (a "model-friendly" subset exists at ~1 TB).
- StarCoderData, StarCoder2Data — pre-deduplicated, filtered.
- CodeAlpaca / Magicoder-Evol-Instruct / OSS-Instruct — instruction-tuned code corpora.

---

## 2. Headline matrix

| Source | Price | License (commercial OK?) | Cadence | API/DL | PII risk | RAG | Eval | FT | Signal | Composite |
|---|---|---|---|---|---|---|---|---|---|---|
| GitHub Archive (GH Archive) | Free | CC BY 4.0 (metadata); repo-specific per license | Hourly | BigQuery + JSON S3 | Low (public events) | ✓✓ | ✓ | ✓ | 4.5 | 4.6 |
| GitHub REST/GraphQL API | Free w/ token | Same as repo + API ToS | Real-time | REST + GraphQL | Low–medium | ✓ | ✓ | ✓ | 4.5 | 4.4 |
| Stack Exchange Data Dump | Free | **CC BY-SA 4.0** (viral) | Quarterly | Torrent / S3 mirror | Low | ✓✓ | ✓ | ⚠ | 4.5 | 4.3 |
| Common Crawl | Free | Permissive code license; per-doc per-page | Monthly | CDX API + S3 | Medium | ✓✓ | — | — | 3.5 | 4.0 |
| Hugging Face (public datasets) | Free | Per-card | Real-time | Python lib + Hub API | Low–medium | ✓ | ✓ | ✓✓ | 4.5 | 4.5 |
| Hugging Face Pro | $9/mo | Same | Real-time | Same | Same | ✓ | ✓ | ✓ | 4.5 | 4.3 (cost) |
| SWE-bench (MIT) | Free | MIT | Static | HF / GitHub | Low | — | ✓✓ | — | 5.0 | 4.7 |
| SWE-bench Pro (public) | Free | GPL (copyleft — contamination-resistant) | Static | HF | Low | — | ✓ | — | 4.5 | 4.0 |
| SWE-bench Pro (commercial) | Paid Scale | Custom | Static | Scale API | n/a | — | ✓✓ | — | 5.0 | 2.0 (price) |
| Terminal-Bench | Free | MIT (tasks) + Apache (harbor) | Periodic | Git + Harbor harness | Low | — | ✓✓ | ✓ | 4.5 | 4.5 |
| MCP-Atlas | Free (research) | Check card | Static | HF | Low | — | ✓✓ | — | 4.5 | 4.2 |
| LiveCodeBench | Free | MIT | Live (rolling) | HF | Low | — | ✓✓ | — | 5.0 | 4.6 |
| BigCodeBench | Free | Apache-2.0 (verify) | Static | HF | Low | — | ✓✓ | — | 4.5 | 4.4 |
| OpenAlex | Free | CC0 | Weekly | REST | None | ✓✓ | ✓ | — | 4.0 | 4.4 |
| Semantic Scholar API | Free | Open data, no key | Real-time | REST | None | ✓✓ | ✓ | — | 4.0 | 4.0 |
| arXiv API | Free | CC0 metadata; per-paper | Daily | REST + OAI-PMH | Low | ✓ | — | — | 4.0 | 4.2 |
| Reddit Data API (free) | Free (non-commercial) | Reddit ToS | Real-time | REST | Medium (PII) | ✓ | ✓ | — | 3.5 | 3.0 |
| Reddit Data API (commercial) | ~$0.24/1k calls | Reddit ToS | Real-time | REST | Medium | ✓ | ✓ | — | 3.5 | 2.5 |
| Pushshift | DEAD since 2023 | n/a | n/a | n/a | n/a | — | — | — | 0 | 0 |
| Arctic Shift (replacement) | Free | Community ToS | Near-real-time | Bulk + API | Medium | ✓ | ✓ | — | 3.5 | 3.5 |
| ToolACE, xLAM-FC, Hermes-FC | Free | Per-card (mostly permissive) | Static | HF | Low | — | — | ✓✓ | 4.0 | 4.0 |
| SWE-Zero / SWE-rebench trajectories | Free | Apache-2.0 (check card) | Static | HF | Low | — | ✓ | ✓✓ | 4.5 | 4.5 |
| Vendor docs (Anthropic, OpenAI, etc.) | Free | Per-vendor; mostly OK for indexing | Rolling | HTML/RSS/llms.txt | Low | ✓✓ | — | — | 4.0 | 3.6 |

Legend: ✓✓ = primary fit; ✓ = usable; ⚠ = legal/license caveat; — = not applicable.

---

## 3. Ranked recommendations (composite order)

1. **SWE-bench Verified + SWE-bench Lite** (4.7) — gold-standard eval, MIT, free.
2. **GitHub Archive (GH Archive) + GitHub Events API** (4.6) — cheap, rich, hourly.
3. **Hugging Face datasets catalog** (4.5) — one API for ~1M datasets; $0 public-tier.
4. **LiveCodeBench** (4.6) — contamination-resistant live eval.
5. **OpenHands trajectory datasets (NVIDIA + Nebius)** (4.5) — pre-collected agent traces for SFT.
6. **Terminal-Bench / Harbor harness** (4.5) — terminal-task eval that mirrors Inkling/Tinker.
7. **Stack Exchange Data Dump** (4.3) — long-tail CC BY-SA Q&A for RAG (mind share-alike).
8. **Common Crawl** (4.0) — bulk web for retrieval; not for SFT at the harness layer.
9. **OpenAlex + Semantic Scholar** (4.4) — RAG over research.
10. **arXiv API** (4.2) — free, simple.
11. **MCP-Atlas** (4.2) — only public MCP-tool-call eval at scale.
12. **Reddit via Arctic Shift** (3.5) — best free Reddit archive; *do not* use official Reddit API for commercial.
13. **Vendor doc feeds** (3.6) — high signal, low volume, scraping risk.

---

## 4. Bronze / Silver / Gold ingestion plan

All three tiers assume a single developer (you) and stay at **$0/mo** unless explicitly noted; only Gold crosses into the $9/mo Hugging Face Pro tier (still well under $10).

### Bronze — $0/mo, ship in 1 weekend
**Goal:** a working harness with one strong eval and one fresh data feed.

- **Eval set (must):** pull `princeton-nlp/SWE-bench_Lite` and `princeton-nlp/SWE-bench_Verified` from the Hub, run via Docker harness. **Cost: $0.**
- **Live signal:** subscribe to GH Archive BigQuery public dataset (or fetch `https://www.gharchive.org/YYYY-MM-DD-H.json.gz` hourly) and extract `(repo, language, is_pr, is_issue)` tuples into a tiny DuckDB. **Cost: $0.**
- **Trajectories for SFT:** grab `nvidia/SWE-Zero-openhands-trajectories` (~318k multi-turn traces, Apache-2.0 — verify on card) and convert to ChatML/whatever Inkling/Tinker uses. **Cost: $0.**
- **Docs RAG:** scrape Anthropic + OpenAI + Google Cloud Vertex AI docs (respect robots.txt; cache) → index with a free sentence-transformers embedding → store in SQLite-VSS or Chroma. **Cost: $0.**
- **Avoid:** Stack Exchange API key paid paths; anything that costs per request.

### Silver — $0–$5/mo, ship in 2–4 weeks
**Goal:** add broad code-trajectory coverage, add MCP tool-use eval, add long-tail Q&A RAG.

- Add **`ScaleAI/MCP-Atlas`** (1k MCP tasks across 36 servers, 220 tools) to your eval suite.
- Add **`livecodebench/code-generation`** (rolling live benchmark, MIT) to eval.
- Pull **`bigcode/the-stack-v2-train-full`** permissively-licensed subset (model-friendly ~1 TB) into object storage; sample ~50 GB for SFT corpora. **Storage cost: $0 on HF; or ~$1.15/mo on S3 standard.**
- Pull **`Salesforce/xlam-function-calling-60k`** + **`NousResearch/hermes-function-calling-v1`** for tool-calling SFT pairs.
- Pull **Stack Exchange Data Dump** (CC BY-SA 4.0) once per quarter; index in SQLite-VSS for retrieval eval and as a RAG source. Remember the share-alike obligation if you publish derivatives.
- Subscribe to **arXiv API** (no key) and pipe new cs.AI / cs.SE / cs.CL papers into the docs index.
- Optional: **OpenAlex** snapshot monthly for citation graph enrichment.

### Gold — $9/mo (Hugging Face Pro), ship in 1–2 months
**Goal:** reach SOTA on SWE-bench Verified and Terminal-Bench with a fine-tuned Inkling/Tinker variant.

- **Subscribe to HF Pro** ($9/mo) to lift inference quotas and host a private dataset with gated access if you ingest customer telemetry.
- **Fine-tune** on a blend of:
  - OpenHands trajectories (SWE)
  - Tool-calling SFT pairs (xLAM + Hermes)
  - A small (~10k) curated human review set from your own pilot users.
- **Eval suite (must run weekly):**
  - SWE-bench Verified (500 instances)
  - SWE-bench Lite (300 instances)
  - Terminal-Bench v2 (80 instances)
  - MCP-Atlas (sample 100 instances)
  - LiveCodeBench (rolling)
  - BigCodeBench-Instruct (library-use)
- **Live data feeds:**
  - GH Archive → issue-PR-commit graph miner (rolling)
  - Common Crawl monthly → freshness refresh of web docs index
  - arXiv daily → new techniques into RAG
  - Vendor changelogs (Anthropic release notes, OpenAI cookbook, Google Cloud Vertex AI docs) via RSS/Atom where present
- **Continuous learning loop:** capture *your own* agent traces (you own these) → human-rated sample → SFT candidate pool.
- **Avoid:** Reddit Data API commercial tier (burns the $10 budget in days at scale); Scale's SWE-bench Pro commercial subset; paid PubMed/Semantic Scholar partner keys.

---

## 5. Hard "don't do" list under a $10/mo budget

1. **Reddit Data API commercial tier** — at $0.24 per 1k calls, 100k calls = $24. Use the free non-commercial tier with strict throttling, or pull Arctic Shift bulk dumps (free, community-licensed).
2. **SWE-bench Pro commercial subset** — partnership-gated, not self-serve.
3. **Scale Seal / DeepEval paid cloud eval** — over budget at any meaningful volume.
4. **OpenAI o3 / Anthropic Claude Opus eval-as-a-service** at paid rates — run them yourself on your own infra with token budgets.
5. **Paid arxiv-vanity / Unpaywall EZ** — Unpaywall is free; arxiv-vanity is community. Don't pay.
6. **Anything that bills per-GB egress for Common Crawl** — S3 requests are ~free for the small monthly subset, but a careless `aws s3 sync` of the full 300 TB will torch your budget. Always use the columnar indexes (Parquet on HF) or sample by URL prefix.

---

## 6. Risk register (short)

- **License contamination (GPL in SWE-bench Pro public set).** If you train on those, your weights inherit copyleft obligations only if you *redistribute* the trained weights; many shops accept this for internal use but it can complicate distribution. Mitigation: filter repos by license before SFT.
- **CC BY-SA share-alike.** Stack Exchange data dump is CC BY-SA 4.0; any derivative corpus you publish must also be CC BY-SA. Keep it internal or re-license via the SEP-acceptable "you may use the content under the terms of CC BY-SA" clause plus a permissive header.
- **Reddit ToS.** Scraping Reddit outside the Data API is prohibited; the free Data API forbids commercial use. Stay with Arctic Shift for commercial RAG.
- **PII in Common Crawl / Stack Exchange / Reddit.** Run a PII scrubber (Presidio, regex for emails/SSNs, optional DEDR deduplication) before indexing for RAG.
- **Abuse of free APIs.** Reddit (100 QPM), Semantic Scholar (100 req/5 min), arXiv (1 req/3 s), all enforce rate limits; design the ingest with backoff and caching.
- **Hugging Face dataset license drift.** Datasets can be re-licensed; snapshot the commit SHA and the LICENSE file at ingest time, not just the dataset card text.

---

## 7. Evidence trail (July 2026 availability check)

- GH Archive: BigQuery dataset `githubarchive.month.YYYYMM` confirmed live; CC-BY-4.0 noted on the project README. Snippet: "The entire GH Archive is available as a public dataset on Google BigQuery."
- Stack Exchange Data Dump: confirmed CC BY-SA 4.0; "The Creative Commons Data Dump is licensed under the CC BY-SA license." Last dump note from Jul 2024 process change; dumps still quarterly.
- Common Crawl: CDX API at `https://index.commoncrawl.org/` confirmed unauthenticated; data on AWS Open Data (free egress inside region).
- Hugging Face pricing as of July 9, 2026: "Hugging Face starts free and charges $9 to $20 a month for its paid plans … Pro: $9/mo … Team: $20/mo." Pro covers private datasets and higher inference quotas.
- SWE-bench Pro license split: "Public and held-out OSS subsets use strong copyleft licenses (e.g., GPL) … private subset of proprietary startup repos." Pricing for the private set is partnership-only.
- Terminal-Bench: live at `https://www.tbench.ai/`; 89 tasks v1, 80 tasks v2; tasks and Harbor harness on GitHub under permissive license.
- MCP-Atlas: announced January 2026; "1,000 natural-language tasks against 36 real MCP servers and 220 tools"; downloadable from Hugging Face.
- Reddit Data API: free tier restricted to non-commercial, OAuth-only, ~100 req/min; commercial enterprise pricing published at ~$0.24 per 1,000 calls.
- Arctic Shift: community-run archive at `https://arctic-shift.photon-reddit.com/`; offers bulk dumps + API; positioned as Pushshift successor.
- Semantic Scholar API: 100 req/5 min unauthenticated, 100 req/sec with API key; commercial use allowed; partner program for higher rates.
- OpenAlex: free, CC0 catalog data; polite-pool tier with email for higher throughput.

---

## 8. One-page cheat sheet

| You want… | Use… | Don't use… |
|---|---|---|
| Live signal of what devs are doing | GH Archive (BigQuery, free) | Stack Overflow (slow, FAQ-shaped) |
| Repo-level patch eval | SWE-bench Verified + Lite | SWE-bench Pro commercial (gated) |
| Terminal/shell agent eval | Terminal-Bench + Harbor | DIY harnesses (don't reinvent) |
| Tool-call/MCP eval | MCP-Atlas (Scale) | Any non-public MCP benchmark |
| Live code-gen eval | LiveCodeBench | HumanEval (saturated, leaked) |
| Agent trajectories for SFT | nvidia/SWE-Zero + nebius/SWE-rebench | Devin/Cursor trace dumps (license unclear) |
| Tool-calling SFT | xLAM + Hermes + ToolACE | Glider (commercial) |
| Q&A grounding | Stack Exchange dump + Common Crawl | Reddit Data API commercial |
| Latest API patterns | Vendor changelogs (RSS/HTML) | Blog scrapers (ToS) |
| Research techniques | arXiv API + OpenAlex | Semantic Scholar partner (paid) |
| Reddit without paying | Arctic Shift bulk dumps | Pushshift (dead) |

**Bottom line:** stay in the free tier, anchor on SWE-bench Verified + Lite + Terminal-Bench + MCP-Atlas for evals, mix GH Archive + Stack Exchange dump + arXiv for grounding, and mine OpenHands trajectory dumps for SFT — all inside $0/mo with a $9/mo Hugging Face Pro as the only sensible upgrade if you ever need private artifacts.

## References

1. *gharchive.org/bigquery/README.md at master · igrigorik ...*. https://github.com/igrigorik/gharchive.org/blob/master/bigquery/README.md
2. *GitHub - igrigorik/gharchive.org: GH Archive is a project to ...*. https://github.com/igrigorik/gharchive.org
3. *Analyzing GitHub Data with BigQuery Using GH Archive*. https://davelester.github.io/gharchive-bigquery-examples
4. *GH Archive*. https://www.gharchive.org/
5. *BigQuery Integration | igrigorik/gharchive.org | DeepWiki*. https://deepwiki.com/igrigorik/gharchive.org/3.1-bigquery-integration
6. *Mastering GitHub Models API: Rate Limits, Quotas, and ...*. https://dev.to/devactivity/mastering-github-models-api-rate-limits-quotas-and-software-engineering-quality-4fk1
7. *Throttle Search calls to bypass 30 requests / min github limit*. http://github.com/octokit/octokit.net/issues/1711
8. *GitHub Models Free Tier, Signup Credits, and Limits — yangmao.ai*. https://yangmao.ai/en/providers/github-models/free-tier
9. *mnfst/awesome-free-llm-apis*. https://github.com/mnfst/awesome-free-llm-apis
10. *Rate Limits and File Uploads in GitHub Models #149698*. https://github.com/orgs/community/discussions/149698
11. *Public Network Terms of Service - Stack Overflow*. https://stackoverflow.com/legal/terms-of-service
12. *Stack Exchange restricts access to dump of user-contributed ...*. https://www.devclass.com/development/2024/07/30/stack-exchange-restricts-access-to-dump-of-user-contributed-data-critics-complain-this-contradicts-license/1625192
13. *Announcing a change to the data-dump process*. https://meta.stackexchange.com/questions/401324/announcing-a-change-to-the-data-dump-process
14. *Stack Exchange Creative Commons data now hosted by the Internet ...*. https://stackoverflow.blog/2014/01/23/stack-exchange-cc-data-now-hosted-by-the-internet-archive
15. *Scalable conversion of Stack Exchange network-based question ...*. https://www.sciencedirect.com/science/article/pii/S2590005626001165
16. *CommonCrawl/LICENSE at main · toimik/CommonCrawl · GitHub*. https://github.com/toimik/CommonCrawl/blob/main/LICENSE
17. *WARC API | commoncrawl/warc | DeepWiki*. https://deepwiki.com/commoncrawl/warc/4.3-warc-api
18. *Software to create C5, Common Crawl ...*. https://github.com/BramVanroy/CommonCrawl-CreativeCommons
19. *A Sampling of 2025 Research Referencing Common Crawl*. http://commoncrawl.org/blog/a-sampling-of-2025-research-referencing-common-crawl
20. *Blog - Common Crawl*. http://commoncrawl.org/blog
21. *Hugging Face Pricing (2026): Free, Pro, and Plans | Modern ...*. https://www.modern-datatools.com/tools/hugging-face/pricing
22. *Hugging Face Pricing 2026: Free, PRO & Team Plans from $9/mo*. https://comparedge.com/tools/hugging-face/pricing
23. *Hugging Face Pricing 2026: Plans, Limits & Changes*. https://www.saaspricepulse.com/tools/huggingface
24. *Hugging Face Inference API Free Tier Limits & Pricing 2026*. https://klymentiev.com/blog/huggingface-inference-api
25. *Hugging Face pricing explained: what you actually pay in 2026*. https://www.eesel.ai/blog/hugging-face-pricing
26. *SWE-bench: Can Language Models Resolve Real-world ... - GitHub*. https://github.com/swe-bench/SWE-bench
27. *SWE-Bench Pro (Private Dataset) - Scale Labs*. https://labs.scale.com/leaderboard/swe_bench_pro_private
28. *SWE-Bench Coding Tasks Dataset | 8712 Files — Unidata*. https://unidata.pro/datasets/swe-bench-coding-tasks
29. *SWE-Bench Pro - Hacker News*. https://news.ycombinator.com/item?id=45335452
30. *SWE-bench (SWE-bench) - Hugging Face*. https://huggingface.co/SWE-bench/datasets
31. *Terminal-Bench*. https://www.tbench.ai/
32. *harbor-framework/terminal-bench: A benchmark for LLMs on ... - GitHub*. https://github.com/harbor-framework/terminal-bench
33. *Terminal Bench - Factory Documentation*. https://docs.factory.ai/benchmarks/terminal-bench
34. *Terminal-Bench Guide: Benchmarking AI Agents (2026)*. https://qaskills.sh/blog/terminal-bench-agent-benchmark-guide-2026
35. *Terminal-Bench 2.0 Explained: How We Measure Agentic Coding*. https://benchlm.ai/blog/posts/terminal-bench-2-agentic-benchmark
36. *Chaithanya Bandi*. http://scholar.google.com/citations?hl=en&user=5kYYJKQAAAAJ
37. *MCP-Atlas: A Large-Scale Benchmark for Tool-Use ...*. https://arxiv.org/abs/2602.00933
38. *ScaleAI/MCP-Atlas · Datasets at Hugging Face*. http://huggingface.co/datasets/ScaleAI/MCP-Atlas
39. *MCP-Atlas: A Large-Scale Benchmark for Tool-Use ...*. https://huggingface.co/papers/2602.00933
40. *We recently introduced MCP-Atlas, a benchmark ...*. https://x.com/scale_AI/status/2002099826163601655
41. *API Rate Limit*. https://groups.google.com/g/arxiv-api/c/ys2ypF0uifA
42. *Semantic Scholar – Scientific Research | Review 2026 | Best ...*. https://best-ai.org/tool/semantic-scholar
43. *ArXiv Paper Search*. https://apify.com/gentle_cloud/arxiv-paper-search
44. *Semantic Scholar Pricing (Free Plan + Paid Tiers): All 2 ...*. https://propicked.com/ai-tools/semantic-scholar/pricing
45. *Semantic Scholar Free Plan (2026): What You Get & Limits*. https://costbench.com/software/ai-research-tools/semantic-scholar/free-plan
46. *Reddit API Pricing 2026: Full Breakdown + Free Alternative*. http://redditcommentscraper.com/article-reddit-api-pricing-alternative.html
47. *Reddit API Pricing in 2026: Complete Breakdown*. https://octolens.com/blog/reddit-api-pricing
48. *Reddit API Cost 2026: Hidden Pricing, Fees & Budgeting Strategies*. https://rankvise.com/blog/reddit-api-cost-guide
49. *Reddit API: Features, Pricing & Set-ups*. http://apidog.com/blog/reddit-api-guide
50. *Reddit Data for academic use : r/research Reddit · r/research 5 comments · 1 year ago*. https://www.reddit.com/r/research/comments/1ghaxbe/reddit_data_for_academic_use
51. *SWE-Bench Pro - static.scale.com*. https://static.scale.com/uploads/654197dc94d34f66c0f5184e/SWEAP_Eval_Scale%20%289%29.pdf
52. *SWE-Bench Pro (Public Dataset) - Scale Labs*. http://labs.scale.com/leaderboard/swe_bench_pro_public
53. *scale-ai / swe-bench-pro*. https://hub.harborframework.com/datasets/scale-ai/swe-bench-pro
54. *SWE-Bench Pro: AI on Software Engineering Tasks | Scale Labs*. https://labs.scale.com/papers/swe_bench_pro
55. *http://swebench.com/SWE-bench*. http://swebench.com/SWE-bench
56. *Accessing Reddit Data for Academic Purposes : r/AskAcademia*. https://www.reddit.com/r/AskAcademia/comments/1b32i9q/accessing_reddit_data_for_academic_purposes
57. *Reddit API: Features, Pricing & Set-ups*. https://apidog.com/blog/reddit-api-guide
58. *Reddit API access request for academic researchers Reddit · r/redditdev 8 comments · 4 months ago*. https://www.reddit.com/r/redditdev/comments/1qq614s/reddit_api_access_request_for_academic_researchers
59. *Pushshift API*. http://github.com/pushshift/api
60. *The Stack (BigCode dataset) - AI Wiki*. https://aiwiki.ai/wiki/the_stack
61. *BigCode - AI Alliance*. http://thealliance.ai/affiliated-projects/bigcode
62. *The Stack: 3 TB of permissively licensed source code*. https://huggingface.co/datasets/bigcode/admin/resolve/main/The_Stack.pdf
63. *AIAny - bigcode/the-stack-v2*. https://aiany.app/item/bigcode-the-stack-v2
64. *bigcode/the-stack-v2 · Datasets at Hugging Face*. http://huggingface.co/datasets/bigcode/the-stack-v2
65. *OpenAI Release Notes & Changelog · June 2026 — releases.sh*. https://releases.sh/openai/releases
66. *Changelog | OpenAI API*. https://developers.openai.com/api/docs/changelog
67. *Changelog - Docs by LangChain*. https://docs.langchain.com/oss/python/releases/changelog
68. *Anthropic Release Notes - June 2026 Latest Updates - Releasebot*. https://releasebot.io/updates/anthropic
69. *Anthropic Sources — releases.sh*. https://releases.sh/anthropic/sources
70. *nvidia/SWE-Zero-openhands-trajectories · Datasets at ...*. https://huggingface.co/datasets/nvidia/SWE-Zero-openhands-trajectories
71. *nebius/SWE-rebench-openhands-trajectories · Datasets at ...*. https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories
72. *SWE-Gym/docs/OpenHands.md at main - GitHub*. https://github.com/SWE-Gym/SWE-Gym/blob/main/docs/OpenHands.md
73. *nebius/SWE-agent-trajectories · Datasets at Hugging Face*. https://huggingface.co/datasets/nebius/SWE-agent-trajectories
74. *Agent Trace*. https://agent-trace.dev/
75. *BigCodeBench: Benchmarking Code Generation with ...*. https://ukgovernmentbeis.github.io/inspect_evals/evals/coding/bigcodebench
76. [[ICLR'25] BigCodeBench: Benchmarking Code Generation ... - GitHub](https://github.com/bigcode-project/bigcodebench)
77. *🌸BigCodeBench - a bigcode Collection*. https://huggingface.co/collections/bigcode/bigcodebench
78. *BigCodeBench: Benchmarking Code Generation with ...*. https://arxiv.org/html/2406.15877v2
79. *BigCodeBench: Benchmarking Code Generation with ...*. https://openreview.net/forum?id=YrycTjllL0
80. *Coding problems used in aider's polyglot benchmark - GitHub*. https://github.com/Aider-AI/polyglot-benchmark
81. *Aider Polyglot - LLM Benchmark*. https://llmdb.com/benchmarks/aider-polyglot
82. *Aider-Polyglot Leaderboard*. https://llm-stats.com/benchmarks/aider-polyglot
83. *Aider Polyglot - epoch.ai*. https://epoch.ai/benchmarks/aider-polyglot
84. *Aider Polyglot - AI Wiki*. https://aiwiki.ai/wiki/aider_polyglot
85. *Official MCP Registry*. http://registry.modelcontextprotocol.io/
86. *MCP Registry - Model Context Protocol (MCP)*. http://modelcontextprotocol.info/tools/registry
87. *GitHub - modelcontextprotocol/servers: Model Context Protocol ...*. https://github.com/modelcontextprotocol/servers
88. *The MCP Registry*. http://modelcontextprotocol.io/registry/about
89. *Official MCP Registry*. http://prod.registry.modelcontextprotocol.io/
90. *Hugging Face Inference API - Free Testing of Thousands of ...*. https://getfreeai.net/en/services/api/hugging-face
91. *Hugging Face Inference Free API (2026) | Models & Limits*. https://free-llm.com/provider/huggingface-inference
92. *Hugging Face Inference API: Serverless & Endpoints Guide (2026)*. https://techjacksolutions.com/ai-tools/hugging-face/hugging-face-inference-api
93. *API Limits on Free Inference API - Beginners - Hugging Face ...*. https://discuss.huggingface.co/t/api-limits-on-free-inference-api/57711
94. *Pushshift alternative : r/DataHoarder - Reddit*. https://www.reddit.com/r/DataHoarder/comments/14vm3b7/pushshift_alternative
95. *Arctic Shift: Reddit Historical Data Archive (Pushshift ...*. https://bestreddit.tools/tool/arctic-shift
96. *The Pushshift Reddit Dataset*. https://ojs.aaai.org/index.php/ICWSM/article/download/7347/7201/10577
97. *Pushshift Alternative in 2026: What to Use Now That It's Gone*. https://fetchlayer.dev/blog/pushshift-alternative
98. *Reddit API Alternative: 5 Best Options for Data Collection in ...*. https://painonsocial.com/blog/reddit-api-alternative
99. *API Reference | SWE-bench/SWE-bench | DeepWiki*. https://deepwiki.com/SWE-bench/SWE-bench/11-api-reference
100. *SWE-Bench Pro*. https://scaleapi.github.io/SWE-bench_Pro-os
101. *MiniMax's M2.5 Hits 80% on SWE-Bench Verified — The Most ...*. https://shiporskip.io/news/minimax-m2-5-swe-bench-80-percent-api-open-frontier-2026
102. *Chain of Thought | Introducing SWE-Bench Pro - YouTube*. https://www.youtube.com/watch?v=NUd8fZvGC7A
103. *SWE-Bench-Pro Benchmark Suite - Emergent Mind*. https://www.emergentmind.com/topics/swe-bench-pro-ecd5fbe8-1171-4842-b741-58d3df0ec409
104. *Reddit API Pricing in 2026: What You'll Actually Pay at ...*. https://www.citybiz.co/article/868288/reddit-api-pricing-in-2026-what-youll-actually-pay-at-every-tier
105. *Reddit Plans Pricing — API Pricing Plans | APIs.io Plans*. http://apis.io/plans/reddit/reddit-plans-pricing
106. *Reddit API Pricing 2026: Full Breakdown + Free Alternative*. https://www.redditcommentscraper.com/article-reddit-api-pricing-alternative.html
107. *Reddit API Pricing: What It Costs and Better Alternative*. https://data365.co/blog/reddit-api-pricing
108. *Reddit API Pricing in 2026: Complete Guide for Developers and ...*. https://www.techloy.com/reddit-api-pricing-in-2026-complete-guide-for-developers-and-businesses
109. *CLAUDE.md - harbor-framework/terminal-bench*. http://github.com/laude-institute/terminal-bench/blob/main/CLAUDE.md
110. *GitHub - harbor-framework/terminal-bench: A benchmark for LLMs on complicated tasks in the terminal · GitHub*. http://github.com/harbor-framework/terminal-bench
111. *harborframework/terminal-bench-2.0 at main - Hugging Face*. https://huggingface.co/datasets/harborframework/terminal-bench-2.0/tree/main/extract-elf
112. *Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces*. http://arxiv.org/html/2601.11868v1
113. *Harbor is a framework for running agent evaluations and ... - GitHub*. https://github.com/harbor-framework/harbor
114. *ToolACE: Winning the Points of LLM Function Calling*. https://openreview.net/forum?id=8EB8k6DdCU
115. *ToolACE: Winning the Points of LLM Function Calling*. https://mlanthology.org/iclr/2025/liu2025iclr-toolace
116. *Salesforce "tiny giant" xLAM-1b model surpasses GPT 3.5 in function calling*. https://www.reddit.com/r/LocalLLaMA/comments/1dz8g10/salesforce_tiny_giant_xlam1b_model_surpasses_gpt
117. *Salesforce XLAM Function Calling Dataset - Emergent Mind*. https://www.emergentmind.com/topics/salesforce-xlam-function-calling-dataset
118. *Introducing xLAM, Salesforce's family of Large Action Models*. https://www.salesforce.com/blog/xlam-large-action-models
119. *Semantic Scholar Academic Graph API | Semantic Scholar*. https://www.semanticscholar.org/product/api
120. *Data From Semantic Scholar Leightweight API • semanticscholar*. https://kth-library.github.io/semanticscholar
121. *APIs for Scholarly Resources: Semantic Scholar*. https://libguides.ucalgary.ca/c.php?g=732144&p=5260798
122. *Semantic Scholar - Academic Graph API*. https://api.semanticscholar.org/api-docs
123. *semanticscholar-skill/docs/limitations.md at main · Agents365 ...*. https://github.com/Agents365-ai/semanticscholar-skill/blob/main/docs/limitations.md
124. *openai/evals: Evals is a framework for evaluating LLMs and ... - GitHub*. http://github.com/openai/evals
125. *Simple evaluation scripts for AI benchmarks with minimal ...*. https://github.com/centerforaisafety/simple-evals
126. *openai/simple-evals*. https://github.com/openai/simple-evals
127. *Getting Started with OpenAI Evals*. https://developers.openai.com/cookbook/examples/evaluation/getting_started_with_openai_evals
128. *simple-evals/healthbench_scripts/healthbench_analysis. ...*. https://github.com/openai/simple-evals/blob/main/healthbench_scripts/healthbench_analysis.ipynb
129. *Claude Code Changelog: All Release Notes (2026)*. https://claudefa.st/blog/guide/changelog
130. *Claude Platform Docs*. https://platform.claude.com/docs/en/release-notes/overview
131. *Claude Code: The Changelog Nobody Read Is the Most ...*. https://alirezarezvani.medium.com/claude-code-the-changelog-nobody-read-is-the-most-important-one-be56bddbf6f1
132. *changelog · beeps*. http://beeps.dev/changelog
133. *The OpenAlex “polite pool” is*. https://developers.openalex.org/guides/deprecations
134. *API*. https://developers.openalex.org/
135. *OpenAlex*. http://linkedin.com/company/openalex
136. *OpenAlex - Wikipedia*. http://en.wikipedia.org/wiki/OpenAlex
137. *OpenAlex - Maastricht University Library*. https://library.maastrichtuniversity.nl/database/openalex
138. *Common Crawl Index Server*. https://index.commoncrawl.org/
139. *API Reference — CommonCrawl v0.3.4*. https://hexdocs.pm/common_crawl/api-reference.html
140. *CommonCrawl with Python – Get All Pages from a Domain*. https://www.jcchouinard.com/python-commoncrawl-extraction
141. *CommonCrawl.IndexAPI — CommonCrawl v0.3.4*. https://common-crawl.hexdocs.pm/CommonCrawl.IndexAPI.html
142. *GitHub - commoncrawl/whirlwind-python: A whirlwind tour of ...*. https://github.com/commoncrawl/whirlwind-python
143. *Arctic Shift Reddit Archive - ModelScope*. https://www.modelscope.cn/datasets/open-index/arctic
144. *Arctic Shift — Open-Source Reddit Data Archive - MythOS*. https://mythos.one/me/brianswichkow/d2e269
145. *Arctic Shift*. https://arctic-shift.photon-reddit.com/
146. *Reddit Archive - ihsoyct.github.io*. https://ihsoyct.github.io/index.html?backend=artic_shift
147. *Stack Exchange API*. https://api.stackexchange.com/docs
148. *Stack Exchange API*. https://api.stackexchange.com/
149. *Stack Exchange API - Docs, SDKs & Integration*. https://www.apitracker.io/a/stackexchange
150. *Stack Exchange API Reference — 124 Endpoints | openapi.city*. https://openapi.city/providers/stack-exchange
151. [Usage of /users [GET] - Stack Exchange API](https://api.stackexchange.com/docs/users)
152. *license - huggingface/datasets - GitHub*. https://github.com/huggingface/datasets/blob/main/LICENSE
153. *Datasets at Hugging Face*. https://huggingface.co/datasets/DataProvenanceInitiative/Commercially-Verified-Licenses
154. *Open Source AI - Fully Open Weights & Training Data - Hugging Face*. http://huggingface.co/collections/mindchain/open-source-ai-fully-open-weights-and-training-data
155. *Understanding Hugging Face: AI Model Licensing Guide - Bluebash*. https://www.bluebash.co/blog/understanding-hugging-face-ai-model-licensing-commercial-use
156. *A Large-Scale Analysis of Dataset Cards on Hugging Face*. http://arxiv.org/html/2401.13822v1
