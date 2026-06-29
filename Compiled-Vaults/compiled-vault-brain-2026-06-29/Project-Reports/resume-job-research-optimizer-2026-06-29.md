# Resume Job Research Optimizer — 2026-06-29

Source workspace: `/Users/igorganapolsky/workspace/git/igor/Resume`

## Current State

- Generated report: `/Users/igorganapolsky/workspace/git/igor/Resume/applications/job_applications/2026-06-29_job_research_optimizer.md`
- Generated JSON: `/Users/igorganapolsky/workspace/git/igor/Resume/applications/job_applications/2026-06-29_job_research_optimizer.json`
- Script: `/Users/igorganapolsky/workspace/git/igor/Resume/scripts/job_research_optimizer.py`
- Mode: read-only ranking; no external job submission or messaging.
- Guardrails: Anthropic and OpenAI are blocked; target Data Science, ML, AI Engineer, and RAG Engineer roles.

## Top Queue

1. Intuitive — Staff AI/ML Architect, Embodied AI (score 38)
2. Medtronic — Principal Software Engineer, Signals & Algorithm Interfaces (score 36)
3. Intuitive — Senior AI/ML Research Engineer, Computer Vision (score 34)
4. Intuitive — Senior Machine Learning Engineer (score 34)
5. Johnson & Johnson — Senior Manager, Agentic AI (score 32)
6. Waxcom — Senior AI / Full-Stack Engineer (score 32)

## Verification

- `python3 scripts/job_research_optimizer.py --limit 25 --output-date 2026-06-29`
- `python3 -m pytest tests/test_dataannotation_monitor.py tests/test_job_research_optimizer.py`
- Test result: 6 passed.
