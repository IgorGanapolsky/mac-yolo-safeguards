// popup.js — ThumbGate Chrome Extension Controller
document.addEventListener('DOMContentLoaded', async () => {
  const blockedCountEl = document.getElementById('blocked-count');
  const memoriesCountEl = document.getElementById('memories-count');
  const interdictionToggle = document.getElementById('interdiction-toggle');
  const budgetStatusEl = document.getElementById('budget-status');
  const budgetFillEl = document.getElementById('budget-fill');
  const budgetSpentEl = document.getElementById('budget-spent');

  // Load state from chrome storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['blockedCount', 'memoriesCount', 'interdictionEnabled', 'monthlySpendUsd'], (res) => {
      blockedCountEl.textContent = res.blockedCount || '0';
      memoriesCountEl.textContent = res.memoriesCount || '0';
      interdictionToggle.checked = res.interdictionEnabled !== false;

      const spent = Number(res.monthlySpendUsd || 1.50);
      const cap = 10.00;
      const pct = Math.min(100, Math.round((spent / cap) * 100));
      budgetFillEl.style.width = `${pct}%`;
      budgetSpentEl.textContent = `$${spent.toFixed(2)} spent`;

      if (spent >= cap * 0.8) {
        budgetStatusEl.textContent = 'YELLOW';
        budgetStatusEl.style.color = '#d29922';
      }
    });

    interdictionToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ interdictionEnabled: e.target.checked });
    });
  }
});
