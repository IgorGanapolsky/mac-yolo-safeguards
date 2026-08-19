import styles from "./give-work.module.css";

/**
 * Perplexity Computer steal (https://www.perplexity.ai/products/computer, 2026-08-19):
 * task-first example jobs, Give → Works → Iterate, "put it to work" closer.
 * Not their product: no connectors marketplace, no Pro/Max SKU, no "hours or months".
 * Not affiliated. Existing $10 hosted Hermes offer only.
 */
export const GIVE_WORK_EXAMPLES = [
  {
    id: "overnight-job",
    prompt:
      "Keep this coding agent running overnight. Pause on money, customer, or production.",
  },
  {
    id: "sleep-survive",
    prompt: "Keep working after the laptop sleeps. I approve in this browser.",
  },
  {
    id: "force-push-gate",
    prompt:
      "Draft the change. Stop before git push --force and ask in thumbgate.app.",
  },
] as const;

const LOGIN = "/api/auth/login";

export function GiveWorkLoop() {
  return (
    <section id="give-work" className={`section-block ${styles.wrap}`} data-testid="give-work">
      <div className="section-heading">
        <p className="eyebrow">Give it a job</p>
        <h2>Chats answer. Hosted Hermes keeps working.</h2>
        <p>
          Give hosted Hermes a job in this browser. It runs on a fenced VPS even when the
          laptop sleeps. Money, customer, or production actions pause for you in thumbgate.app.
        </p>
      </div>

      <ol className={styles.examples} data-testid="give-work-examples" aria-label="Example jobs">
        {GIVE_WORK_EXAMPLES.map((example) => (
          <li key={example.id}>
            <a
              href={LOGIN}
              className={styles.example}
              data-funnel-event="task_example_click"
              data-cta-id={example.id}
              data-testid={`give-work-example-${example.id}`}
            >
              <span className={styles.promptMark} aria-hidden="true">
                /
              </span>
              <span>{example.prompt}</span>
            </a>
          </li>
        ))}
      </ol>

      <div className="steps-grid" data-testid="give-work-loop">
        <article>
          <span>01</span>
          <h3>Give hosted Hermes a job</h3>
          <p>Sign in and type the work in the dashboard. Natural language. No desktop install.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Hosted Hermes works</h3>
          <p>
            The agent keeps a lease on a fenced VPS. The laptop can sleep. The run does not die
            with the lid.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Iterate and approve</h3>
          <p>
            Guide the run in this tab. Money, customer, or production actions pause in
            thumbgate.app.
          </p>
        </article>
      </div>

      <div className="section-heading" style={{ marginTop: "48px" }}>
        <p className="eyebrow">What hosted Hermes does</p>
        <h2>Background work with a human gate.</h2>
      </div>
      <div className="steps-grid" data-testid="give-work-does">
        <article>
          <h3>Work that survives sleep</h3>
          <p>
            Recurring and overnight jobs stay on the VPS. If it dies when the laptop sleeps, the
            trial failed.
          </p>
        </article>
        <article>
          <h3>Approvals in this browser</h3>
          <p>Approve or deny here. There is no phone leash and no third-party approval surface.</p>
        </article>
        <article>
          <h3>One always-on agent</h3>
          <p>
            One offer: hosted Hermes at $10/mo. Not a connector wall. Not a second SKU.
          </p>
        </article>
      </div>

      <div className={styles.close}>
        <h2>Put hosted Hermes to work</h2>
        <p>$10/mo · 14-day trial · cancel anytime. Approvals stay in thumbgate.app.</p>
        <a
          href={LOGIN}
          className="button button-primary"
          data-funnel-event="give_work_click"
          data-cta-id="put-hosted-hermes-to-work"
          data-testid="give-work-cta"
        >
          Start hosted Hermes — $10/mo
        </a>
      </div>
    </section>
  );
}
