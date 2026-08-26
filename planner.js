/**
 * Subway Surfers Bot AI - Smart Path Planner
 * Evaluates lane risk matrices, obstacle time-to-collision, multi-frame predictions,
 * survival vs coin weighting, and generates optimal tactical actions.
 */

class PathPlanner {
  constructor() {
    this.safetyLevel = 'high';   // 'low', 'medium', 'high', 'ultra'
    this.lastChosenLane = 1;     // 0: Left, 1: Middle, 2: Right
    this.lastAction = 'NONE';
    this.lastActionTime = 0;
    this.laneChangeHysteresisCost = 0.15; // Penalty to prevent rapid jittering back and forth
  }

  /**
   * Update planner configurations
   */
  configure(options = {}) {
    if (options.safetyLevel) {
      this.safetyLevel = options.safetyLevel;
    }
  }

  /**
   * Main Decision Engine
   * Accepts perception state from detector and returns tactical action decision
   * Returns: { action: 'LEFT'|'RIGHT'|'JUMP'|'ROLL'|'NONE', targetLane: 0|1|2, reason: string }
   */
  plan(perception) {
    if (!perception || !perception.gameActive) {
      return { action: 'NONE', targetLane: 1, reason: 'Game inactive' };
    }

    const player = perception.player;
    const currentLane = player.lane;
    const lanes = perception.lanes || [];

    // Calculate Safety Margin Multipliers based on safetyLevel
    const safetyMultiplier = this.getSafetyMultiplier();

    // 1. Evaluate Risk Score for each lane (0: Left, 1: Middle, 2: Right)
    const laneScores = [0, 1, 2].map(laneIdx => {
      const laneData = lanes.find(l => l.lane === laneIdx) || { threat: 0, coins: 0, distance: 999 };

      let threatScore = laneData.threat * safetyMultiplier;
      let coinScore = laneData.coins * 0.1; // Coins add small positive incentive

      // In survival mode / high safety, prefer survival over collecting coins when two conflict
      if (this.safetyLevel === 'high' || this.safetyLevel === 'ultra') {
        coinScore *= 0.2; // Severely downweight coins if any threat exists
      }

      // Hysteresis cost: slightly penalize switching away from current lane if current lane is safe
      const costToSwitch = (laneIdx !== currentLane) ? this.laneChangeHysteresisCost : 0;

      // Distance penalty: lower distance means higher immediate danger
      let distancePenalty = 0;
      if (laneData.distance < 40) {
        distancePenalty = (40 - laneData.distance) / 10;
      }

      const totalRisk = threatScore + distancePenalty + costToSwitch - coinScore;
      return {
        lane: laneIdx,
        risk: totalRisk,
        threat: laneData.threat,
        obstacleType: laneData.obstacleType,
        distance: laneData.distance,
        coins: laneData.coins
      };
    });

    // 2. Select Safe Target Lane with Lowest Risk
    laneScores.sort((a, b) => a.risk - b.risk);
    const bestLaneObj = laneScores[0];
    const currentLaneObj = laneScores.find(l => l.lane === currentLane) || { threat: 0, distance: 999 };

    // 3. Determine Tactical Action required
    let action = 'NONE';
    let reason = 'Current lane is safe';

    // Immediate collision response in current lane
    if (currentLaneObj.threat > 0.35 || currentLaneObj.distance < 35) {
      // Current lane has immediate obstacle! Check if we should dodge or vertical-dodge (Jump/Roll)
      if (currentLaneObj.obstacleType === 'BARRIER' && currentLaneObj.distance < 30) {
        // Low barrier can be jumped or ducked
        action = 'JUMP';
        reason = 'Jumping over barrier in current lane';
      } else if (bestLaneObj.lane !== currentLane && bestLaneObj.risk < currentLaneObj.risk) {
        // Change lane towards safest available neighbor
        action = this.getLaneChangeDirection(currentLane, bestLaneObj.lane);
        reason = `Dodging obstacle in lane ${currentLane} -> moving to safer lane ${bestLaneObj.lane}`;
      } else {
        // Forced into bad position with no clear safe adjacent lane -> default jump evasion
        action = 'JUMP';
        reason = 'Emergency jump evasion';
      }
    } else if (bestLaneObj.lane !== currentLane && (currentLaneObj.risk - bestLaneObj.risk) > 0.25) {
      // Proactive tactical lane change for optimal position or coins
      action = this.getLaneChangeDirection(currentLane, bestLaneObj.lane);
      reason = `Proactively changing to safer/richer lane ${bestLaneObj.lane}`;
    }

    this.lastChosenLane = bestLaneObj.lane;
    this.lastAction = action;
    this.lastActionTime = performance.now();

    return {
      action: action,
      targetLane: bestLaneObj.lane,
      currentLane: currentLane,
      scores: laneScores,
      reason: reason
    };
  }

  /**
   * Return directional movement action ('LEFT' or 'RIGHT')
   */
  getLaneChangeDirection(currentLane, targetLane) {
    if (targetLane < currentLane) {
      return 'LEFT';
    } else if (targetLane > currentLane) {
      return 'RIGHT';
    }
    return 'NONE';
  }

  getSafetyMultiplier() {
    switch (this.safetyLevel) {
      case 'low': return 0.7;
      case 'medium': return 1.0;
      case 'high': return 1.5;
      case 'ultra': return 2.2;
      default: return 1.5;
    }
  }
}

if (typeof window !== 'undefined') {
  window.PathPlanner = PathPlanner;
}
