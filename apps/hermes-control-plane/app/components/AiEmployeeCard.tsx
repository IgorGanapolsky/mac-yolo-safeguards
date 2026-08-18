"use client";

import React from "react";

export interface AiEmployeeProps {
  id?: string;
  name?: string;
  role?: string;
  avatarUrl?: string;
  status?: "online" | "idle" | "running" | "offline";
  onboardedDate?: string;
  daysActive?: number;
  triggerCount?: number;
  taskCount?: number;
  expertise?: string[];
  actionRequiredCount?: number;
  onManage?: () => void;
}

export function AiEmployeeCard({
  id = "gate001",
  name = "ThumbGate Guard",
  role = "Staff PR & Security Engineer",
  avatarUrl,
  status = "online",
  onboardedDate = "2026-08-01",
  daysActive = 18,
  triggerCount = 12,
  taskCount = 142,
  expertise = ["Code Review", "PR Governance", "Security Preflight", "E2E Testing", "Debugging"],
  actionRequiredCount = 0,
  onManage
}: AiEmployeeProps) {
  const statusColor = status === "online" ? "#22c55e" : status === "running" ? "#38bdf8" : status === "idle" ? "#eab308" : "#71717a";

  return (
    <div style={{
      backgroundColor: "#141417",
      border: "1px solid #27272a",
      borderRadius: "16px",
      padding: "24px",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      maxWidth: "480px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
    }}>
      {/* Header Profile Section */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        {/* Avatar */}
        <div style={{
          width: "56px",
          height: "56px",
          borderRadius: "12px",
          backgroundColor: "#1f2937",
          border: "1px solid #374151",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          position: "relative",
          flexShrink: 0
        }}>
          🤖
          <span style={{
            position: "absolute",
            bottom: "-2px",
            right: "-2px",
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            backgroundColor: statusColor,
            border: "2px solid #141417"
          }} />
        </div>

        {/* Identity & Status */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>{name}</h3>
            <span style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              backgroundColor: "#27272a",
              color: "#a1a1aa",
              fontFamily: "monospace"
            }}>
              ID: {id}
            </span>
          </div>

          <div style={{ fontSize: "13px", color: "#38bdf8", marginTop: "2px", fontWeight: "500" }}>
            {role}
          </div>

          <div style={{ fontSize: "11px", color: "#71717a", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: statusColor }}>● {status.toUpperCase()}</span>
            <span>|</span>
            <span>Onboarded: {onboardedDate}</span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "8px",
        backgroundColor: "#18181b",
        border: "1px solid #27272a",
        borderRadius: "10px",
        padding: "12px",
        marginBottom: "18px",
        textAlign: "center"
      }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff" }}>{daysActive}</div>
          <div style={{ fontSize: "10.5px", color: "#a1a1aa", marginTop: "2px" }}>Days Active</div>
        </div>
        <div style={{ borderLeft: "1px solid #27272a", borderRight: "1px solid #27272a" }}>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#38bdf8" }}>{triggerCount}</div>
          <div style={{ fontSize: "10.5px", color: "#a1a1aa", marginTop: "2px" }}>Triggers ›</div>
        </div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#22c55e" }}>{taskCount}</div>
          <div style={{ fontSize: "10.5px", color: "#a1a1aa", marginTop: "2px" }}>Tasks ›</div>
        </div>
      </div>

      {/* Action Required Banner (If any Human Gate is Pending) */}
      {actionRequiredCount > 0 && (
        <div style={{
          backgroundColor: "#451a03",
          border: "1px solid #b45309",
          borderRadius: "8px",
          padding: "10px 14px",
          marginBottom: "16px",
          fontSize: "12px",
          color: "#fde68a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>⚠️ <strong>{actionRequiredCount} Action(s) Required</strong>: Human approval gate pending</span>
          <button
            type="button"
            onClick={onManage}
            style={{
              backgroundColor: "#f59e0b",
              color: "#000000",
              border: "none",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Review
          </button>
        </div>
      )}

      {/* Expertise Badges */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: "600", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
          Expertise & Capabilities
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {expertise.map((skill, idx) => (
            <span key={idx} style={{
              fontSize: "11px",
              backgroundColor: "#27272a",
              color: "#e4e4e7",
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid #3f3f46"
            }}>
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AiEmployeeCard;
