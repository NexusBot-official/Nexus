const logger = require("./logger");
const db = require("./database");

/**
 * Advanced Behavioral Biometrics
 * Analyzes typing patterns, social graphs, and behavior to detect anomalies
 */
class BehavioralBiometrics {
  constructor(client) {
    this.client = client;
    this.userProfiles = new Map(); // userId -> behavioral profile
    this.typingPatterns = new Map(); // userId -> typing pattern data
    this.socialGraphs = new Map(); // userId -> social interaction graph
    this.anomalyThreshold = 0.7; // 70% deviation = anomaly
    this.learningPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days to learn baseline

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Analyze message for behavioral patterns
   */
  async analyzeMessage(message) {
    if (!message.author || message.author.bot) return null;

    const userId = message.author.id;
    const guildId = message.guild?.id;

    // Get or create user profile
    let profile = this.userProfiles.get(userId);
    if (!profile) {
      profile = await this.createUserProfile(userId, guildId);
      this.userProfiles.set(userId, profile);
    }

    // Analyze typing cadence
    const typingAnomaly = this.analyzeTypingCadence(
      userId,
      message.content,
      message.createdTimestamp
    );

    // Analyze message patterns
    const messageAnomaly = this.analyzeMessagePattern(userId, message);

    // Analyze social behavior
    const socialAnomaly = await this.analyzeSocialBehavior(userId, message);

    // Calculate overall anomaly score
    const anomalyScore =
      (typingAnomaly.score + messageAnomaly.score + socialAnomaly.score) / 3;

    // Update profile
    profile.lastActivity = Date.now();
    profile.messageCount++;
    profile.totalAnomalyScore += anomalyScore;
    profile.avgAnomalyScore = profile.totalAnomalyScore / profile.messageCount;

    // Check if anomaly detected
    if (anomalyScore >= this.anomalyThreshold) {
      logger.warn(
        "BehavioralBiometrics",
        `Anomaly detected for ${message.author.tag} (score: ${(anomalyScore * 100).toFixed(1)}%)`
      );

      // Report to threat network
      if (this.client.threatNetwork) {
        await this.client.threatNetwork.reportThreat(guildId, guildId || "DM", {
          type: "behavioral_anomaly",
          severity: Math.ceil(anomalyScore * 10),
          userId,
          userTag: message.author.tag,
          details: {
            typingAnomaly: typingAnomaly.score,
            messageAnomaly: messageAnomaly.score,
            socialAnomaly: socialAnomaly.score,
            overallScore: anomalyScore,
            indicators: [
              ...typingAnomaly.indicators,
              ...messageAnomaly.indicators,
              ...socialAnomaly.indicators,
            ],
          },
          evidence: [
            {
              type: "behavioral_analysis",
              score: anomalyScore,
              messageContent: message.content.substring(0, 100),
            },
          ],
        });
      }

      return {
        isAnomaly: true,
        score: anomalyScore,
        breakdown: { typingAnomaly, messageAnomaly, socialAnomaly },
      };
    }

    return {
      isAnomaly: false,
      score: anomalyScore,
      breakdown: { typingAnomaly, messageAnomaly, socialAnomaly },
    };
  }

  /**
   * Analyze typing cadence (speed, burst patterns, pauses)
   */
  analyzeTypingCadence(userId, messageContent, timestamp) {
    let typingData = this.typingPatterns.get(userId);

    if (!typingData) {
      typingData = {
        messages: [],
        avgMessageLength: 0,
        avgTimeBetween: 0,
        avgTypingSpeed: 0, // chars per second
        burstCount: 0,
      };
      this.typingPatterns.set(userId, typingData);
    }

    const indicators = [];
    let anomalyScore = 0;

    // Calculate typing speed (chars per message)
    const messageLength = messageContent.length;

    // Time since last message
    const lastMessage = typingData.messages[typingData.messages.length - 1];
    if (lastMessage) {
      const timeDelta = timestamp - lastMessage.timestamp;
      const expectedTypingTime = messageLength * 200; // ~200ms per character (average human)

      // Check if message arrived too fast (bot-like)
      if (timeDelta < 1000 && messageLength > 50) {
        // Less than 1 second for 50+ chars = suspicious
        anomalyScore += 0.3;
        indicators.push("Extremely fast typing");
      }

      // Check for robotic consistency (always same speed)
      if (typingData.messages.length >= 5) {
        const recentSpeeds = typingData.messages
          .slice(-5)
          .map((m) => m.typingSpeed);
        const speedVariance = this.calculateVariance(recentSpeeds);

        if (speedVariance < 0.1) {
          // Very low variance = bot-like
          anomalyScore += 0.2;
          indicators.push("Robotic typing consistency");
        }
      }

      // Check for burst patterns (rapid fire messages)
      if (timeDelta < 2000) {
        typingData.burstCount++;
        if (typingData.burstCount > 5) {
          // More than 5 rapid messages
          anomalyScore += 0.1;
          indicators.push("Rapid message burst");
        }
      } else {
        typingData.burstCount = 0;
      }
    }

    // Store message data
    typingData.messages.push({
      timestamp,
      length: messageLength,
      typingSpeed: messageLength / 2, // Simplified speed calculation
    });

    // Keep only last 100 messages
    if (typingData.messages.length > 100) {
      typingData.messages.shift();
    }

    // Update averages
    typingData.avgMessageLength =
      typingData.messages.reduce((sum, m) => sum + m.length, 0) /
      typingData.messages.length;

    return {
      score: Math.min(anomalyScore, 1.0),
      indicators,
    };
  }

  /**
   * Analyze message patterns (content, structure, style)
   */
  analyzeMessagePattern(userId, message) {
    const indicators = [];
    let anomalyScore = 0;

    const content = message.content;

    // Check for spam patterns
    if (content.length > 0) {
      // Repeated characters (e.g., "AAAAAA")
      const repeatMatch = content.match(/(.)\1{5,}/g);
      if (repeatMatch) {
        anomalyScore += 0.2;
        indicators.push("Repeated characters");
      }

      // All caps (screaming)
      if (content.length > 20 && content === content.toUpperCase()) {
        anomalyScore += 0.1;
        indicators.push("All caps message");
      }

      // Excessive mentions
      const mentions = (content.match(/<@!?\d+>/g) || []).length;
      if (mentions > 5) {
        anomalyScore += 0.2;
        indicators.push(`Excessive mentions (${mentions})`);
      }

      // Suspicious links
      const links = (content.match(/https?:\/\/[^\s]+/g) || []).length;
      if (links > 3) {
        anomalyScore += 0.15;
        indicators.push(`Multiple links (${links})`);
      }

      // Common scam keywords
      const scamKeywords = [
        "free nitro",
        "click here",
        "limited time",
        "act fast",
        "verify account",
        "gift card",
      ];
      const hasScamKeywords = scamKeywords.some((keyword) =>
        content.toLowerCase().includes(keyword)
      );
      if (hasScamKeywords) {
        anomalyScore += 0.3;
        indicators.push("Scam keywords detected");
      }
    }

    return {
      score: Math.min(anomalyScore, 1.0),
      indicators,
    };
  }

  /**
   * Analyze social behavior (who user interacts with, patterns)
   */
  async analyzeSocialBehavior(userId, message) {
    let socialGraph = this.socialGraphs.get(userId);

    if (!socialGraph) {
      socialGraph = {
        interactions: new Map(), // userId -> interaction count
        channelsActive: new Set(),
        guildsActive: new Set(),
        firstSeen: Date.now(),
        totalInteractions: 0,
      };
      this.socialGraphs.set(userId, socialGraph);
    }

    const indicators = [];
    let anomalyScore = 0;

    // Track channel and guild activity
    if (message.channel) {
      socialGraph.channelsActive.add(message.channel.id);
    }
    if (message.guild) {
      socialGraph.guildsActive.add(message.guild.id);
    }

    // Track mentioned users (social interactions)
    const mentions = message.mentions.users;
    if (mentions.size > 0) {
      mentions.forEach((user) => {
        const count = socialGraph.interactions.get(user.id) || 0;
        socialGraph.interactions.set(user.id, count + 1);
      });
      socialGraph.totalInteractions++;
    }

    // Check for abnormal social patterns
    const accountAge = Date.now() - message.author.createdTimestamp;
    const daysOld = accountAge / (1000 * 60 * 60 * 24);

    // New account with high activity = suspicious
    if (daysOld < 7 && socialGraph.totalInteractions > 50) {
      anomalyScore += 0.2;
      indicators.push("New account with high activity");
    }

    // Interacting with only one person (bot-like)
    if (
      socialGraph.totalInteractions > 20 &&
      socialGraph.interactions.size <= 2
    ) {
      anomalyScore += 0.15;
      indicators.push("Limited social connections");
    }

    // Active in too many guilds too quickly (raid bot)
    const timeSinceFirstSeen = Date.now() - socialGraph.firstSeen;
    const hoursSinceFirstSeen = timeSinceFirstSeen / (1000 * 60 * 60);

    if (hoursSinceFirstSeen < 24 && socialGraph.guildsActive.size > 10) {
      anomalyScore += 0.3;
      indicators.push(
        `Active in ${socialGraph.guildsActive.size} guilds within 24h`
      );
    }

    return {
      score: Math.min(anomalyScore, 1.0),
      indicators,
    };
  }

  /**
   * Create user behavioral profile
   */
  async createUserProfile(userId, guildId) {
    return {
      userId,
      guildId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      totalAnomalyScore: 0,
      avgAnomalyScore: 0,
      flagCount: 0,
      isLearning: true, // Learning baseline behavior
    };
  }

  /**
   * Calculate variance of an array of numbers
   */
  calculateVariance(numbers) {
    if (numbers.length === 0) return 0;

    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const variance =
      numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) /
      numbers.length;

    return variance;
  }

