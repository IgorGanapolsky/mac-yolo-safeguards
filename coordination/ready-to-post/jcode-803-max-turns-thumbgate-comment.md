# Ready-to-post: comment for 1jehuang/jcode#803

**Target:** https://github.com/1jehuang/jcode/issues/803 (`jcode run` has no turn/step limit — runaway-agent gap; open, needs-decision)
**Posting account:** IgorGanapolsky (via Mac-side `gh` — this CCR session cannot post cross-owner).
**ThumbGate mention:** yes — this is the ONE permitted mention for this engagement run (genuine
topical fit: the issue is literally about runaway-agent limits). Do not post if a maintainer
has already replied with a decided design; re-check before posting.

---

+1 on this being a real gap — an unattended `jcode run` with no step ceiling is the exact
failure mode that burns tokens overnight. Two things from building the same guard elsewhere
that might save you a design round-trip:

1. **A turn cap alone under-protects.** In practice runaways come in three shapes: too many
   turns, one turn that never ends (a tool call that hangs or a model that streams forever),
   and loops that stay under any fixed cap by alternating (edit → revert → edit). The
   minimal set that's worked for us across Claude Code / Cursor / Codex in YOLO mode is:
   `--max-turns` + a per-turn wall-clock timeout + a no-progress detector (same file set,
   no diff for N turns → stop). All three are cheap at the harness layer; only the harness
   sees turn boundaries.

2. **Exit semantics matter more than the cap.** When the cap trips, exiting non-zero with a
   machine-readable reason (`{"stopped":"max_turns","turns":N}`) lets wrapping scripts
   distinguish "budget exhausted" from "task failed" — otherwise people just raise the cap
   and lose the protection.

We ship OS-level versions of these guards (kill-switches, timeouts, resource caps for
agent processes) as open source in
[mac-yolo-safeguards](https://github.com/IgorGanapolsky/mac-yolo-safeguards), and the
approval-layer variant (gate specific actions rather than counting turns) is what we build
at ThumbGate — happy to share the no-progress-detector heuristics if useful. For jcode
specifically a `--max-turns` in `jcode run` + the JSON exit reason would already close the
unattended-runaway hole this issue describes.
