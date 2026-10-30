# Statement of work: Herdr swarm coordination

One prompt from Igor is the same prompt for every agent in the swarm. The swarm earns an A+ only when every plane below has proof in the same review. A binary that is installed, a folder that exists, or a score written in advance is not proof.

## Planes

| Plane | Proof that scores 10 |
| --- | --- |
| Herdr | A 16-character prompt hash, one seat such as `worker@workshop`, branch `agent/...`, and exactly one writer |
| Linear | An issue key such as `AGENT-1`, or a written reason this task has no Linear issue |
| Obsidian | A note under `Documents/AI-Agent-Sync/` or `Documents/Igor/`, or a written reason this task does not go in the vault |
| GitButler or worktree | Branch `agent/...` isolated as `worktree` or `gitbutler`. This repo's write path is the worktree. |
| Gemini notebook | A NotebookLM URL, or a Markdown file under `docs/` |
| GitHub | A pull request on `IgorGanapolsky/mac-yolo-safeguards`. A GitHub issue is only for a public product report. |
| Judge | A verdict of accept or reject from a model other than the worker, with evidence that is not the worker's own sentence |
| Experts | At least two named experts, and the chosen expert is one of them |

## Rules

- The grade is the lowest plane. One missing proof keeps the grade incomplete.
- The review does not call a model, does not create a capsule file, and does not award a savings number.
- Agent coordination stays out of GitHub issues.
- Do not edit the swarm scorecard on the open swarm pull request. That file already records its own top grade.

Review command: `node tools/herdr-swarm-coordination-gate.js`
