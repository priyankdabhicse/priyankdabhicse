# ⚡ Subway Surfers Bot AI - Chrome Extension

An autonomous real-time AI agent and path planner extension designed to automatically detect and play **Subway Surfers on Poki** inside Chrome/Chromium browsers.

---

## 🌟 Key Features

* **Autonomous Vision & Detection (`detector.js`)**: Captures game rendering frames, performs perspective 3-lane depth grid scanning, detects obstacles (trains, barriers, lane blocks), tracks player position, and identifies coins/powerups.
* **Smart Real-time Path Planner (`planner.js`)**: Evaluates multi-lane risk matrices, predicts movement several frames ahead, incorporates hysteresis penalties to eliminate rapid jitter, and prioritizes survival over coin collection.
* **Dual Control System (`controller.js`)**: Simulates smooth, rate-limited keyboard (`Arrow Keys`, `WASD`) and touch/swipe (`PointerEvents` / `TouchEvents`) input sequences targeted directly at the game canvas.
* **Poki UI Hider (`ui.js`)**: Features **"Hide Everything Possible"**, **"Game Only"**, and **"Original View"** modes to hide surrounding static advertisements, headers, sidebars, and peripheral clutter without affecting gameplay.
* **Live Visual Debug HUD Overlay**: Renders dynamic perspective corridors, collision bounding circles, planned tactical actions, player lane state, and live FPS metrics directly on top of the game canvas.
* **Clean Extension Popup UI (`popup.html` / `popup.js`)**: Complete control suite featuring `Start Bot`, `Stop Bot`, `Pause`, `Resume`, `Auto Detect Game`, Control Method selector, Reaction Speed slider, Safety Level presets, and Debug toggles.

---

## 📁 Repository Architecture

```text
subway-surfer-bot/
├── manifest.json       # Manifest V3 configuration & permissions
├── background.js       # Background service worker & cross-tab state manager
├── settings.js         # Configuration storage & sync manager
├── controller.js       # Keyboard and Touch/Swipe input dispatch engine
├── detector.js         # Computer vision frame analyzer & perspective scanner
├── planner.js          # Tactical path planner & risk matrix decision engine
├── ui.js               # Poki webpage cleaner & canvas HUD debug overlay
├── content.js          # Main autonomous loop engine & DOM game observer
├── popup.html          # Extension popup UI structure
├── popup.css           # Extension popup modern dark theme styling
├── popup.js            # Popup event controller & extension message relay
├── README.md           # Setup and usage documentation
└── icons/              # Extension icon assets (16x16, 48x48, 128x128)
```

---

## 🚀 How to Install in Chrome / Chromium (Developer Mode)

1. **Download / Clone the Repository**:
   Ensure all extension files are located in a folder (e.g., `subway-surfer-bot`).

2. **Open Chrome Extensions Page**:
   In Google Chrome or any Chromium-based browser (Brave, Edge, Opera), navigate to:
   ```text
   chrome://extensions/
   ```

3. **Enable Developer Mode**:
   Toggle the **Developer mode** switch in the top-right corner of the page.

4. **Load Unpacked Extension**:
   * Click the **"Load unpacked"** button in the top-left corner.
   * Select the root directory containing `manifest.json`.

5. **Pin the Extension**:
   Click the Extension puzzle icon in Chrome's toolbar and pin **Subway Surfers Bot AI** for easy access.

---

## 🎮 How to Use

1. Navigate to the Subway Surfers game on Poki:
   [https://poki.com/en/g/subway-surfers](https://poki.com/en/g/subway-surfers)

2. Open the **Subway Surfers AI** extension popup.

3. Click **"Start Bot"** (or click **"Auto Detect Game"** if the game iframe/canvas is loading).

4. The status badge will transition from `BOT: SEARCHING` to `BOT: PLAYING`.

5. Watch the AI agent automatically change lanes, jump over barriers, roll under obstacles, and navigate the subway tracks!

---

## ⚙️ Configuration & Options

| Option | Options / Range | Description |
| :--- | :--- | :--- |
| **Control Method** | `Auto`, `Keyboard`, `Touch` | Determines whether to dispatch keyboard arrow events or pointer swipe events. |
| **Reaction Speed** | `1% - 100%` | Controls decision tick loop frequency (from 350ms down to 40ms delay). |
| **Safety Level** | `Low`, `Medium`, `High`, `Ultra` | Adjusts obstacle threat multipliers and survival vs coin collecting weighting. |
| **Hide Static Elements** | `Original View`, `Game Only`, `Hide Everything` | Removes non-game static page elements, sidebars, and ads around the game viewport. |
| **Debug Mode** | Toggle `On`/`Off` | Displays real-time perspective lane corridors and obstacle markers on screen. |
| **Show Statistics** | Toggle `On`/`Off` | Displays live FPS, current player lane, and planned action panel. |

---

## 🛡️ Reliability & Safety Directives

* **Graceful Degradation**: Stops safely if the game canvas disappears or if page reloads.
* **No CPU Overload**: Downsamples pixel analysis buffers to keep CPU/RAM usage extremely low without blocking browser UI rendering.
* **Prevent Duplicate Loops**: Enforces single-instance engine state and cleans up execution loops when paused or stopped.
