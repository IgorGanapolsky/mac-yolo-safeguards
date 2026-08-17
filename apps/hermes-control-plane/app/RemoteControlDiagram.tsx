/** Static illustration: Web Workspace & Cloud Continuity VPS with LLM-as-a-Judge safety. */
export function RemoteControlDiagram() {
  return (
    <div
      className="remote-diagram"
      role="img"
      aria-label="Web Workspace (or Hermes Mobile) for approvals; LLM-as-a-Judge gates; fenced Continuity VPS runner"
    >
      <svg viewBox="0 0 460 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Web Workspace Browser Console */}
        <rect x="18" y="24" width="96" height="72" rx="6" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.03)" />
        <rect x="18" y="24" width="96" height="16" rx="6" fill="rgba(255,255,255,.05)" />
        <circle cx="28" cy="32" r="2.5" fill="#f87171" opacity=".8" />
        <circle cx="36" cy="32" r="2.5" fill="#fbbf24" opacity=".8" />
        <circle cx="44" cy="32" r="2.5" fill="#34d399" opacity=".8" />
        <rect x="26" y="48" width="54" height="6" rx="3" fill="var(--accent)" opacity=".75" />
        <rect x="26" y="60" width="76" height="6" rx="3" fill="var(--muted)" opacity=".5" />
        <rect x="26" y="72" width="40" height="6" rx="3" fill="var(--accent)" opacity=".4" />

        {/* Animated Connecting Flow */}
        <line x1="118" y1="60" x2="346" y2="60" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 7" className="diagram-flow" />

        {/* Center: LLM-as-a-Judge Security Gate */}
        <circle cx="230" cy="60" r="18" fill="rgba(79,70,229,.18)" stroke="rgba(79,70,229,.55)" strokeWidth="1.5" />
        <rect x="223" y="63" width="14" height="10" rx="2" stroke="var(--primary)" strokeWidth="1.6" fill="rgba(79,70,229,.2)" />
        <path d="M226 63v-3a4 4 0 0 1 8 0v3" stroke="var(--primary)" strokeWidth="1.6" fill="none" />

        {/* Right: Fenced Cloud VPS Sandbox */}
        <rect x="350" y="24" width="92" height="72" rx="6" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.03)" />
        <rect x="358" y="34" width="76" height="16" rx="3" fill="rgba(34,211,238,.08)" stroke="rgba(34,211,238,.25)" strokeWidth="1" />
        <circle cx="368" cy="42" r="3" fill="var(--accent)" />
        <rect x="376" y="39" width="48" height="6" rx="3" fill="var(--accent)" opacity=".7" />
        <rect x="358" y="56" width="76" height="16" rx="3" fill="rgba(255,255,255,.04)" stroke="var(--line)" strokeWidth="1" />
        <circle cx="368" cy="64" r="3" fill="#34d399" />
        <rect x="376" y="61" width="36" height="6" rx="3" fill="var(--muted)" opacity=".6" />
        <rect x="358" y="78" width="76" height="10" rx="2" fill="rgba(34,211,238,.12)" />
        <text x="396" y="86" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--accent)" fontFamily="ui-monospace, monospace">90s LEASE</text>
      </svg>
      <div className="remote-diagram-labels">
        <span>Web Workspace / Hermes Mobile</span>
        <span>LLM-as-a-Judge</span>
        <span>Continuity VPS</span>
      </div>
    </div>
  );
}
