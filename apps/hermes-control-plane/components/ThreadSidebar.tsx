'use client';

import React, { useState } from 'react';

export interface WebThreadSession {
  id: string;
  title: string;
  updatedAt: string;
  messageCount?: number;
}

interface ThreadSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: WebThreadSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
  onClearAllSessions: () => void;
}

export function ThreadSidebar({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
  onClearAllSessions,
}: ThreadSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  if (!isOpen) return null;

  const handleStartRename = (session: WebThreadSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '300px',
        backgroundColor: '#0B0F19',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '8px 0 32px rgba(0,0,0,0.6)',
        color: '#F9FAFB',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
      id="web-thread-sidebar"
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '20px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(180deg, rgba(79, 70, 229, 0.08), transparent)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.02em' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/thumbgate-mark-inline-v3.svg" alt="ThumbGate" style={{ width: '22px', height: '22px' }} />
          <span>Chat Threads</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#9CA3AF',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px 8px',
            borderRadius: '6px',
          }}
          aria-label="Close sidebar"
        >
          ✕
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '14px 16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={onNewChat}
          style={{
            flex: 1,
            padding: '10px 14px',
            background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
            color: '#F9FAFB',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 650,
            cursor: 'pointer',
            fontSize: '13px',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
          }}
          id="btn-new-chat-web"
        >
          + New Chat
        </button>
        {sessions.length > 0 && (
          <button
            onClick={onClearAllSessions}
            style={{
              padding: '10px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Clear all threads"
          >
            Clear
          </button>
        )}
      </div>

      {/* Recents session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {sessions.length === 0 ? (
          <div style={{ padding: '32px 16px', color: '#9CA3AF', fontSize: '13px', textAlign: 'center' }}>
            No recent threads
          </div>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            const isEditing = s.id === editingId;

            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                style={{
                  padding: '10px 12px',
                  marginBottom: '6px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? 'rgba(34, 211, 238, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: isActive ? '1px solid rgba(34, 211, 238, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: isActive ? '#22D3EE' : '#F9FAFB',
                  transition: 'all 0.15s ease',
                }}
                className={`thread-item ${isActive ? 'active' : ''}`}
              >
                {isEditing ? (
                  <form onSubmit={(e) => handleSaveRename(s.id, e)} style={{ flex: 1, display: 'flex' }}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      autoFocus
                      onBlur={(e) => handleSaveRename(s.id, e)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0B0F19',
                        color: '#F9FAFB',
                        border: '1px solid #22D3EE',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </form>
                ) : (
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    <span style={{ fontWeight: isActive ? 600 : 400 }}>{s.title || 'Untitled thread'}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', opacity: isActive ? 1 : 0.6 }}>
                  <button
                    onClick={(e) => handleStartRename(s, e)}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '13px' }}
                    title="Rename thread"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '13px' }}
                    title="Delete thread"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
