'use client';

import React, { useState } from 'react';

interface PromptFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitFeedback: (feedback: string) => void;
  messageSnippet?: string;
}

export function PromptFeedbackModal({
  isOpen,
  onClose,
  onSubmitFeedback,
  messageSnippet,
}: PromptFeedbackModalProps) {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitFeedback(reason.trim() || 'Thumbs down feedback');
    setReason('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(9, 13, 22, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 250,
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
      }}
      onClick={onClose}
      id="feedback-modal-backdrop"
    >
      <div
        style={{
          width: 'min(460px, 100%)',
          backgroundColor: '#0B0F19',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          color: '#F9FAFB',
          padding: '24px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
        id="feedback-modal-content"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
            👎 What went wrong?
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 16px', color: '#9CA3AF', fontSize: '12px', lineHeight: 1.5 }}>
          Your feedback will be logged into ThumbGate RAG memory to prevent similar mistakes in future agent sessions.
        </p>

        {messageSnippet && (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '11px',
              color: '#D1D5DB',
              marginBottom: '16px',
              maxHeight: '80px',
              overflowY: 'auto',
            }}
          >
            &quot;{messageSnippet}&quot;
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What should the agent have done differently? (One sentence)..."
            rows={3}
            style={{
              width: '100%',
              backgroundColor: '#070A10',
              color: '#F9FAFB',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '13px',
              outline: 'none',
              marginBottom: '16px',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                backgroundColor: 'transparent',
                color: '#9CA3AF',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Submit to RAG
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
