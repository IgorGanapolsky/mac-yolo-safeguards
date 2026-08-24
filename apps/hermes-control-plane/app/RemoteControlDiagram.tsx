/** Static illustration: approve in thumbgate.app, judge gates, fenced VPS. */
export function RemoteControlDiagram() {
  return (
    <div
      className="remote-diagram"
      role="img"
      aria-label="You approve in thumbgate.app; LLM-as-a-Judge gates; fenced VPS runner"
    >
      <svg viewBox="0 0 460 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="18" y="28" width="110" height="86" rx="8" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.03)" />
        <rect x="18" y="28" width="110" height="18" rx="8" fill="rgba(255,255,255,.04)" />
        <circle cx="30" cy="37" r="3" fill="var(--muted)" />
        <circle cx="40" cy="37" r="3" fill="var(--muted)" />
        <rect x="28" y="56" width="90" height="8" rx="3" fill="var(--accent)" opacity=".75" />
        <rect x="28" y="72" width="60" height="8" rx="3" fill="var(--muted)" opacity=".5" />
        <rect x="28" y="88" width="48" height="14" rx="4" fill="rgba(34,211,238,.18)" stroke="var(--accent)" strokeWidth="1" />

        <line x1="128" y1="72" x2="352" y2="60" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 7" className="diagram-flow" />
        <circle cx="219" cy="66" r="16" fill="rgba(79,70,229,.16)" stroke="rgba(79,70,229,.45)" strokeWidth="1.4" />
        <rect x="212" y="69" width="14" height="10" rx="2" stroke="var(--primary)" strokeWidth="1.6" />
        <path d="M215 69v-3a4 4 0 0 1 8 0v3" stroke="var(--primary)" strokeWidth="1.6" fill="none" />

        <rect x="358" y="24" width="86" height="56" rx="6" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.03)" />
        <rect x="366" y="32" width="70" height="40" rx="3" fill="rgba(34,211,238,.06)" />
        <path d="M346 88 L456 88 L446 100 L356 100 Z" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.02)" />
        <circle cx="401" cy="52" r="11" fill="rgba(34,211,238,.18)" stroke="var(--accent)" strokeWidth="1.4" />
        <text x="401" y="56" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)" fontFamily="ui-monospace, monospace">VPS</text>
      </svg>
      <div className="remote-diagram-labels">
        <span>thumbgate.app</span>
        <span>LLM-as-a-Judge</span>
        <span>Fenced VPS</span>
      </div>
    </div>
  );
}
