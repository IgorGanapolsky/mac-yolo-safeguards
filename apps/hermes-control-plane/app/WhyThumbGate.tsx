/**
 * MaxHermes-style "Why" 3-benefit layout, remapped to ThumbGate's real wedge.
 * Source pattern: MaxHermes benefit_evolution / always_on / app reach —
 * we keep control-plane truth (not cloud agent host claims).
 */
export function WhyThumbGate() {
  return (
    <section id="why" className="section-block why-thumbgate" aria-labelledby="why-heading">
      <div className="section-heading">
        <p className="eyebrow">Why ThumbGate</p>
        <h2 id="why-heading">Control that grows with how you run agents.</h2>
        <p>
          Cloud agent hosts sell always-on compute. ThumbGate sells the missing operator layer:
          browser Leash, honest offline policy, and lessons that harden gates — on top of Hermes
          you already run (including Hermes + MiniMax and other providers).
        </p>
      </div>
      <div className="steps-grid why-grid">
        <article>
          <span>01 · Self-hardening</span>
          <h3>Feedback becomes gates</h3>
          <p>
            Mark responses up or down. Lessons re-rank what to promote into prevention rules —
            remember → re-rank → promote → expire. No silent demotion theater; only what you prove.
          </p>
        </article>
        <article>
          <span>02 · Always reachable</span>
          <h3>Leash from any browser</h3>
          <p>
            Approve or deny high-impact tools when you are not in the IDE. Free while the Mac is
            online. Continuity is optional paid offline handoff — not a rescue for a broken pair.
          </p>
        </article>
        <article>
          <span>03 · Surfaces you already use</span>
          <h3>Web dashboard + phone</h3>
          <p>
            Same remote control on thumbgate.app and Hermes Mobile. Pair once; chat, approvals, and
            offline policy travel with you — without MiniMax/Nous affiliation claims.
          </p>
        </article>
      </div>
    </section>
  );
}
