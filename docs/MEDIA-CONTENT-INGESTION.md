# Media Content Ingestion

Hermes should not ask the operator to choose between metadata extraction,
summary search, transcript extraction, or audio transcription when a media URL
is provided. It should try the safe paths in order and report what worked.

Use:

```sh
node tools/media-content-ingest.js "https://www.youtube.com/watch?v=..." --json
```

Outputs are written by default to:

```text
~/Library/Application Support/mac-yolo-safeguards/media-ingest/
```

## Extraction Order

1. `yt-dlp --dump-single-json` for title, description, uploader, duration, and
   canonical URL.
2. `yt-dlp --write-subs --write-auto-subs` for native or generated captions.
3. Local audio transcription only if `whisper` or `mlx_whisper` exists.
4. Structured blocked/partial report if content cannot be read.

The tool never claims it watched or listened to content unless a transcript was
actually extracted or produced.

## Hermes Operating Rule

When Igor sends a YouTube, podcast, or media link:

- Run the media ingest tool automatically.
- Summarize the extracted transcript or metadata.
- Convert the lesson into action lanes:
  - positioning
  - product
  - distribution
  - customer-loop
  - agent-os
  - daily-os
- Ask a follow-up only if all extraction routes fail or the next action requires
  a business choice.

## Why This Matters

The goal is not passive media summarization. The goal is to turn useful external
content into Hermes system improvements: repo issues, tested PRs, outreach
moves, customer-learning loops, and daily operating priorities.

## Stack Overflow for Agents Monetization

When Igor sends Stack Overflow for Agents as a market signal, run:

```sh
node tools/sofa-monetization-lane.js --json
```

This converts SOFA context into a Hermes Agent Reliability Audit lane: setup
readiness, contribution strategy, reusable proof assets, and buyer-facing
actions. It does not post, send outreach, or claim revenue; it creates the
verified action packet Hermes should execute from.
