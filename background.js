/**
 * Subway Surfers Bot AI - Background Service Worker (MV3)
 * Manages extension state, cross-tab messaging, tab navigation events, and side-loading script injection.
 */

// Initialize default storage settings on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('⚡ Subway Surfers Bot AI Extension Installed.');
  chrome.storage.local.get(['ss_bot_settings'], (result) => {
    if (!result || !result.ss_bot_settings) {
      chrome.storage.local.set({
        ss_bot_settings: {
          enabled: false,
          paused: false,
          controlMethod: 'auto',
          reactionSpeed: 85,
          safetyLevel: 'high',
          debugMode: true,
          hideUiMode: 'original',
          showStats: true,
          keyboardPreset: 'arrows',
          autoDetect: true
        }
      });
    }
  });
});

// Relays messages between popup, content scripts, and background worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'PONG' });
    return true;
  }

  // Relay status updates across extension contexts
  if (message.type === 'STATUS_UPDATE') {
    chrome.action.setBadgeText({
      text: message.status.includes('PLAYING') ? 'ON' : message.status.includes('PAUSED') ? 'PAUSE' : ''
    });
    chrome.action.setBadgeBackgroundColor({
      color: message.status.includes('PLAYING') ? '#00E676' : '#FF9800'
    });
  }

  return false;
});
