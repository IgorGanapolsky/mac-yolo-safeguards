/** Static illustration: phone pairs to a Mac running Hermes. No client JS required. */
export function RemoteControlDiagram() {
  return (
    <div className="remote-diagram" role="img" aria-label="Your phone connects securely to your Mac, which keeps running Hermes">
      <svg viewBox="0 0 460 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="22" y="18" width="58" height="112" rx="12" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.03)" />
        <rect x="30" y="30" width="42" height="78" rx="4" fill="rgba(34,211,238,.08)" />
        <rect x="36" y="40" width="30" height="6" rx="3" fill="var(--accent)" opacity=".75" />
        <rect x="36" y="53" width="22" height="6" rx="3" fill="var(--muted)" opacity=".5" />
        <rect x="36" y="66" width="26" height="6" rx="3" fill="var(--accent)" opacity=".4" />
        <circle cx="51" cy="120" r="3" fill="var(--muted)" />

        <line x1="86" y1="72" x2="352" y2="60" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 7" className="diagram-flow" />
        <circle cx="219" cy="66" r="16" fill="rgba(79,70,229,.16)" stroke="rgba(79,70,229,.45)" strokeWidth="1.4" />
        <rect x="212" y="69" width="14" height="10" rx="2" stroke="var(--primary)" strokeWidth="1.6" />
        <path d="M215 69v-3a4 4 0 0 1 8 0v3" stroke="var(--primary)" strokeWidth="1.6" fill="none" />

        <rect x="358" y="24" width="86" height="56" rx="6" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.03)" />
        <rect x="366" y="32" width="70" height="40" rx="3" fill="rgba(34,211,238,.06)" />
        <path d="M346 88 L456 88 L446 100 L356 100 Z" stroke="var(--line)" strokeWidth="2" fill="rgba(255,255,255,.02)" />
        <circle cx="401" cy="52" r="11" fill="rgba(34,211,238,.18)" stroke="var(--accent)" strokeWidth="1.4" />
        <text x="401" y="56" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)" fontFamily="ui-monospace, monospace">H</text>
      </svg>
      <div className="remote-diagram-labels">
        <span>Your phone</span>
        <span>Encrypted pairing</span>
        <span>Your Mac · Hermes</span>
      </div>
    </div>
  );
}
