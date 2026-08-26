/**
 * Subway Surfers Bot AI - Main Content Script & Autonomous Decision Loop Engine
 * Integrates Detector, Path Planner, Controller, and UI Manager into high-frequency execution loop.
 */

class BotEngine {
  constructor() {
    this.detector = new window.GameDetector();
    this.planner = new window.PathPlanner();
    this.controller = new window.GameController();
    this.ui = new window.UiManager();

    this.settings = window.BotSettings;
    this.gameCanvas = null;
    this.isRunning = false;
    this.isPaused = false;
    this.status = 'BOT: OFFLINE';

    this.loopTimer = null;
    this.targetPollTimer = null;
  }

  /**
   * Initialize Engine & Listeners
   */
  async init() {
    await this.settings.load();
    this.settings.listenForRemoteChanges();

    this.settings.onChange((updated) => {
      this.handleSettingsUpdate(updated);
    });

    this.handleSettingsUpdate(this.settings.current);

    // Start auto detection of game elements on page load
    this.startAutoDetection();

    // Listen for extension popup / background messages
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        this.handleMessage(request, sendResponse);
        return true;
      });
    }

    console.log('⚡ Subway Surfers Bot AI Engine Initialized.');
  }

  /**
   * Handle incoming runtime messages
   */
  handleMessage(request, sendResponse) {
    switch (request.type) {
      case 'GET_STATUS':
        sendResponse({
          status: this.status,
          isRunning: this.isRunning,
          isPaused: this.isPaused,
          settings: this.settings.current,
          gameDetected: !!this.gameCanvas
        });
        break;

      case 'TOGGLE_BOT':
        if (request.enabled) {
          this.start();
        } else {
          this.stop();
        }
        sendResponse({ success: true, status: this.status });
        break;

      case 'PAUSE_BOT':
        this.pause();
        sendResponse({ success: true, status: this.status });
        break;

      case 'RESUME_BOT':
        this.resume();
        sendResponse({ success: true, status: this.status });
        break;

      case 'AUTO_DETECT':
        const found = this.detectGameElements();
        sendResponse({ success: found, status: this.status });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  /**
   * Handle dynamic setting updates
   */
  handleSettingsUpdate(config) {
    this.controller.configure(config);
    this.planner.configure(config);
    this.ui.setUiMode(config.hideUiMode);

    if (config.enabled && !this.isRunning) {
      this.start();
    } else if (!config.enabled && this.isRunning) {
      this.stop();
    } else if (config.paused && !this.isPaused) {
      this.pause();
    } else if (!config.paused && this.isPaused) {
      this.resume();
    }
  }

  /**
   * Scans DOM for WebGL / 2D Canvas belonging to Subway Surfers / Poki Game
   */
  detectGameElements() {
    this.setStatus('BOT: SEARCHING');

    // 1. Direct Canvas lookup in window
    let canvas = document.querySelector('canvas');

    // 2. Lookup inside iframes if running on main Poki page
    if (!canvas) {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            const innerCanvas = iframeDoc.querySelector('canvas');
            if (innerCanvas) {
              canvas = innerCanvas;
              break;
            }
          }
        } catch (e) {
          // Cross-origin iframe restriction
        }
      }
    }

    if (canvas) {
      this.gameCanvas = canvas;
      this.detector.setCanvas(canvas);
      this.controller.setTarget(canvas);
      this.ui.mountHud(canvas);
      this.setStatus(this.isRunning ? 'BOT: PLAYING' : 'BOT: OFFLINE');
      return true;
    }

    return false;
  }

  /**
   * Periodic game detection polling loop
   */
  startAutoDetection() {
    if (this.targetPollTimer) clearInterval(this.targetPollTimer);

    this.targetPollTimer = setInterval(() => {
      if (!this.gameCanvas || !document.contains(this.gameCanvas)) {
        this.detectGameElements();
      }
    }, 2000);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    if (!this.gameCanvas) {
      this.detectGameElements();
    }

    this.setStatus(this.gameCanvas ? 'BOT: PLAYING' : 'BOT: SEARCHING');
    this.runLoop();
  }

  pause() {
    this.isPaused = true;
    this.setStatus('BOT: PAUSED');
  }

  resume() {
    if (!this.isRunning) {
      this.start();
      return;
    }
    this.isPaused = false;
    this.setStatus('BOT: PLAYING');
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    this.setStatus('BOT: OFFLINE');
    this.ui.render(null, null, {});
  }

  /**
   * Main Autonomous Decision Loop
   * Capture Screen -> Detect Objects -> Predict Movement -> Select Best Action -> Execute Input -> Verify -> Repeat
   */
  runLoop() {
    if (!this.isRunning) return;

    const tickDelay = Math.max(16, 350 - Math.round((this.settings.current.reactionSpeed / 100) * 310));

    if (!this.isPaused && this.gameCanvas) {
      try {
        // 1. Capture Screen & Analyze Frame
        const perception = this.detector.analyze();

        // 2. Predict Movement & Select Best Action
        const decision = this.planner.plan(perception);

        // 3. Execute Control Input
        if (decision.action && decision.action !== 'NONE') {
          this.controller.execute(decision.action);
        }

        // 4. Render HUD Overlay & Debug Vectors
        this.ui.render(perception, decision, {
          debugMode: this.settings.current.debugMode,
          showStats: this.settings.current.showStats
        });

      } catch (err) {
        console.error('SS Bot Loop Error:', err);
        this.setStatus('BOT: ERROR');
      }
    }

    this.loopTimer = setTimeout(() => this.runLoop(), tickDelay);
  }

  setStatus(status) {
    this.status = status;
    // Broadcast status update to extension runtime
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: this.status });
      } catch (e) {
        // Ignore disconnected port errors
      }
    }
  }
}

// Instantiate engine when DOM is ready
if (typeof window !== 'undefined') {
  window.botEngine = new BotEngine();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.botEngine.init());
  } else {
    window.botEngine.init();
  }
}
