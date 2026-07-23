"use client";

import { useState } from "react";
import styles from "./approval-gate-demo.module.css";

type ScenarioKey = "safe" | "risky";
type Decision = "pending" | "approved" | "denied";

const scenarios = {
  safe: {
    label: "Safe call",
    title: "Run the test suite",
    command: "npm test",
    risk: "Low risk",
    riskDetail: "Scoped to this repository",
    reason: "No destructive flags, credential access, or network write detected.",
    policy: "shell.safe-command.v3",
    hardBlock: false,
  },
  risky: {
    label: "Risky call",
    title: "Rewrite the protected branch",
    command: "git push --force origin main",
    risk: "Critical risk",
    riskDetail: "Protected history rewrite",
    reason: "Force-pushing main can erase teammates' commits and break production.",
    policy: "git.protected-branch.v5",
    hardBlock: true,
  },
} as const;

function TrailStep({
  number,
  label,
  detail,
  tone,
}: {
  number: string;
  label: string;
  detail: string;
  tone: "complete" | "pending" | "approved" | "denied";
}) {
  return (
    <li className={`${styles.trailStep} ${styles[tone]}`}>
      <span className={styles.stepMarker} aria-hidden="true">{number}</span>
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </li>
  );
}

export function ApprovalGateDemo() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("safe");
  const [decision, setDecision] = useState<Decision>("pending");
  const scenario = scenarios[scenarioKey];

  function selectScenario(next: ScenarioKey) {
    setScenarioKey(next);
    setDecision("pending");
  }

  const executionDetail =
    decision === "approved"
      ? "Executed once on the selected Mac"
      : decision === "denied"
        ? "Never sent to an executor"
        : "Nothing runs while the gate is waiting";

  return (
    <>
      <div className={styles.heading}>
        <p className="eyebrow">Interactive approval demo</p>
        <h2 id="approval-demo-heading">See the exact call before it runs.</h2>
        <p>
          ThumbGate pauses the agent, explains the risk, and binds your decision to this exact call.
          Switch scenarios, then approve or deny it yourself.
        </p>
      </div>

      <div className={styles.scenarioTabs} role="tablist" aria-label="Agent call examples">
        {(Object.keys(scenarios) as ScenarioKey[]).map((key) => {
          const option = scenarios[key];
          const selected = key === scenarioKey;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="approval-gate-panel"
              className={`${styles.scenarioTab} ${selected ? styles.scenarioTabSelected : ""}`}
              onClick={() => selectScenario(key)}
            >
              <span className={key === "safe" ? styles.safeDot : styles.riskyDot} aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{option.command}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="approval-gate-panel"
        className={styles.demoGrid}
        role="tabpanel"
        aria-labelledby="approval-demo-heading"
      >
        <article className={styles.callCard} aria-label={`${scenario.label} approval card`}>
          <header className={styles.cardHeader}>
            <span className={styles.brandLockup}>
              <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
              ThumbGate Leash
            </span>
            <span className={`${styles.stateBadge} ${styles[decision]}`}>
              {decision === "pending" ? "Decision required" : decision}
            </span>
          </header>

          <div className={styles.requestCopy}>
            <span>Hermes wants to use Shell</span>
            <h3>{scenario.title}</h3>
          </div>

          <pre className={styles.commandBlock} aria-label="Command to review">
            <code><span aria-hidden="true">$ </span>{scenario.command}</code>
          </pre>

          <dl className={styles.facts}>
            <div>
              <dt>Where</dt>
              <dd>Your Mac · current repo</dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd className={scenarioKey === "safe" ? styles.safeText : styles.riskyText}>
                {scenario.risk}
              </dd>
            </div>
          </dl>

          <div className={`${styles.explanation} ${scenarioKey === "safe" ? styles.safeExplanation : styles.riskyExplanation}`}>
            <span aria-hidden="true">{scenarioKey === "safe" ? "✓" : "!"}</span>
            <p><strong>{scenario.riskDetail}</strong>{scenario.reason}</p>
          </div>

          <div className={styles.decisionActions}>
            <button
              type="button"
              className={styles.approveButton}
              disabled={scenario.hardBlock || decision !== "pending"}
              onClick={() => setDecision("approved")}
              title={scenario.hardBlock ? "A protected-branch hard rule cannot be overridden in this demo" : undefined}
            >
              {scenario.hardBlock ? "Approve locked" : "Approve call"}
            </button>
            <button
              type="button"
              className={styles.denyButton}
              disabled={decision !== "pending"}
              onClick={() => setDecision("denied")}
            >
              Deny call
            </button>
          </div>

          {decision !== "pending" ? (
            <button type="button" className={styles.resetButton} onClick={() => setDecision("pending")}>
              Reset this example
            </button>
          ) : null}
        </article>

        <aside className={styles.trailCard} aria-label="Decision audit trail" aria-live="polite">
          <div className={styles.trailHeader}>
            <div>
              <span>What happens next</span>
              <h3>One call. One verdict.</h3>
            </div>
            <span className={styles.simulationBadge}>UI simulation</span>
          </div>

          <ol className={styles.trail}>
            <TrailStep
              number="1"
              label="Agent requests a tool call"
              detail={`Shell · ${scenario.command}`}
              tone="complete"
            />
            <TrailStep
              number="2"
              label="ThumbGate inspects it"
              detail={`${scenario.risk} · ${scenario.riskDetail}`}
              tone="complete"
            />
            <TrailStep
              number="3"
              label={scenario.hardBlock ? "Hard rule requires denial" : "You choose"}
              detail={
                decision === "pending"
                  ? scenario.hardBlock
                    ? "Approve is locked; the destructive call stays paused"
                    : "Approve or deny from web or phone"
                  : `Verdict recorded: ${decision.toUpperCase()}`
              }
              tone={decision}
            />
            <TrailStep
              number="4"
              label={decision === "approved" ? "Executor receives it" : decision === "denied" ? "Execution stays blocked" : "Executor waits"}
              detail={executionDetail}
              tone={decision}
            />
          </ol>

          <div className={`${styles.receipt} ${styles[decision]}`}>
            <div>
              <span>Decision receipt</span>
              <strong>{decision === "pending" ? "Waiting for your tap" : decision === "approved" ? "Approved · executed once" : "Denied · never executed"}</strong>
            </div>
            <dl>
              <div><dt>Decision</dt><dd>{decision.toUpperCase()}</dd></div>
              <div><dt>Executed</dt><dd>{decision === "approved" ? "TRUE" : "FALSE"}</dd></div>
              <div><dt>Policy</dt><dd>{scenario.policy}</dd></div>
            </dl>
          </div>

          <p className={styles.demoNote}>
            This public demo is local UI only. It sends no command, reads no workspace data, and creates no approval.
          </p>
        </aside>
      </div>
    </>
  );
}
