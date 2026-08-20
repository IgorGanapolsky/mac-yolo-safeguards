import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-19 user report: after send, the viewport stayed at the composer while
// the new (newest-first) task row rendered off-screen at the top — the message
// looked lost. The post-send scroll must target the new task's own row.
test("post-send scroll targets the just-created task row, not the output strip", () => {
  assert.match(source, /getElementById\(`task-\$\{optimistic\.id\}`\)/);
  assert.doesNotMatch(
    source,
    /requestAnimationFrame\(\(\) => \{\s*document\.getElementById\("run-output"\)/,
  );
});

test("task rows keep the anchor id the scroll depends on", () => {
  assert.match(source, /id=\{`task-\$\{task\.id\}`\}/);
});

// 2026-08-20 user report: "i inputted a message, pressed enter, and don't see
// the message i inputted." loadWorkspace() runs concurrently with the
// optimistic render. If the just-created thread hasn't propagated to
// /api/threads yet, loadWorkspace must NOT clear threadDetails or replace
// setTasks without the optimistic row.
test("loadWorkspace preserves pending optimistic tasks instead of nuking threadDetails", () => {
  // The thread-not-found branch must guard with hasPendingConversationTasks.
  assert.match(
    source,
    /hasPendingConversationTasks\(pendingConversationTasksRef\.current\)/,
    "loadWorkspace must check hasPendingConversationTasks before clearing threadDetails on stale thread",
  );
  // The setTasks call must use mergeTasksForTaskList, not bare nextTasks.
  assert.match(
    source,
    /mergeTasksForTaskList\(/,
    "loadWorkspace must merge optimistic tasks into setTasks, not replace wholesale",
  );
  // Must NOT call bare setTasks(nextTasks) without merging.
  assert.doesNotMatch(
    source,
    /setTasks\(nextTasks\)/,
    "loadWorkspace must not replace setTasks with bare server tasks",
  );
});

// 2026-08-19 user report: the composer's Output strip kept replaying the newest
// task's completed result ("verification bubble" probe residue) forever, right
// under the input box — duplicating the task row above it. The strip is for
// notices and in-flight status only; completed results render in task rows.
test("composer output strip never echoes a completed result or error", () => {
  const strip = source.match(/<div className="run-output"[\s\S]{0,700}?<\/div>/)?.[0] ?? "";
  assert.ok(strip.length > 0, "run-output strip must exist (it is the post-send scroll fallback)");
  assert.doesNotMatch(strip, /visibleTasks\[0\][?.]*\s*\.?result\s*\}/, "strip must not render task result");
  assert.doesNotMatch(strip, /visibleTasks\[0\][?.]*\s*\.?error\s*\}/, "strip must not render task error");
  assert.match(strip, /Running on the hosted VPS/, "strip keeps the in-flight status");
  assert.match(strip, /Results show here after you send/, "strip keeps the idle placeholder");
});

test("prefetchThreadDetails retries on 404 when optimistic tasks are pending", () => {
  // The 404 path must NOT immediately clear threadDetails when there are
  // pending conversation tasks — it must schedule a retry instead.
  assert.match(
    source,
    /hasPendingConversationTasks\(pendingConversationTasksRef\.current\)/,
    "prefetchThreadDetails 404 path must check for pending tasks before clearing",
  );
  // Must include a setTimeout retry for the 404+pending case.
  assert.match(
    source,
    /setTimeout\(\(\) =>/,
    "prefetchThreadDetails 404 path must schedule a retry via setTimeout",
  );
});
