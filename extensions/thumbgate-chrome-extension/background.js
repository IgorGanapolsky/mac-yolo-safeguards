// background.js — ThumbGate Service Worker & Telemetry Synchronizer

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ThumbGate] Extension installed successfully.');
  chrome.storage.local.set({
    interdictionEnabled: true,
    blockedCount: 0,
    memoriesCount: 0,
    monthlySpendUsd: 1.50,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ACTION_INTERCEPTED') {
    chrome.storage.local.get(['blockedCount'], (res) => {
      const count = (res.blockedCount || 0) + 1;
      chrome.storage.local.set({ blockedCount: count });
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: '#da3633' });
    });
    sendResponse({ status: 'ACK' });
  }
  return true;
});
