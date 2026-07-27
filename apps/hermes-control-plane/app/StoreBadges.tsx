/** Official-style store badges (SVG marks + badge chrome). Used on the landing hero + mobile section. */

type StoreBadgeProps = {
  /** Optional funnel event id for analytics. */
  className?: string;
  size?: "default" | "lg";
};

function GooglePlayMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
      {/* Multi-color Play triangle — recognizable Play brand mark */}
      <path fill="#EA4335" d="M19.3 19.6 4.5 34.7c.5.7 1.3 1.1 2.3 1.1.7 0 1.4-.2 2.1-.7l16.6-9.5-6.2-6z" />
      <path fill="#FBBC04" d="m34.3 16.4-6.5-3.7-6.1 6.1 6.1 6.1 6.6-3.8c1.8-1 1.8-2.7-.1-3.7z" />
      <path fill="#4285F4" d="M4.5 5.3C4.2 5.7 4 6.3 4 7v26c0 .7.2 1.3.5 1.7l15.3-15.3L4.5 5.3z" />
      <path fill="#34A853" d="m19.8 20 6.5-6.5L9 3.9C8.3 3.5 7.5 3.4 6.8 3.7c-.8.3-1.4.9-1.8 1.6L19.8 20z" />
    </svg>
  );
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M28.6 20.7c0-3.4 2.8-5.1 2.9-5.2-1.6-2.3-4.1-2.6-5-2.7-2.1-.2-4.1 1.3-5.2 1.3-1.1 0-2.7-1.2-4.5-1.2-2.3 0-4.4 1.3-5.6 3.4-2.4 4.2-.6 10.3 1.7 13.7 1.1 1.7 2.5 3.5 4.2 3.5 1.7-.1 2.3-1.1 4.4-1.1 2 0 2.6 1.1 4.4 1 1.8-.1 3-1.7 4.1-3.4 1.3-1.9 1.8-3.7 1.8-3.8-.1 0-3.5-1.4-3.2-5.5zM24.8 9.8c.9-1.1 1.5-2.7 1.4-4.2-1.3.1-2.9.9-3.9 2-.8.9-1.6 2.5-1.4 3.9 1.5.1 3-.8 3.9-1.7z"
      />
    </svg>
  );
}

export function GooglePlayBadge({ className = "", size = "default" }: StoreBadgeProps) {
  return (
    <a
      href="/go/android"
      className={`store-badge store-badge-play ${size === "lg" ? "store-badge-lg" : ""} ${className}`.trim()}
      data-funnel-event="play_store_click"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get Hermes Mobile on Google Play"
    >
      <GooglePlayMark className="store-badge-mark" />
      <span className="store-badge-copy">
        <span className="store-badge-kicker">GET IT ON</span>
        <span className="store-badge-title">Google Play</span>
      </span>
    </a>
  );
}

export function AppStoreBadge({ className = "", size = "default" }: StoreBadgeProps) {
  return (
    <a
      href="/go/ios"
      className={`store-badge store-badge-ios ${size === "lg" ? "store-badge-lg" : ""} ${className}`.trim()}
      data-funnel-event="app_store_click"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Hermes AI Agent Leash on the App Store"
    >
      <AppleMark className="store-badge-mark store-badge-mark-apple" />
      <span className="store-badge-copy">
        <span className="store-badge-kicker">Download on the</span>
        <span className="store-badge-title">App Store</span>
      </span>
    </a>
  );
}

export function StoreBadgeRow({
  className = "",
  size = "default",
  "aria-label": ariaLabel = "Hermes Mobile apps",
}: StoreBadgeProps & { "aria-label"?: string }) {
  return (
    <div className={`hero-store-links ${className}`.trim()} aria-label={ariaLabel}>
      <GooglePlayBadge size={size} />
      <AppStoreBadge size={size} />
    </div>
  );
}
