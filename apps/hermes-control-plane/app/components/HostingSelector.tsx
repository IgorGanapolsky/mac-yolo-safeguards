"use client";

import React, { useState } from "react";

export type HostingMode = "cloud" | "local";

export interface HostingSelectorProps {
  initialMode?: HostingMode;
  onSelect?: (mode: HostingMode) => void;
  onContinue?: (mode: HostingMode) => void;
  onBack?: () => void;
}

export function HostingSelector({
  initialMode = "local",
  onSelect,
  onContinue,
  onBack
}: HostingSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<HostingMode>(initialMode);
  const [showHelp, setShowHelp] = useState(false);

  const handleSelect = (mode: HostingMode) => {
    setSelectedMode(mode);
    if (onSelect) onSelect(mode);
  };

  const handleContinue = () => {
    if (onContinue) onContinue(selectedMode);
  };

  return (
    <div style={{
      maxWidth: "540px",
      margin: "0 auto",
      padding: "32px 24px",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      {/* Title & Header */}
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>
          Hosting
        </h1>
        <p style={{ fontSize: "14px", color: "#a1a1aa", margin: 0 }}>
          Choose where you want your assistant to live.{" "}
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            style={{
              background: "none",
              border: "none",
              color: "#38bdf8",
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
              fontSize: "14px"
            }}
          >
            Need help deciding?
          </button>
        </p>
      </div>

      {showHelp && (
        <div style={{
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: "20px",
          fontSize: "13px",
          color: "#d4d4d8",
          lineHeight: "1.5"
        }}>
          💡 <strong>Cloud Hosting</strong> runs 24/7 on ThumbGate infrastructure with continuous CI/PR checks even while sleeping.
          <br />
          💻 <strong>Local Hosting</strong> runs zero-cost on your Mac using Ollama or Apple Silicon with total data privacy.
        </div>
      )}

      {/* Hosting Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "28px" }}>
        {/* Cloud Option */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelect("cloud")}
          onKeyDown={(e) => e.key === "Enter" && handleSelect("cloud")}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 20px",
            borderRadius: "12px",
            backgroundColor: selectedMode === "cloud" ? "#1e1e24" : "#141417",
            border: selectedMode === "cloud" ? "1px solid #52525b" : "1px solid #27272a",
            cursor: "pointer",
            transition: "all 0.15s ease",
            gap: "16px"
          }}
        >
          {/* Cloud Icon */}
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            backgroundColor: "#27272a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            </svg>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "15px", fontWeight: "600", marginBottom: "3px" }}>
              ThumbGate Cloud
            </div>
            <div style={{ fontSize: "12.5px", color: "#a1a1aa", lineHeight: "1.4" }}>
              Always on, 24/7, even when your computer is off. Autonomous PR governance, regression testing, and cloud telemetry.
            </div>
          </div>

          {/* Radio / Check Indicator */}
          <div style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: selectedMode === "cloud" ? "5px solid #ffffff" : "2px solid #3f3f46",
            backgroundColor: selectedMode === "cloud" ? "#000000" : "transparent",
            boxSizing: "border-box",
            flexShrink: 0
          }} />
        </div>

        {/* Local Option */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelect("local")}
          onKeyDown={(e) => e.key === "Enter" && handleSelect("local")}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 20px",
            borderRadius: "12px",
            backgroundColor: selectedMode === "local" ? "#1e1e24" : "#141417",
            border: selectedMode === "local" ? "1px solid #52525b" : "1px solid #27272a",
            cursor: "pointer",
            transition: "all 0.15s ease",
            gap: "16px"
          }}
        >
          {/* Laptop Icon */}
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            backgroundColor: "#27272a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="12" x="3" y="4" rx="2"/>
              <line x1="2" x2="22" y1="20" y2="20"/>
            </svg>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "15px", fontWeight: "600", marginBottom: "3px" }}>
              Local
            </div>
            <div style={{ fontSize: "12.5px", color: "#a1a1aa", lineHeight: "1.4" }}>
              Runs directly on your machine. Your code, keys, and private data never leave your computer ($0.00 local LLMs).
            </div>
          </div>

          {/* Radio / Check Indicator */}
          <div style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: selectedMode === "local" ? "5px solid #ffffff" : "2px solid #3f3f46",
            backgroundColor: selectedMode === "local" ? "#000000" : "transparent",
            boxSizing: "border-box",
            flexShrink: 0
          }} />
        </div>
      </div>

      {/* Primary Action Button */}
      <button
        type="button"
        onClick={handleContinue}
        style={{
          width: "100%",
          padding: "12px 0",
          backgroundColor: "#ffffff",
          color: "#09090b",
          fontSize: "14px",
          fontWeight: "600",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          marginBottom: "16px",
          transition: "background-color 0.15s ease"
        }}
      >
        Continue
      </button>

      {/* Back Link */}
      {onBack && (
        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "#71717a",
              fontSize: "13px",
              cursor: "pointer"
            }}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

export default HostingSelector;
