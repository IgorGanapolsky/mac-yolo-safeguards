/**
 * MaxHermes create-stages UX (Spinning up Hermes… / Loading evolution memory…)
 * adapted to ThumbGate pairing truth: connector → Leash → pair → first chat.
 */
const STAGES = [
  { id: "connector", label: "Spinning up the outbound connector…", detail: "One installer. HTTPS dial-out. No inbound ports." },
  { id: "leash", label: "Loading Leash policy…", detail: "Approve/deny stays under your control before tools run." },
  { id: "pair", label: "Pairing your Mac…", detail: "Short code + named machine. Private keys stay on device." },
  { id: "chat", label: "Opening first chat…", detail: "Install is step 0. Pair is step 1. First chat is the product." },
] as const;

export function CreateStages() {
  return (
    <section id="get-started" className="section-block create-stages" aria-labelledby="get-started-heading">
      <div className="section-heading">
        <p className="eyebrow">Get ThumbGate</p>
        <h2 id="get-started-heading">From zero to first chat in four honest stages.</h2>
        <p>
          Inspired by modern agent product onboarding — rewritten for what actually happens when you
          pair Hermes to ThumbGate (not a 10-second cloud sandbox claim).
        </p>
      </div>
      <ol className="create-stage-list">
        {STAGES.map((stage, index) => (
          <li key={stage.id} className="create-stage-item">
            <span className="create-stage-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3>{stage.label}</h3>
              <p>{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