  /**
   * Get user behavioral summary
   */
  getUserBehavioralSummary(userId) {
    const profile = this.userProfiles.get(userId);
    const typing = this.typingPatterns.get(userId);
    const social = this.socialGraphs.get(userId);

    if (!profile) {
      return null;
    }

    return {
      profile: {
        messageCount: profile.messageCount,
        avgAnomalyScore: profile.avgAnomalyScore,
        lastActivity: profile.lastActivity,
      },
      typing: typing
        ? {
            avgMessageLength: typing.avgMessageLength,
            avgTypingSpeed: typing.avgTypingSpeed,
            recentMessageCount: typing.messages.length,
          }
        : null,
      social: social
        ? {
            uniqueInteractions: social.interactions.size,
            totalInteractions: social.totalInteractions,
            activeChannels: social.channelsActive.size,
            activeGuilds: social.guildsActive.size,
          }
        : null,
    };
  }

  /**
   * Start cleanup interval for old data
   */
  startCleanup() {
    setInterval(
      () => {
        const now = Date.now();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

        // Clean up old profiles
        for (const [userId, profile] of this.userProfiles.entries()) {
          if (now - profile.lastActivity > maxAge) {
            this.userProfiles.delete(userId);
            this.typingPatterns.delete(userId);
            this.socialGraphs.delete(userId);
          }
        }

        logger.debug(
          "BehavioralBiometrics",
          `Cleaned up old data. Active profiles: ${this.userProfiles.size}`
        );
      },
      24 * 60 * 60 * 1000
    ); // Run daily

    logger.info("BehavioralBiometrics", "Cleanup interval started");
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeProfiles: this.userProfiles.size,
      typingPatternsTracked: this.typingPatterns.size,
      socialGraphsTracked: this.socialGraphs.size,
      anomalyThreshold: this.anomalyThreshold,
    };
  }
}

module.exports = BehavioralBiometrics;
