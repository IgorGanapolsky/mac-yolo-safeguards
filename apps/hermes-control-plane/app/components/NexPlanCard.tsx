"use client";

import React, { useState } from "react";

export interface PlanStep {
  index: number;
  title: string;
  description?: string;
  status?: "pending" | "in_progress" | "completed";
}

export interface NexPlanCardProps {
  title?: string;
  goal?: string;
  marketEvidence?: string;
  approach?: string[];
  constraints?: string[];
  assumptions?: string;
  steps?: PlanStep[];
  onApprove?: () => void;
  onEdit?: () => void;
  onRequestChanges?: () => void;
  onDiscard?: () => void;
}

export function NexPlanCard({
  title = "ThumbGate Monetization Plan",
  goal = "Develop and execute a focused monetization setup for www.thumbgate.app that turns the existing free-control offering into paid customer revenue.",
  marketEvidence = "Public materials position ThumbGate around AI coding-agent safety, approval boundaries, and continuity. Pro tier at $19/month and B2B Partner Pilot at $3,000.",
  approach = [
    "Retain free control as product-led entry and make reliable unattended continuation the paid upgrade.",
    "Build a sales pipeline of verified agency prospects.",
    "Prepare evidence-based outreach drafts with verifiable booking links."
  ],
  constraints = [
    "Use only verified public information for prospective accounts.",
    "Do not invent customers, funding, headcount, or traction.",
    "Retain the current public pricing and offer structure."
  ],
  assumptions = "The objective is to create revenue through product-led entry plus targeted outbound qualification.",
  steps = [
    { index: 1, title: "Define the paid conversion and qualification motion" },
    { index: 2, title: "Build and verify the initial buyer pipeline" },
    { index: 3, title: "Prepare evidence-based outreach and conversion assets" }
  ],
  onApprove,
  onEdit,
  onRequestChanges,
  onDiscard
}: NexPlanCardProps) {
  const [isApproved, setIsApproved] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(true);

  const handleApprove = () => {
    setIsApproved(true);
    if (onApprove) onApprove();
  };

  return (
    <div
      style={{
        backgroundColor: "#111417",
        border: "1px solid #d97706",
        borderRadius: "14px",
        padding: "20px 24px",
        color: "#e2e8f0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        maxWidth: "680px",
        margin: "16px 0",
        boxShadow: "0 8px 32px rgba(217, 119, 6, 0.08)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <span style={{ fontSize: "16px", color: "#f59e0b" }}>📋</span>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#ffffff" }}>{title}</h3>
      </div>
      <p style={{ margin: "0 0 16px 0", fontSize: "11px", color: "#f59e0b", opacity: 0.9 }}>
        {isApproved ? "✓ Plan Approved and queued for execution." : "Approve to let Hermes proceed, or request changes."}
      </p>

      {/* Goal */}
      <div style={{ marginBottom: "14px" }}>
        <h4 style={{ margin: "0 0 4px 0", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Goal</h4>
        <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5", color: "#cbd5e1" }}>{goal}</p>
      </div>

      {/* Market Evidence */}
      {marketEvidence && (
        <div style={{ marginBottom: "14px" }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Market Evidence</h4>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: "1.5", color: "#94a3b8" }}>{marketEvidence}</p>
        </div>
      )}

      {/* Approach */}
      {approach.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Approach</h4>
          <ol style={{ margin: "0 0 0 18px", padding: 0, fontSize: "12.5px", color: "#cbd5e1", lineHeight: "1.6" }}>
            {approach.map((item, idx) => (
              <li key={idx} style={{ marginBottom: "4px" }}>{item}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Constraints */}
      {constraints.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <h4 style={{ margin: "0 0 4px 0", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Constraints</h4>
          <ul style={{ margin: "0 0 0 18px", padding: 0, fontSize: "12px", color: "#94a3b8", lineHeight: "1.5" }}>
            {constraints.map((c, idx) => (
              <li key={idx} style={{ marginBottom: "3px" }}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Steps Dropdown */}
      <div style={{
        backgroundColor: "#0d1117",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "18px"
      }}>
        <div
          onClick={() => setStepsExpanded(!stepsExpanded)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        >
          <span style={{ fontSize: "12px", fontWeight: 500, color: "#f8fafc" }}>
            {steps.length} Steps {stepsExpanded ? "▴" : "▾"}
          </span>
        </div>
        {stepsExpanded && (
          <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
            {steps.map((step) => (
              <div key={step.index} style={{ fontSize: "12px", color: "#cbd5e1", display: "flex", gap: "8px" }}>
                <span style={{ color: "#64748b" }}>{step.index}.</span>
                <span>{step.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Action Buttons */}
      {!isApproved ? (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            onClick={onDiscard}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              color: "#94a3b8",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            Discard plan
          </button>
          <button
            onClick={onEdit}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              color: "#94a3b8",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            Edit plan
          </button>
          <button
            onClick={onRequestChanges}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              color: "#cbd5e1",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            Request changes...
          </button>
          <button
            onClick={handleApprove}
            style={{
              background: "#d97706",
              border: "none",
              color: "#ffffff",
              borderRadius: "6px",
              padding: "6px 16px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(217, 119, 6, 0.4)"
            }}
          >
            Approve plan
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", color: "#22c55e", fontSize: "12px", fontWeight: 500 }}>
          <span>● Plan Approved</span>
        </div>
      )}
    </div>
  );
}
