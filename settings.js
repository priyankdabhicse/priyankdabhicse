/**
 * Subway Surfers Bot AI - Settings Module
 * Manages configuration state, default settings, and storage sync across popup & content scripts.
 */

const DEFAULT_SETTINGS = {
  enabled: false,           // Master bot switch
  paused: false,            // Pause state
  controlMethod: 'auto',    // 'auto', 'keyboard', 'touch'
  reactionSpeed: 85,        // 1 - 100 (determines decision tick delay: e.g. 100ms to 20ms)
  safetyLevel: 'high',      // 'low', 'medium', 'high', 'ultra'
  debugMode: true,         // Render HUD, debug vectors & bounding boxes on screen
  hideUiMode: 'original',   // 'original', 'gameOnly', 'hideEverything'
  showStats: true,          // Display FPS, decision latency, score stats overlay
  keyboardPreset: 'arrows', // 'arrows' or 'wasd'
  autoDetect: true          // Automatically search for game iframe/canvas
};

class SettingsManager {
  constructor() {
    this.current = { ...DEFAULT_SETTINGS };
    this.listeners = [];
  }

  /**
   * Load settings from chrome.storage.local with fallbacks
   */
  async load() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['ss_bot_settings'], (result) => {
          if (result && result.ss_bot_settings) {
            this.current = { ...DEFAULT_SETTINGS, ...result.ss_bot_settings };
          }
          resolve(this.current);
        });
      } else {
        // Fallback for non-extension environment or standalone testing
        try {
          const stored = localStorage.getItem('ss_bot_settings');
          if (stored) {
            this.current = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
          }
        } catch (e) {
          console.warn('LocalStorage fallback failed:', e);
        }
        resolve(this.current);
      }
    });
  }

  /**
   * Save partial or full settings updates
   */
  async save(newSettings) {
    this.current = { ...this.current, ...newSettings };
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ ss_bot_settings: this.current }, () => {
          this.notifyListeners();
          resolve(this.current);
        });
      } else {
        try {
          localStorage.setItem('ss_bot_settings', JSON.stringify(this.current));
        } catch (e) {
          console.warn('LocalStorage write failed:', e);
        }
        this.notifyListeners();
        resolve(this.current);
      }
    });
  }

  /**
   * Subscribe to settings changes
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.current);
      } catch (err) {
        console.error('Error in settings listener:', err);
      }
    }
  }

  /**
   * Listen to storage events from other context pages (e.g., Popup -> Content script)
   */
  listenForRemoteChanges() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.ss_bot_settings) {
          this.current = { ...DEFAULT_SETTINGS, ...changes.ss_bot_settings.newValue };
          this.notifyListeners();
        }
      });
    }
  }
}

// Global instance export
if (typeof window !== 'undefined') {
  window.BotSettings = new SettingsManager();
}
