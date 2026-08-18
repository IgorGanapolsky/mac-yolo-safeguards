// content-script.js — ThumbGate In-Browser Interdiction & Floating Memory HUD

(function () {
  'use strict';

  const DESTRUCTIVE_KEYWORDS = [
    'delete repository',
    'delete database',
    'destroy',
    'terminate instance',
    'transfer funds',
    'pay now',
    'confirm payment',
    'drop table',
    'force push',
  ];

  /**
   * Checks if a DOM button or submit input has a dangerous action label.
   */
  function isDestructiveElement(el) {
    if (!el) return false;
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').toLowerCase().trim();
    return DESTRUCTIVE_KEYWORDS.some((kw) => text.includes(kw));
  }

  /**
   * Pre-Action Interdiction Listener: Intercepts clicks on destructive buttons.
   */
  document.addEventListener('click', function (event) {
    const target = event.target.closest('button, input[type="submit"], a.btn-danger, [role="button"]');
    if (!target) return;

    if (isDestructiveElement(target) && !target.dataset.thumbgateApproved) {
      event.preventDefault();
      event.stopPropagation();

      const actionText = target.innerText || target.value || 'Destructive Action';
      showInterdictionModal(actionText, () => {
        target.dataset.thumbgateApproved = 'true';
        target.click(); // Re-trigger approved action
      });
    }
  }, true);

  /**
   * Renders the ThumbGate Pre-Action Interdiction Modal.
   */
  function showInterdictionModal(actionName, onApprove) {
    const existing = document.getElementById('thumbgate-interdiction-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'thumbgate-interdiction-modal';
    modal.innerHTML = `
      <div class="tg-modal-backdrop">
        <div class="tg-modal-box">
          <div class="tg-modal-header">
            <span class="tg-modal-icon">🛡️</span>
            <h3>ThumbGate Pre-Action Gate</h3>
          </div>
          <div class="tg-modal-body">
            <p>An action was intercepted by browser safety guardrails:</p>
            <div class="tg-action-pill">⚠️ ${escapeHtml(actionName)}</div>
            <p class="tg-subtext">Are you sure you want to permit this action?</p>
          </div>
          <div class="tg-modal-footer">
            <button id="tg-deny-btn" class="tg-btn tg-btn-cancel">Deny & Block</button>
            <button id="tg-approve-btn" class="tg-btn tg-btn-confirm">Approve & Execute</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('tg-deny-btn').onclick = () => {
      modal.remove();
      recordBlockedAction(actionName);
    };

    document.getElementById('tg-approve-btn').onclick = () => {
      modal.remove();
      onApprove();
    };
  }

  /**
   * Injects the floating ThumbGate Memory HUD on AI chat surfaces (ChatGPT / Claude).
   */
  function injectFloatingMemoryHud() {
    if (document.getElementById('thumbgate-floating-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'thumbgate-floating-hud';
    hud.innerHTML = `
      <div class="tg-hud-pill">
        <span class="tg-hud-logo">🛡️</span>
        <button id="tg-thumbs-up" class="tg-hud-btn" title="Thumbs Up — Reinforce successful pattern">👍</button>
        <button id="tg-thumbs-down" class="tg-hud-btn" title="Thumbs Down — Record mistake into prevention rule">👎</button>
      </div>
    `;

    document.body.appendChild(hud);

    document.getElementById('tg-thumbs-up').onclick = () => {
      showToast('✅ Pattern reinforced into ThumbGate memory');
      incrementMemoryCount();
    };

    document.getElementById('tg-thumbs-down').onclick = () => {
      const why = prompt('What went wrong? (This will become an enforced ThumbGate prevention rule):');
      if (why) {
        showToast('🛡️ Recorded mistake & generated prevention rule');
        incrementMemoryCount();
      }
    };
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'tg-toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function incrementMemoryCount() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['memoriesCount'], (res) => {
        const count = (res.memoriesCount || 0) + 1;
        chrome.storage.local.set({ memoriesCount: count });
      });
    }
  }

  function recordBlockedAction(actionName) {
    showToast('🛑 Action blocked by ThumbGate');
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['blockedCount'], (res) => {
        const count = (res.blockedCount || 0) + 1;
        chrome.storage.local.set({ blockedCount: count });
      });
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m]));
  }

  // Inject floating HUD on chat interfaces
  const host = window.location.hostname;
  if (host.includes('chatgpt.com') || host.includes('claude.ai') || host.includes('github.com')) {
    injectFloatingMemoryHud();
  }
})();
