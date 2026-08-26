/**
 * Subway Surfers Bot AI - Controller System
 * Simulates keyboard and touch/swipe inputs targeted directly at the game viewport/canvas.
 */

class GameController {
  constructor() {
    this.targetElement = null;
    this.activeMethod = 'auto'; // 'auto', 'keyboard', 'touch'
    this.lastActionTime = 0;
    this.actionCooldownMs = 120; // Default cooldown between actions
    this.keyMap = {
      LEFT: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, wasd: 'a', wasdCode: 'KeyA' },
      RIGHT: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, wasd: 'd', wasdCode: 'KeyD' },
      JUMP: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, wasd: 'w', wasdCode: 'KeyW' },
      ROLL: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, wasd: 's', wasdCode: 'KeyS' }
    };
  }

  /**
   * Bind controller to a target element (canvas, iframe window, or container)
   */
  setTarget(element) {
    this.targetElement = element;
    if (this.targetElement) {
      // Ensure target element is focusable if it's an HTML element
      if (typeof this.targetElement.focus === 'function') {
        try {
          this.targetElement.focus();
        } catch (e) {
          // Ignore focus errors
        }
      }
    }
  }

  /**
   * Configure control parameters
   */
  configure(options = {}) {
    if (options.controlMethod) {
      this.activeMethod = options.controlMethod;
    }
    if (options.reactionSpeed) {
      // Map speed slider 1-100 to cooldown ms (e.g., 100 -> 60ms delay, 1 -> 350ms delay)
      const speed = Math.max(1, Math.min(100, options.reactionSpeed));
      this.actionCooldownMs = Math.round(350 - (speed / 100) * 290);
    }
  }

  /**
   * Execute an action: 'LEFT', 'RIGHT', 'JUMP', 'ROLL', or 'NONE'
   */
  execute(action) {
    if (!action || action === 'NONE' || action === 'NO_ACTION') {
      return false;
    }

    const now = performance.now();
    if (now - this.lastActionTime < this.actionCooldownMs) {
      return false; // Rate limited to prevent input cluttering
    }

    this.lastActionTime = now;
    const target = this.targetElement || document.activeElement || document.body;

    // Dispatch click/focus to ensure canvas has focus
    if (target !== document.activeElement && typeof target.focus === 'function') {
      try {
        target.focus();
      } catch (e) {}
    }

    const methodToUse = this.determineMethod(target);

    if (methodToUse === 'touch') {
      this.sendTouchSwipe(action, target);
    } else {
      this.sendKeyboardInput(action, target);
    }

    return true;
  }

  /**
   * Determine control method if set to auto
   */
  determineMethod(target) {
    if (this.activeMethod !== 'auto') {
      return this.activeMethod;
    }
    // Auto detection: Check if touch events are supported on target or window
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    // Prefer keyboard as default for desktop browser games unless touch is specified
    return 'keyboard';
  }

  /**
   * Dispatch keyboard event sequence (keydown -> keyup)
   */
  sendKeyboardInput(action, target) {
    const config = this.keyMap[action];
    if (!config) return;

    const targetDoc = target.ownerDocument || document;
    const targetWin = targetDoc.defaultView || window;

    const eventInit = {
      key: config.key,
      code: config.code,
      keyCode: config.keyCode,
      which: config.keyCode,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: targetWin
    };

    const keyDownEvent = new KeyboardEvent('keydown', eventInit);
    const keyUpEvent = new KeyboardEvent('keyup', eventInit);

    // Dispatch to target, document, and window for maximum game engine compatibility
    target.dispatchEvent(keyDownEvent);
    targetDoc.dispatchEvent(keyDownEvent);

    setTimeout(() => {
      target.dispatchEvent(keyUpEvent);
      targetDoc.dispatchEvent(keyUpEvent);
    }, 60);
  }

  /**
   * Dispatch touch / pointer swipe sequence
   */
  sendTouchSwipe(action, target) {
    const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const swipeDistance = Math.min(rect.width, rect.height) * 0.25 || 100;

    let endX = centerX;
    let endY = centerY;

    switch (action) {
      case 'LEFT': endX = centerX - swipeDistance; break;
      case 'RIGHT': endX = centerX + swipeDistance; break;
      case 'JUMP': endY = centerY - swipeDistance; break;
      case 'ROLL': endY = centerY + swipeDistance; break;
    }

    // Pointer events simulate modern touch/drag controls in Unity/WebGL games
    this.dispatchPointerSequence(target, centerX, centerY, endX, endY);
    // Touch events for mobile/responsive canvas listeners
    this.dispatchTouchSequence(target, centerX, centerY, endX, endY);
  }

  /**
   * Dispatch PointerEvent swipe sequence
   */
  dispatchPointerSequence(target, startX, startY, endX, endY) {
    const win = target.ownerDocument?.defaultView || window;
    const id = 1;

    const createPointerEvent = (type, x, y, buttons) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: id,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      pageX: x,
      pageY: y,
      button: buttons ? 0 : -1,
      buttons: buttons,
      view: win
    });

    target.dispatchEvent(createPointerEvent('pointerdown', startX, startY, 1));
    target.dispatchEvent(createPointerEvent('pointermove', (startX + endX) / 2, (startY + endY) / 2, 1));
    target.dispatchEvent(createPointerEvent('pointermove', endX, endY, 1));

    setTimeout(() => {
      target.dispatchEvent(createPointerEvent('pointerup', endX, endY, 0));
    }, 50);
  }

  /**
   * Dispatch TouchEvent swipe sequence
   */
  dispatchTouchSequence(target, startX, startY, endX, endY) {
    if (typeof Touch === 'undefined' || typeof TouchEvent === 'undefined') return;

    try {
      const win = target.ownerDocument?.defaultView || window;
      const createTouch = (x, y) => new Touch({
        identifier: Date.now(),
        target: target,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pageX: x,
        pageY: y
      });

      const touchStart = createTouch(startX, startY);
      const touchEnd = createTouch(endX, endY);

      target.dispatchEvent(new TouchEvent('touchstart', {
        cancelable: true,
        bubbles: true,
        touches: [touchStart],
        targetTouches: [touchStart],
        changedTouches: [touchStart],
        view: win
      }));

      setTimeout(() => {
        target.dispatchEvent(new TouchEvent('touchend', {
          cancelable: true,
          bubbles: true,
          touches: [],
          targetTouches: [],
          changedTouches: [touchEnd],
          view: win
        }));
      }, 50);
    } catch (e) {
      // Touch constructor may fail in strict environments
    }
  }
}

if (typeof window !== 'undefined') {
  window.GameController = GameController;
}
