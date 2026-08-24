"use client";

import styles from "./turn-statusline.module.css";

export function TurnStatusline({
  engine,
  ttft,
  cost,
}: {
  engine: string;
  ttft: string;
  cost: string;
}) {
  return (
    <div className={styles.bar} data-testid="turn-statusline" role="status" aria-label="Turn Statusline">
      <span className={styles.tag}>
        <span aria-hidden="true">📊</span>
        <strong>Turn Statusline</strong>
      </span>
      <span className={styles.sep} aria-hidden="true">
        |
      </span>
      <span>
        <strong>Engine:</strong> {engine}
      </span>
      <span className={styles.sep} aria-hidden="true">
        |
      </span>
      <span>
        <strong>TTFT:</strong> <span className={styles.metric}>{ttft}</span>
      </span>
      <span className={styles.sep} aria-hidden="true">
        |
      </span>
      <span>
        <strong>Cost:</strong> <span className={styles.metric}>{cost}</span>
      </span>
    </div>
  );
}
