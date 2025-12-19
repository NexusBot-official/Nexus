const logger = require("./logger");
const EventEmitter = require("events");

/**
 * Real-Time Threat Network
 * Cross-server threat collaboration using WebSocket
 */
class ThreatNetwork extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.io = null; // Socket.IO instance (set by dashboard server)
    this.threats = new Map(); // Active threats across all servers
    this.serverReputation = new Map(); // Server reputation scores
    this.consensusThreshold = 0.6; // 60% of servers must agree
    this.threatHistory = []; // Last 1000 threats
    this.maxHistory = 1000;

    // Initialize reputation for all guilds
    this.initializeReputations();
  }

  /**
   * Initialize Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io;
    this.setupSocketHandlers();
    logger.info(
      "ThreatNetwork",
      "WebSocket threat network initialized with Socket.IO"
    );
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupSocketHandlers() {
    if (!this.io) return;

    this.io.on("connection", (socket) => {
      logger.debug("ThreatNetwork", `Client connected: ${socket.id}`);

      // Send current threat state
      socket.emit("threat:state", this.getCurrentState());

      // Handle threat reports from clients
      socket.on("threat:report", (data) => {
        this.handleThreatReport(data, socket.id);
      });

      // Handle threat acknowledgment
      socket.on("threat:ack", (data) => {
        this.acknowledgeThreat(data.threatId, data.guildId);
      });

      socket.on("disconnect", () => {
        logger.debug("ThreatNetwork", `Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Initialize reputation scores for all guilds
   */
  initializeReputations() {
    if (!this.client.guilds) return;

    this.client.guilds.cache.forEach((guild) => {
      if (!this.serverReputation.has(guild.id)) {
        this.serverReputation.set(guild.id, {
          score: 100, // Start at 100
          accurateReports: 0,
          falsePositives: 0,
          totalReports: 0,
        });
      }
    });
  }

  /**
   * Broadcast threat to all connected servers
   */
  async broadcastThreat(threat) {
    if (!this.io) {
      logger.warn(
        "ThreatNetwork",
        "Socket.IO not initialized, cannot broadcast"
      );
      return;
    }

    // Add to active threats
    const threatId = `threat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    threat.id = threatId;
    threat.timestamp = Date.now();
    threat.confirmedBy = [threat.guildId];
    threat.status = "active";

    this.threats.set(threatId, threat);

    // Add to history
    this.addToHistory(threat);

    // Broadcast to all connected clients
    this.io.emit("threat:new", threat);

    logger.info(
      "ThreatNetwork",
      `Broadcasted threat ${threatId} from ${threat.guildName}`
    );

    // Emit event for local handlers
    this.emit("threatBroadcast", threat);

    return threatId;
  }

  /**
   * Report a threat (from any server)
   */
  async reportThreat(guildId, guildName, threatData) {
    const threat = {
      guildId,
      guildName,
      type: threatData.type, // raid, spam, token_leak, etc.
      severity: threatData.severity, // 1-10
      userId: threatData.userId,
      userTag: threatData.userTag,
      details: threatData.details,
      evidence: threatData.evidence || [],
    };

    const threatId = await this.broadcastThreat(threat);

    // Add to blockchain for permanent record
    if (this.client.blockchainThreatIntel) {
      try {
        this.client.blockchainThreatIntel.reportThreat(
          guildId,
          guildId,
          threatData
        );
        logger.debug("ThreatNetwork", `Threat ${threatId} added to blockchain`);
      } catch (error) {
        logger.error(
          "ThreatNetwork",
          `Blockchain add failed: ${error.message}`
        );
      }
    }

    // Check for cross-server consensus
    setTimeout(() => this.checkConsensus(threatId), 5000); // Check after 5 seconds

    return threatId;
  }

  /**
   * Handle threat report from another server
   */
  handleThreatReport(data, socketId) {
    const { threatId, guildId, agree } = data;

    const threat = this.threats.get(threatId);
    if (!threat) {
      logger.warn("ThreatNetwork", `Unknown threat ${threatId} reported`);
      return;
    }

    if (agree && !threat.confirmedBy.includes(guildId)) {
      threat.confirmedBy.push(guildId);
      logger.info(
        "ThreatNetwork",
        `Guild ${guildId} confirmed threat ${threatId} (${threat.confirmedBy.length} confirmations)`
      );

      // Update reputation (accurate report)
      this.updateReputation(guildId, true);

      // Check if consensus reached
      this.checkConsensus(threatId);

      // Broadcast update
      this.io.emit("threat:update", threat);
    }
  }

  /**
   * Check if threat has reached consensus
   */
  checkConsensus(threatId) {
    const threat = this.threats.get(threatId);
    if (!threat || threat.status !== "active") return;

    const totalServers = this.client.guilds.cache.size;
    const confirmations = threat.confirmedBy.length;
    const consensusRatio = confirmations / totalServers;

    if (consensusRatio >= this.consensusThreshold) {
      threat.status = "consensus_reached";
      threat.consensusRatio = consensusRatio;

      logger.warn(
        "ThreatNetwork",
        `CONSENSUS REACHED for threat ${threatId}: ${(consensusRatio * 100).toFixed(1)}% of servers confirm (${confirmations}/${totalServers})`
      );

      // Escalate threat
      this.escalateThreat(threat);

      // Broadcast consensus
      this.io.emit("threat:consensus", threat);

      // Emit event
      this.emit("consensusReached", threat);
    }
  }

  /**
   * Escalate threat when consensus is reached
   */
  async escalateThreat(threat) {
    // Auto-ban user across all servers if consensus reached
    if (threat.type === "raid" || threat.type === "spam") {
      logger.info(
        "ThreatNetwork",
        `Escalating threat ${threat.id} - Auto-banning ${threat.userTag} across network`
      );

      // Ban across all servers
      for (const guild of this.client.guilds.cache.values()) {
        try {
          await guild.members.ban(threat.userId, {
            reason: `Network consensus: ${threat.type} threat detected across multiple servers`,
          });
          logger.info(
            "ThreatNetwork",
            `Banned ${threat.userTag} in ${guild.name}`
          );
        } catch (error) {
          logger.debug(
            "ThreatNetwork",
            `Could not ban in ${guild.name}: ${error.message}`
          );
        }
      }
    }

    // Update threat intelligence
    if (this.client.threatIntelligence) {
      this.client.threatIntelligence.reportUser(
        threat.userId,
        threat.guildId,
        threat.type,
        10, // Max severity for consensus threats
        {
          networked: true,
          consensus: true,
          confirmations: threat.confirmedBy.length,
        }
      );
    }
  }

  /**
   * Acknowledge threat handling
   */
  acknowledgeThreat(threatId, guildId) {
    const threat = this.threats.get(threatId);
    if (!threat) return;

    if (!threat.acknowledgedBy) {
      threat.acknowledgedBy = [];
    }

    if (!threat.acknowledgedBy.includes(guildId)) {
      threat.acknowledgedBy.push(guildId);
      logger.info(
        "ThreatNetwork",
        `Guild ${guildId} acknowledged threat ${threatId}`
      );

      // Broadcast update
      if (this.io) {
        this.io.emit("threat:update", threat);
      }
    }
  }

  /**
   * Update server reputation based on report accuracy
   */
  updateReputation(guildId, accurate) {
    const rep = this.serverReputation.get(guildId);
    if (!rep) return;

    rep.totalReports++;

    if (accurate) {
      rep.accurateReports++;
      rep.score = Math.min(100, rep.score + 1); // Increase score
    } else {
      rep.falsePositives++;
      rep.score = Math.max(0, rep.score - 5); // Decrease score more for false positives
    }

    const accuracy =
      rep.totalReports > 0 ? rep.accurateReports / rep.totalReports : 1;
    rep.accuracy = accuracy;

    this.serverReputation.set(guildId, rep);

    logger.debug(
      "ThreatNetwork",
      `Updated reputation for ${guildId}: ${rep.score} (${(accuracy * 100).toFixed(1)}% accuracy)`
    );
  }

  /**
   * Get current network state
   */
  getCurrentState() {
    return {
      activeThreats: Array.from(this.threats.values()).filter(
        (t) => t.status === "active"
      ),
      totalServers: this.client.guilds.cache.size,
      recentThreats: this.threatHistory.slice(-10),
      networkHealth: this.calculateNetworkHealth(),
    };
  }

  /**
   * Calculate overall network health
   */
  calculateNetworkHealth() {
    const totalServers = this.client.guilds.cache.size;
    const activeThreats = Array.from(this.threats.values()).filter(
      (t) => t.status === "active"
    ).length;

    let avgReputation = 0;
    if (this.serverReputation.size > 0) {
      const totalRep = Array.from(this.serverReputation.values()).reduce(
        (sum, rep) => sum + rep.score,
        0
      );
      avgReputation = totalRep / this.serverReputation.size;
    }

    // Health = average reputation - (active threats * 5)
    const health = Math.max(
      0,
      Math.min(100, avgReputation - activeThreats * 5)
    );

    return {
      score: Math.round(health),
      activeThreats,
      totalServers,
      avgReputation: Math.round(avgReputation),
    };
  }

  /**
   * Add threat to history
   */
  addToHistory(threat) {
    this.threatHistory.push({
      id: threat.id,
      type: threat.type,
      severity: threat.severity,
      timestamp: threat.timestamp,
      guildId: threat.guildId,
    });

    // Keep only last N threats
    if (this.threatHistory.length > this.maxHistory) {
      this.threatHistory.shift();
    }
  }

  /**
   * Get threat statistics
   */
  getStatistics() {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;

    const recent = this.threatHistory.filter((t) => t.timestamp > last24h);

    const byType = {};
    recent.forEach((t) => {
      byType[t.type] = (byType[t.type] || 0) + 1;
    });

    return {
      total: this.threatHistory.length,
      last24h: recent.length,
      byType,
      activeThreats: this.threats.size,
      avgSeverity:
        recent.reduce((sum, t) => sum + t.severity, 0) / recent.length || 0,
    };
  }

  /**
   * Get server reputation
   */
  getServerReputation(guildId) {
    return this.serverReputation.get(guildId) || null;
  }

  /**
   * Get all server reputations (sorted)
   */
  getAllReputations() {
    return Array.from(this.serverReputation.entries())
      .map(([guildId, rep]) => ({
        guildId,
        guildName: this.client.guilds.cache.get(guildId)?.name || "Unknown",
        ...rep,
      }))
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = ThreatNetwork;
