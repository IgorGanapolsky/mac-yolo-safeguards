"use client";

import React, { useState } from "react";
import { AiEmployeeCard } from "./AiEmployeeCard";

export function DownloadCenter() {
  const [activeOs, setActiveOs] = useState<"mac" | "win" | "linux">("mac");
  const [copied, setCopied] = useState(false);

  const linuxInstallCmd = "curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh | bash";

  const handleCopyLinux = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(linuxInstallCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      maxWidth: "1080px",
      margin: "0 auto",
      padding: "40px 24px",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      {/* Top Section: ThumbGate Mobile */}
      <div style={{
        backgroundColor: "#141417",
        border: "1px solid #27272a",
        borderRadius: "20px",
        padding: "36px 32px",
        marginBottom: "32px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "32px",
        alignItems: "center"
      }}>
        <div>
          <span style={{
            fontSize: "12px",
            fontWeight: "700",
            color: "#38bdf8",
            textTransform: "uppercase",
            letterSpacing: "0.08em"
          }}>
            Mobile Control Center
          </span>
          <h2 style={{ fontSize: "32px", fontWeight: "800", margin: "8px 0 12px 0", letterSpacing: "-0.03em" }}>
            ThumbGate Mobile
          </h2>
          <p style={{ fontSize: "15px", color: "#a1a1aa", lineHeight: "1.6", marginBottom: "24px" }}>
            Mobile control center for autonomous AI agents — monitor tasks, approve dangerous tool calls, and manage your agent fleet anytime, anywhere.
          </p>

          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <a
              href="/go/ios"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                backgroundColor: "#27272a",
                border: "1px solid #3f3f46",
                color: "#ffffff",
                padding: "10px 18px",
                borderRadius: "10px",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: "600"
              }}
            >
               App Store
            </a>
            <a
              href="/go/android"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                backgroundColor: "#27272a",
                border: "1px solid #3f3f46",
                color: "#ffffff",
                padding: "10px 18px",
                borderRadius: "10px",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: "600"
              }}
            >
              ▶ Google Play
            </a>
          </div>
        </div>

        {/* Mobile Mockup Preview */}
        <div style={{
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #27272a", paddingBottom: "10px" }}>
            <div style={{ fontSize: "14px", fontWeight: "700" }}>Live Agent Fleet</div>
            <span style={{ fontSize: "11px", backgroundColor: "#22c55e22", color: "#22c55e", padding: "2px 8px", borderRadius: "12px", fontWeight: "600" }}>
              • 3 Active
            </span>
          </div>

          <div style={{ backgroundColor: "#27272a", padding: "12px", borderRadius: "8px", fontSize: "12.5px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <strong>Refactor payment module</strong>
              <span style={{ color: "#38bdf8", fontSize: "11px" }}>In Progress</span>
            </div>
            <div style={{ fontSize: "11px", color: "#a1a1aa" }}>Machine: Igors-Mac-mini • PR #1799 rebased</div>
          </div>

          <div style={{ backgroundColor: "#451a03", border: "1px solid #b45309", padding: "12px", borderRadius: "8px", fontSize: "12.5px", color: "#fde68a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <strong>Stripe Retainer Payment Hook</strong>
              <span style={{ color: "#f59e0b", fontSize: "11px", fontWeight: "700" }}>Action Required</span>
            </div>
            <div style={{ fontSize: "11px", color: "#fde68a" }}>Approve $2,500/mo retainer webhook dispatch</div>
          </div>
        </div>
      </div>

      {/* Bottom Section: ThumbGate Wake (Always-On AI Employees) */}
      <div style={{
        backgroundColor: "#141417",
        border: "1px solid #27272a",
        borderRadius: "20px",
        padding: "36px 32px",
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        gap: "32px",
        alignItems: "center"
      }}>
        <div>
          <span style={{
            fontSize: "12px",
            fontWeight: "700",
            color: "#22c55e",
            textTransform: "uppercase",
            letterSpacing: "0.08em"
          }}>
            Always-On Daemon
          </span>
          <h2 style={{ fontSize: "32px", fontWeight: "800", margin: "8px 0 12px 0", letterSpacing: "-0.03em" }}>
            ThumbGate Wake
          </h2>
          <p style={{ fontSize: "15px", color: "#a1a1aa", lineHeight: "1.6", marginBottom: "24px" }}>
            Your always-on digital AI employees. Runs continuously in the background on macOS, Windows, or Linux. Never dies when your laptop sleeps.
          </p>

          {/* OS Download Tabs */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "380px" }}>
            <button
              type="button"
              onClick={() => setActiveOs("mac")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 18px",
                borderRadius: "10px",
                backgroundColor: activeOs === "mac" ? "#22c55e" : "#1f2937",
                color: activeOs === "mac" ? "#000000" : "#ffffff",
                border: "none",
                fontWeight: "700",
                cursor: "pointer",
                fontSize: "13.5px"
              }}
            >
              <span> macOS (Apple Silicon & Intel)</span>
              <span>macOS 13+ ›</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveOs("win")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 18px",
                borderRadius: "10px",
                backgroundColor: activeOs === "win" ? "#22c55e" : "#1f2937",
                color: activeOs === "win" ? "#000000" : "#ffffff",
                border: "none",
                fontWeight: "700",
                cursor: "pointer",
                fontSize: "13.5px"
              }}
            >
              <span>⊞ Windows</span>
              <span>Windows 10/11 ›</span>
            </button>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#18181b",
              border: "1px solid #27272a",
              borderRadius: "10px",
              padding: "10px 14px"
            }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#a1a1aa" }}>🐧 Linux</span>
              <code style={{ fontSize: "11px", color: "#38bdf8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                curl -fsSL https://thumbgate.app/install.sh | bash
              </code>
              <button
                type="button"
                onClick={handleCopyLinux}
                style={{
                  backgroundColor: "#27272a",
                  color: "#ffffff",
                  border: "1px solid #3f3f46",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  cursor: "pointer"
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        {/* AI Employee Card Preview */}
        <div>
          <AiEmployeeCard
            id="gate001"
            name="ThumbGate Wake Agent"
            role="Staff PR & Security Sentinel"
            status="online"
            daysActive={28}
            triggerCount={9}
            taskCount={78}
            expertise={["Code Review", "Requirement Analysis", "Architecture Design", "Testing Strategy", "Debugging"]}
          />
        </div>
      </div>
    </div>
  );
}

export default DownloadCenter;
