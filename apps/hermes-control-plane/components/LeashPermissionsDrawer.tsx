'use client';

import React from 'react';

export interface PendingApprovalItem {
  id: string;
  action: string;
  command?: string;
  createdAt: string;
}

interface LeashPermissionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pendingApprovals: PendingApprovalItem[];
  onApproveAction: (id: string) => void;
  onDenyAction: (id: string) => void;
  isFencedExecution: boolean;
}

export function LeashPermissionsDrawer({
  isOpen,
  onClose,
  pendingApprovals,
  onApproveAction,
  onDenyAction,
  isFencedExecution,
}: LeashPermissionsDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(9, 13, 22, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 200,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
      id="leash-drawer-backdrop"
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          height: '100%',
          backgroundColor: '#0B0F19',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
          color: '#F9FAFB',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
        id="leash-drawer-content"
      >
        {/* Drawer Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛡️ Leash Permissions & Safety
            </h2>
            <p style={{ margin: '4px 0 0', color: '#9CA3AF', fontSize: '12px' }}>
              Fenced execution safeguards & pending agent approvals
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Fenced Execution Banner */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            backgroundColor: isFencedExecution ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            border: isFencedExecution ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '20px' }}>{isFencedExecution ? '🔒' : '⚠️'}</span>
          <div>
            <div style={{ fontWeight: 650, fontSize: '13px', color: isFencedExecution ? '#10B981' : '#F59E0B' }}>
              {isFencedExecution ? 'Fenced Execution Active' : 'Unrestricted Mode'}
            </div>
            <p style={{ margin: '2px 0 0', color: '#9CA3AF', fontSize: '11px' }}>
              {isFencedExecution
                ? 'Destructive commands require explicit approval'
                : 'Agent executes commands without pre-approval gates'}
            </p>
          </div>
        </div>

        {/* Pending Approvals Section */}
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px', color: '#E5E7EB' }}>
          Pending Approvals ({pendingApprovals.length})
        </h3>

        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: '12px', alignContent: 'start' }}>
          {pendingApprovals.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              No pending approvals. Your Mac is running safely.
            </div>
          ) : (
            pendingApprovals.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>{item.action}</div>
                {item.command && (
                  <pre
                    style={{
                      margin: '0 0 12px',
                      padding: '8px 10px',
                      backgroundColor: '#070A10',
                      borderRadius: '6px',
                      color: '#22D3EE',
                      fontSize: '11px',
                      fontFamily: 'ui-monospace, monospace',
                      overflowX: 'auto',
                    }}
                  >
                    {item.command}
                  </pre>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => onApproveAction(item.id)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: '#10B981',
                      color: '#09110A',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDenyAction(item.id)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: '#EF4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      fontWeight: 650,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
