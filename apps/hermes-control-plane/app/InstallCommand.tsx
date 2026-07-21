"use client";

import { useState } from "react";

const connectorInstallCommand = "curl -fsSL https://thumbgate.app/install.sh | bash";

export function InstallCommand() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(connectorInstallCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="installer-command">
      <code>{connectorInstallCommand}</code>
      <button className="button button-secondary button-small" type="button" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy the installer command"}
      </button>
    </div>
  );
}
