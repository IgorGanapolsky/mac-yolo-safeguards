'use client';

import React from 'react';

export interface ComputerProfile {
  id: string;
  name: string;
  url: string;
  transport: 'lan' | 'tailscale' | 'vps' | 'usb';
  isOnline: boolean;
  pingMs?: number;
}

interface ComputerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  computers: ComputerProfile[];
  activeComputerId: string | null;
  onSelectComputer: (id: string) => void;
}

export function ComputerPickerModal({
  isOpen,
  onClose,
  computers,
  activeComputerId,
  onSelectComputer,
}: ComputerPickerModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(9, 13, 22, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 200,
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
      }}
      onClick={onClose}
      id="computer-picker-modal-backdrop"
    >
      <div
        style={{
          width: 'min(500px, 100%)',
          backgroundColor: '#0B0F19',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          color: '#F9FAFB',
          padding: '24px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
        id="computer-picker-modal-content"
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              🖥️ Select Target Computer
            </h2>
            <p style={{ margin: '4px 0 0', color: '#9CA3AF', fontSize: '12px' }}>
              Choose a Mac or VPS runner for your remote task execution
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Computer Catalog List */}
        <div style={{ display: 'grid', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
          {computers.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
              No computers paired yet. Start Hermes Gateway on your Mac to pair.
            </div>
          ) : (
            computers.map((comp) => {
              const isSelected = comp.id === activeComputerId;

              return (
                <div
                  key={comp.id}
                  onClick={() => {
                    onSelectComputer(comp.id);
                    onClose();
                  }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    backgroundColor: isSelected ? 'rgba(34, 211, 238, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected ? '1px solid #22D3EE' : '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                  className={`computer-card ${isSelected ? 'selected' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: comp.isOnline ? '#10B981' : '#6B7280',
                        boxShadow: comp.isOnline ? '0 0 8px #10B981' : 'none',
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 650, fontSize: '14px', color: isSelected ? '#22D3EE' : '#F9FAFB' }}>
                        {comp.name}
                      </div>
                      <code style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'ui-monospace, monospace' }}>
                        {comp.url}
                      </code>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        backgroundColor:
                          comp.transport === 'lan'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : comp.transport === 'tailscale'
                            ? 'rgba(79, 70, 229, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                        color:
                          comp.transport === 'lan'
                            ? '#10B981'
                            : comp.transport === 'tailscale'
                            ? '#818CF8'
                            : '#F59E0B',
                      }}
                    >
                      {comp.transport}
                    </span>
                    {isSelected && (
                      <span style={{ color: '#22D3EE', fontWeight: 700, fontSize: '14px' }}>✓</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
