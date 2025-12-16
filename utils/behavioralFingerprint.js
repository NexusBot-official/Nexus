const db = require("./database");
const logger = require("./logger");

/**
 * Behavioral Fingerprinting System
 * Detect bot-like behavior and suspicious patterns
 */
class BehavioralFingerprint {
  constructor(client) {
    this.client = client;
    this.userBehaviors = new Map(); // userId -> behavior data
    this.updateInterval = 3600000; // Update every hour
  }

  /**
   * Track user behavior
   */
  trackBehavior(userId, guildId, action, metadata = {}) {
    const key = `${userId}_${guildId}`;

    if (!this.userBehaviors.has(key)) {
      this.userBehaviors.set(key, {
        userId,
        guildId,
        firstSeen: Date.now(),
        actions: [],
        patterns: {
          messageInterval: [],
          commandUsage: [],
          joinTimes: [],
          channelSwitches: [],
        },
        stats: {
          totalMessages: 0,
          totalCommands: 0,
          avgMessageLength: 0,
          avgResponseTime: 0,
        },
      });
    }

    const behavior = this.userBehaviors.get(key);

    // Record action
    behavior.actions.push({
      type: action,
      timestamp: Date.now(),
      metadata,
    });

    // Keep only last 1000 actions
    if (behavior.actions.length > 1000) {
      behavior.actions = behavior.actions.slice(-1000);
    }

    // Update stats
    this.updateStats(behavior, action, metadata);

    return behavior;
  }

  /**
   * Update behavior statistics
   */
  updateStats(behavior, action, metadata) {
    if (action === "message") {
      behavior.stats.totalMessages++;

      // Track message intervals
      const lastMessage = behavior.actions.slice(-2, -1)[0];
      if (lastMessage && lastMessage.type === "message") {
        const interval = Date.now() - lastMessage.timestamp;
        behavior.patterns.messageInterval.push(interval);

        // Keep last 100 intervals
        if (behavior.patterns.messageInterval.length > 100) {
          behavior.patterns.messageInterval.shift();
        }
      }

      // Track message length
      if (metadata.length) {
        const currentAvg = behavior.stats.avgMessageLength;
        const total = behavior.stats.totalMessages;
        behavior.stats.avgMessageLength =
          (currentAvg * (total - 1) + metadata.length) / total;
      }
    }

    if (action === "command") {
      behavior.stats.totalCommands++;
      behavior.patterns.commandUsage.push({
        command: metadata.command,
        timestamp: Date.now(),
      });
    }

    if (action === "channel_switch") {
      behavior.patterns.channelSwitches.push({
        from: metadata.from,
        to: metadata.to,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Analyze behavior patterns
   */
  analyzeBehavior(userId, guildId) {
    const key = `${userId}_${guildId}`;
    const behavior = this.userBehaviors.get(key);

    if (!behavior || behavior.actions.length < 10) {
      return {
        confidence: 0,
        botLikelihood: 0,
        reasons: ["Insufficient data"],
        recommendation: "monitor",
      };
    }

    const analysis = {
      confidence: 0,
      botLikelihood: 0,
      reasons: [],
      flags: [],
      recommendation: "allow",
    };

    // Check 1: Extremely consistent message intervals (bots)
    if (behavior.patterns.messageInterval.length >= 10) {
      const intervals = behavior.patterns.messageInterval;
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = this.calculateVariance(intervals, avgInterval);

      // Low variance = robotic behavior
      if (variance < 100 && avgInterval < 500) {
        analysis.botLikelihood += 30;
        analysis.flags.push("extremely_consistent_timing");
        analysis.reasons.push("Message timing is too consistent (bot-like)");
      }
    }

    // Check 2: Rapid-fire messages
    const recentMessages = behavior.actions
      .filter((a) => a.type === "message")
      .slice(-20);

    if (recentMessages.length >= 10) {
      const timeSpan =
        recentMessages[recentMessages.length - 1].timestamp -
        recentMessages[0].timestamp;
      const messagesPerSecond = recentMessages.length / (timeSpan / 1000);

      if (messagesPerSecond > 3) {
        analysis.botLikelihood += 25;
        analysis.flags.push("rapid_fire_messages");
        analysis.reasons.push(
          `Sending ${messagesPerSecond.toFixed(1)} messages/second`
        );
      }
    }

    // Check 3: Identical message lengths
    const messageLengths = behavior.actions
      .filter((a) => a.type === "message" && a.metadata?.length)
      .slice(-50)
      .map((a) => a.metadata.length);

    if (messageLengths.length >= 10) {
      const uniqueLengths = new Set(messageLengths);
      if (uniqueLengths.size < 3) {
        analysis.botLikelihood += 20;
        analysis.flags.push("identical_message_lengths");
        analysis.reasons.push("All messages are the same length");
      }
    }

    // Check 4: No variance in behavior
    const actionTypes = new Set(
      behavior.actions.slice(-100).map((a) => a.type)
    );
    if (actionTypes.size === 1 && behavior.actions.length > 50) {
      analysis.botLikelihood += 15;
      analysis.flags.push("no_behavior_variance");
      analysis.reasons.push("Only performs one type of action");
    }

    // Check 5: Instant responses (< 500ms)
    const instantResponses = behavior.patterns.messageInterval.filter(
      (i) => i < 500
    ).length;
    const responseRate =
      instantResponses / behavior.patterns.messageInterval.length;

    if (responseRate > 0.8) {
      analysis.botLikelihood += 20;
      analysis.flags.push("instant_responses");
      analysis.reasons.push("Responds too quickly (< 500ms)");
    }

    // Set confidence based on data quantity
    analysis.confidence = Math.min(100, (behavior.actions.length / 100) * 100);

    // Determine recommendation
    if (analysis.botLikelihood >= 70) {
      analysis.recommendation = "ban";
    } else if (analysis.botLikelihood >= 40) {
      analysis.recommendation = "quarantine";
    } else if (analysis.botLikelihood >= 20) {
      analysis.recommendation = "monitor";
    } else {
      analysis.recommendation = "allow";
    }

    return analysis;
  }

  /**
   * Calculate variance
   */
  calculateVariance(values, mean) {
    if (values.length === 0) {
      return 0;
    }

    const squaredDiffs = values.map((value) => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Check if IP is local/private
   */
  isLocalIP(ip) {
    const cleanIP = ip.replace(/^::ffff:/, "");

    if (
      cleanIP === "127.0.0.1" ||
      cleanIP === "::1" ||
      cleanIP === "localhost"
    ) {
      return true;
    }

    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
    ];

    return privateRanges.some((range) => range.test(cleanIP));
  }

  /**
   * Get behavior summary
   */
  getBehaviorSummary(userId, guildId) {
    const key = `${userId}_${guildId}`;
    const behavior = this.userBehaviors.get(key);

    if (!behavior) {
      return null;
    }

    return {
      userId,
      guildId,
      accountAge: Date.now() - behavior.firstSeen,
      totalActions: behavior.actions.length,
      stats: behavior.stats,
      recentActivity: behavior.actions.slice(-10),
    };
  }

  /**
   * Clean up old behavior data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [key, behavior] of this.userBehaviors.entries()) {
      if (now - behavior.firstSeen > maxAge) {
        this.userBehaviors.delete(key);
      }
    }

    logger.info("BehavioralFingerprint", `Cleaned up old behavior data`);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      trackedUsers: this.userBehaviors.size,
      cachedIPs: this.cache.size,
    };
  }
}

module.exports = BehavioralFingerprint;
