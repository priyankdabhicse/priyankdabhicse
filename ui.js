/**
 * Subway Surfers Bot AI - UI Hider and Debug HUD System
 * Hides static webpage elements surrounding game on Poki and renders transparent live visual overlay.
 */

class UiManager {
  constructor() {
    this.hudElement = null;
    this.hudCanvas = null;
    this.hudCtx = null;
    this.currentUiMode = 'original'; // 'original', 'gameOnly', 'hideEverything'
    this.showStats = true;
    this.debugMode = true;
    this.styleTag = null;
  }

  /**
   * Apply UI Hider modes to remove static Poki elements, ads, headers, sidebars
   */
  setUiMode(mode) {
    this.currentUiMode = mode || 'original';
    this.ensureStyleTag();

    if (this.currentUiMode === 'original') {
      this.styleTag.textContent = '';
      return;
    }

    // CSS rules targeting Poki static non-game elements
    let css = `
      /* Common Poki peripheral elements, ads, sidebars, headers */
      header, footer, nav, .sidebar, .ad-container, .poki-sdk-container,
      [class*="ad"], [id*="ad"], [class*="banner"], [class*="sidebar"],
      .game-title, .game-description, .comments-section, .recommended-games,
      #game-details, .poki-header, .social-share {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    if (this.currentUiMode === 'gameOnly' || this.currentUiMode === 'hideEverything') {
      css += `
        body, html {
          background-color: #0d0e15 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        /* Stretch game container & canvas to fill screen cleanly */
        #game-container, #game-holder, iframe[src*="poki"], canvas {
          max-width: 100vw !important;
          max-height: 100vh !important;
          margin: 0 auto !important;
        }
      `;
    }

    if (this.currentUiMode === 'hideEverything') {
      css += `
        body > *:not(#game-container):not(#game-holder):not(iframe):not(canvas):not(#ss-bot-hud-root) {
          opacity: 0.05 !important;
          pointer-events: none !important;
        }
      `;
    }

    this.styleTag.textContent = css;
  }

  ensureStyleTag() {
    if (!this.styleTag) {
      this.styleTag = document.createElement('style');
      this.styleTag.id = 'ss-bot-ui-hider-styles';
      (document.head || document.documentElement).appendChild(this.styleTag);
    }
  }

  /**
   * Mount or update transparent HUD overlay on game canvas
   */
  mountHud(gameCanvas) {
    if (!gameCanvas) return;

    if (!this.hudElement) {
      this.hudElement = document.createElement('div');
      this.hudElement.id = 'ss-bot-hud-root';
      this.hudElement.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483647;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      `;

      this.hudCanvas = document.createElement('canvas');
      this.hudCanvas.style.cssText = `
        width: 100%;
        height: 100%;
        display: block;
      `;
      this.hudElement.appendChild(this.hudCanvas);

      // Attach overlay relative to canvas container
      const parent = gameCanvas.parentElement || document.body;
      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(this.hudElement);
      this.hudCtx = this.hudCanvas.getContext('2d');
    }

    // Sync HUD size with game canvas rect
    const rect = gameCanvas.getBoundingClientRect();
    if (this.hudCanvas.width !== rect.width || this.hudCanvas.height !== rect.height) {
      this.hudCanvas.width = rect.width;
      this.hudCanvas.height = rect.height;
    }
  }

  /**
   * Render real-time vision vectors, detected lanes, obstacle bounding markers & HUD stats
   */
  render(perception, decision, config = {}) {
    this.debugMode = config.debugMode ?? true;
    this.showStats = config.showStats ?? true;

    if (!this.hudCtx || !this.hudCanvas) return;

    const ctx = this.hudCtx;
    const w = this.hudCanvas.width;
    const h = this.hudCanvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!perception || !this.debugMode) {
      return;
    }

    // 1. Draw Perspective Lane Trajectories
    const midX = w / 2;
    const horizonY = h * 0.35;
    const bottomY = h * 0.85;
    const topW = w * 0.18;
    const botW = w * 0.85;

    ctx.strokeStyle = 'rgba(0, 230, 118, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);

    // Outer and Inner Lane Boundary Lines
    [-0.5, -0.166, 0.166, 0.5].forEach(ratio => {
      const xTop = midX + topW * ratio;
      const xBot = midX + botW * ratio;
      ctx.beginPath();
      ctx.moveTo(xTop, horizonY);
      ctx.lineTo(xBot, bottomY);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 2. Highlight Target Lane and Current Player Position
    const targetLane = decision ? decision.targetLane : 1;
    const laneRatios = [-0.33, 0, 0.33];
    const targetX = midX + botW * laneRatios[targetLane];

    // Target Lane Corridor Highlight
    ctx.fillStyle = 'rgba(0, 230, 118, 0.12)';
    const laneW = botW / 3;
    ctx.fillRect(targetX - laneW / 2, horizonY, laneW, bottomY - horizonY);

    // 3. Render Obstacle Markers
    if (perception.lanes) {
      perception.lanes.forEach(l => {
        if (l.threat > 0.2) {
          const lX = midX + botW * laneRatios[l.lane];
          const distY = horizonY + (bottomY - horizonY) * (1 - Math.min(100, l.distance) / 100);

          ctx.fillStyle = 'rgba(255, 23, 68, 0.6)';
          ctx.strokeStyle = '#FF1744';
          ctx.lineWidth = 3;

          ctx.beginPath();
          ctx.arc(lX, distY, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(l.obstacleType || 'DANGER', lX, distY + 4);
        }
      });
    }

    // 4. Statistics Panel Overlay
    if (this.showStats) {
      this.renderStatsPanel(ctx, perception, decision, w, h);
    }
  }

  renderStatsPanel(ctx, perception, decision, w, h) {
    const boxW = 210;
    const boxH = 135;
    const margin = 12;

    ctx.fillStyle = 'rgba(15, 18, 28, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.roundRect ? ctx.roundRect(margin, margin, boxW, boxH, 8) : ctx.fillRect(margin, margin, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FF5722';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⚡ SUBWAY SURFERS BOT AI', margin + 12, margin + 22);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '11px sans-serif';

    ctx.fillText(`FPS: ${perception.fps || 0}`, margin + 12, margin + 42);
    ctx.fillText(`Player Lane: ${['LEFT', 'MIDDLE', 'RIGHT'][perception.player?.lane ?? 1]}`, margin + 12, margin + 58);

    ctx.fillStyle = decision?.action && decision.action !== 'NONE' ? '#00E676' : '#B0BEC5';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`Planned Action: ${decision?.action || 'NONE'}`, margin + 12, margin + 76);

    ctx.fillStyle = '#B0BEC5';
    ctx.font = '10px sans-serif';
    const reasonStr = decision?.reason || 'Monitoring gameplay';
    ctx.fillText(reasonStr.length > 28 ? reasonStr.substring(0, 26) + '..' : reasonStr, margin + 12, margin + 94);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`UI Mode: ${this.currentUiMode}`, margin + 12, margin + 115);
  }

  destroy() {
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
      this.hudElement = null;
    }
    if (this.styleTag && this.styleTag.parentNode) {
      this.styleTag.parentNode.removeChild(this.styleTag);
      this.styleTag = null;
    }
  }
}

if (typeof window !== 'undefined') {
  window.UiManager = UiManager;
}
