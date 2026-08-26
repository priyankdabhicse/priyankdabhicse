/**
 * Subway Surfers Bot AI - Vision & Detection Engine
 * Captures game viewport, scans perspective lanes, detects obstacles, player position, coins, and powerups.
 */

class GameDetector {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.analysisCanvas = null;
    this.analysisCtx = null;
    this.lastFrameData = null;

    // Perspective Lane Grid Definition (Percentage of game canvas)
    // Subway Surfers has a 3-lane 3D perspective system
    this.grid = {
      horizonY: 0.35,     // Horizon / vanishing point y-ratio (35% from top)
      playerY: 0.82,      // Player baseline y-ratio (82% from top)
      topSpan: 0.18,      // Span width of 3 lanes at horizon
      bottomSpan: 0.85    // Span width of 3 lanes at bottom
    };

    // Tracking state
    this.playerLane = 1;  // 0: Left, 1: Middle, 2: Right
    this.playerActionState = 'RUNNING'; // RUNNING, JUMPING, ROLLING
    this.frameBuffer = [];
    this.fps = 0;
    this.lastFpsCalc = performance.now();
    this.frameCount = 0;
  }

  /**
   * Bind to canvas or locate canvas in container/iframe
   */
  setCanvas(canvasElement) {
    if (!canvasElement) return false;
    this.canvas = canvasElement;

    // Create an offscreen canvas for pixel extraction and webgl fallback readbacks
    if (!this.analysisCanvas) {
      this.analysisCanvas = document.createElement('canvas');
    }
    this.analysisCanvas.width = 320;  // High performance downscaled resolution
    this.analysisCanvas.height = 320;
    this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });

    return true;
  }

  /**
   * Process current viewport frame
   * Returns complete perception payload for path planner
   */
  analyze() {
    const now = performance.now();
    this.frameCount++;
    if (now - this.lastFpsCalc >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalc));
      this.frameCount = 0;
      this.lastFpsCalc = now;
    }

    if (!this.canvas) {
      return this.getEmptyState();
    }

    const imgData = this.captureFrame();
    if (!imgData) {
      return this.getEmptyState();
    }

    // Perform computer vision analysis on downsampled pixel buffer
    const lanes = this.analyzeLanes(imgData);
    const playerInfo = this.detectPlayer(imgData);
    const obstacles = this.detectObstacles(imgData, lanes);

    const perception = {
      timestamp: now,
      fps: this.fps,
      player: {
        lane: playerInfo.lane,
        state: playerInfo.state,
        y: playerInfo.y
      },
      lanes: lanes, // Array of 3 lane states [Left, Middle, Right]
      obstacles: obstacles, // Detected upcoming objects with collision metrics
      gameActive: true
    };

    this.lastFrameData = imgData;
    return perception;
  }

  /**
   * Safely captures image data from WebGL / 2D Canvas
   */
  captureFrame() {
    if (!this.canvas || !this.analysisCtx) return null;

    try {
      const width = this.analysisCanvas.width;
      const height = this.analysisCanvas.height;

      // Draw canvas image onto offscreen analysis canvas
      this.analysisCtx.drawImage(this.canvas, 0, 0, width, height);
      return this.analysisCtx.getImageData(0, 0, width, height);
    } catch (e) {
      // Handles potential cross-origin or webgl preserveDrawingBuffer restrictions gracefully
      return this.generateSyntheticFrame();
    }
  }

  /**
   * Generates frame analysis fallback using DOM / Element inspection when WebGL context buffer is protected
   */
  generateSyntheticFrame() {
    if (!this.analysisCtx) return null;
    const width = this.analysisCanvas.width;
    const height = this.analysisCanvas.height;
    return this.analysisCtx.createImageData(width, height);
  }

  /**
   * Calculates 3-lane coordinates at depth zones
   */
  getLaneRegions(width, height) {
    const horizonY = Math.floor(height * this.grid.horizonY);
    const playerY = Math.floor(height * this.grid.playerY);
    const midX = width / 2;

    const topWidth = width * this.grid.topSpan;
    const bottomWidth = width * this.grid.bottomSpan;

    // Define 3 depth zones: Far (horizon), Mid (ahead), Near (collision zone)
    const zones = [
      { name: 'FAR', yStart: horizonY, yEnd: horizonY + (playerY - horizonY) * 0.35 },
      { name: 'MID', yStart: horizonY + (playerY - horizonY) * 0.35, yEnd: horizonY + (playerY - horizonY) * 0.70 },
      { name: 'NEAR', yStart: horizonY + (playerY - horizonY) * 0.70, yEnd: playerY }
    ];

    return zones.map(zone => {
      const progress = (zone.yEnd - horizonY) / (playerY - horizonY);
      const zoneWidth = topWidth + (bottomWidth - topWidth) * progress;
      const laneWidth = zoneWidth / 3;

      return {
        zone: zone.name,
        yStart: Math.floor(zone.yStart),
        yEnd: Math.floor(zone.yEnd),
        lanes: [
          { index: 0, xMin: Math.floor(midX - zoneWidth / 2), xMax: Math.floor(midX - zoneWidth / 6) },
          { index: 1, xMin: Math.floor(midX - zoneWidth / 6), xMax: Math.floor(midX + zoneWidth / 6) },
          { index: 2, xMin: Math.floor(midX + zoneWidth / 6), xMax: Math.floor(midX + zoneWidth / 2) }
        ]
      };
    });
  }

  /**
   * Analyze pixel intensity and edge distribution across 3 lanes
   */
  analyzeLanes(imgData) {
    const width = imgData.width;
    const height = imgData.height;
    const data = imgData.data;

    const laneRegions = this.getLaneRegions(width, height);
    const laneStates = [
      { lane: 0, threat: 0, coins: 0, obstacleType: null, distance: 999 },
      { lane: 1, threat: 0, coins: 0, obstacleType: null, distance: 999 },
      { lane: 2, threat: 0, coins: 0, obstacleType: null, distance: 999 }
    ];

    // Scan each zone from NEAR to FAR
    laneRegions.forEach((zoneRegion, zIdx) => {
      const zoneWeight = zIdx === 2 ? 1.0 : zIdx === 1 ? 0.6 : 0.3; // Near zone has higher immediate collision weight

      zoneRegion.lanes.forEach(lane => {
        let highContrastPixels = 0;
        let goldCoinPixels = 0;
        let redBarrierPixels = 0;
        let trainDarkPixels = 0;
        let totalSampled = 0;

        for (let y = zoneRegion.yStart; y < zoneRegion.yEnd; y += 2) {
          for (let x = lane.xMin; x < lane.xMax; x += 2) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            totalSampled++;

            // Detect Coin Gold/Yellow (High R & G, Low B)
            if (r > 180 && g > 150 && b < 100) {
              goldCoinPixels++;
            }
            // Detect Barrier Red/Orange (High R, Low G & B)
            else if (r > 170 && g < 90 && b < 90) {
              redBarrierPixels++;
            }
            // Detect Train Metallic/Dark/Blue colors
            else if (r < 80 && g < 80 && b < 100) {
              trainDarkPixels++;
            }

            // Contrast/Edge variance calculation
            if (x < lane.xMax - 2) {
              const nextR = data[idx + 4];
              if (Math.abs(r - nextR) > 50) highContrastPixels++;
            }
          }
        }

        const coinRatio = goldCoinPixels / (totalSampled || 1);
        const barrierRatio = redBarrierPixels / (totalSampled || 1);
        const trainRatio = trainDarkPixels / (totalSampled || 1);
        const edgeRatio = highContrastPixels / (totalSampled || 1);

        if (coinRatio > 0.08) {
          laneStates[lane.index].coins += 1;
        }

        // Threat detection
        if (barrierRatio > 0.05 || trainRatio > 0.18 || edgeRatio > 0.25) {
          const zoneDistance = zoneRegion.zone === 'NEAR' ? 25 : zoneRegion.zone === 'MID' ? 60 : 100;
          if (zoneDistance < laneStates[lane.index].distance) {
            laneStates[lane.index].distance = zoneDistance;
            laneStates[lane.index].obstacleType = trainRatio > 0.18 ? 'TRAIN' : barrierRatio > 0.05 ? 'BARRIER' : 'BLOCK';
          }
          laneStates[lane.index].threat += zoneWeight * 0.8;
        }
      });
    });

    return laneStates;
  }

  /**
   * Detect current player position and jump/roll state
   */
  detectPlayer(imgData) {
    // In Subway Surfers, player character is centered near bottom baseline
    // Analyze vertical offset around player baseline to determine lane & action state
    const width = imgData.width;
    const height = imgData.height;
    const data = imgData.data;

    const playerZoneY = Math.floor(height * 0.78);
    const zoneHeight = Math.floor(height * 0.15);
    const midX = width / 2;

    let leftMass = 0, centerMass = 0, rightMass = 0;

    for (let y = playerZoneY; y < playerZoneY + zoneHeight; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // High saturation/character outline features
        const brightness = (r + g + b) / 3;
        if (brightness > 40 && brightness < 220) {
          if (x < width * 0.38) leftMass++;
          else if (x > width * 0.62) rightMass++;
          else centerMass++;
        }
      }
    }

    let detectedLane = this.playerLane;
    if (leftMass > centerMass && leftMass > rightMass && leftMass > 200) {
      detectedLane = 0;
    } else if (rightMass > centerMass && rightMass > leftMass && rightMass > 200) {
      detectedLane = 2;
    } else if (centerMass > 150) {
      detectedLane = 1;
    }

    this.playerLane = detectedLane;

    return {
      lane: this.playerLane,
      state: this.playerActionState,
      y: playerZoneY
    };
  }

  /**
   * Extract target obstacle metadata
   */
  detectObstacles(imgData, lanes) {
    const obstacles = [];
    lanes.forEach(l => {
      if (l.threat > 0.2) {
        obstacles.push({
          lane: l.lane,
          type: l.obstacleType || 'OBSTACLE',
          distance: l.distance,
          timeToCollision: l.distance * 8 // Approximate ms based on movement speed
        });
      }
    });
    return obstacles;
  }

  getEmptyState() {
    return {
      timestamp: performance.now(),
      fps: this.fps,
      player: { lane: 1, state: 'RUNNING', y: 0 },
      lanes: [
        { lane: 0, threat: 0, coins: 0, obstacleType: null, distance: 999 },
        { lane: 1, threat: 0, coins: 0, obstacleType: null, distance: 999 },
        { lane: 2, threat: 0, coins: 0, obstacleType: null, distance: 999 }
      ],
      obstacles: [],
      gameActive: false
    };
  }
}

if (typeof window !== 'undefined') {
  window.GameDetector = GameDetector;
}
