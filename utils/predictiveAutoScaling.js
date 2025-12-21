const logger = require("./logger");
const fs = require("fs");
const path = require("path");

/**
 * Predictive Auto-Scaling System
 * Uses historical growth data to predict future needs and pre-scale resources
 */
class PredictiveAutoScaling {
  constructor(client) {
    this.client = client;
    this.growthHistory = []; // Historical growth data points
    this.predictions = null; // Current predictions
    this.historyPath = path.join(__dirname, "../data/growth_history.json");
    this.checkInterval = 60 * 60 * 1000; // Check every hour
    this.predictionWindow = 7 * 24 * 60 * 60 * 1000; // Predict 7 days ahead

    // Scaling thresholds
    this.thresholds = {
      serversPerShard: 2500, // Discord's recommended limit
      minShards: 1,
      maxShards: 100, // Safety limit
      preScaleBuffer: 0.8, // Pre-scale at 80% capacity
    };

    // Initialize
    this.initialize();
  }

  /**
   * Initialize system (load history, start monitoring)
   */
  initialize() {
    try {
      // Load historical data
      if (fs.existsSync(this.historyPath)) {
        const data = fs.readFileSync(this.historyPath, "utf8");
        this.growthHistory = JSON.parse(data);
        logger.info(
          "PredictiveAutoScaling",
          `Loaded ${this.growthHistory.length} historical data points`
        );
      }

      // Start monitoring
      this.startMonitoring();

      // Generate initial predictions
      this.updatePredictions();
    } catch (error) {
      logger.error(
        "PredictiveAutoScaling",
        `Failed to initialize: ${error.message}`
      );
    }
  }

  /**
   * Start growth monitoring
   */
  startMonitoring() {
    // Record growth data point every hour
    setInterval(() => {
      this.recordGrowthData();
      this.updatePredictions();
      this.checkScalingNeeds();
    }, this.checkInterval);

    logger.info(
      "PredictiveAutoScaling",
      "Growth monitoring started (1-hour intervals)"
    );
  }

  /**
   * Record current growth metrics
   */
  recordGrowthData() {
    if (!this.client.guilds) return;

    const dataPoint = {
      timestamp: Date.now(),
      serverCount: this.client.guilds.cache.size,
      userCount: this.client.guilds.cache.reduce(
        (sum, guild) => sum + guild.memberCount,
        0
      ),
      shardCount: this.client.shard?.count || 1,
      avgMembersPerServer:
        this.client.guilds.cache.reduce(
          (sum, guild) => sum + guild.memberCount,
          0
        ) / this.client.guilds.cache.size,
    };

    this.growthHistory.push(dataPoint);

    // Keep only last 90 days of data
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    this.growthHistory = this.growthHistory.filter(
      (d) => d.timestamp > ninetyDaysAgo
    );

    // Save to disk
    this.saveHistory();

    logger.debug(
      "PredictiveAutoScaling",
      `Recorded growth: ${dataPoint.serverCount} servers, ${dataPoint.userCount} users`
    );
  }

  /**
   * Update predictions based on historical data
   */
  updatePredictions() {
    if (this.growthHistory.length < 24) {
      // Need at least 24 hours of data
      logger.debug(
        "PredictiveAutoScaling",
        "Insufficient data for predictions"
      );
      return;
    }

    const currentData = this.growthHistory[this.growthHistory.length - 1];

    // Calculate growth rates
    const growthRates = this.calculateGrowthRates();

    // Predict future values using linear regression + exponential smoothing
    const predictions = [];
    const predictionIntervals = [
      { hours: 24, label: "24h" },
      { hours: 72, label: "3d" },
      { hours: 168, label: "7d" },
      { hours: 720, label: "30d" },
    ];

    for (const interval of predictionIntervals) {
      const prediction = this.predictGrowth(
        currentData,
        growthRates,
        interval.hours
      );
      predictions.push({
        interval: interval.label,
        hours: interval.hours,
        ...prediction,
      });
    }

    this.predictions = {
      generatedAt: Date.now(),
      current: currentData,
      growthRates,
      predictions,
      recommendedShards: this.calculateRecommendedShards(predictions),
      scalingAlert: this.generateScalingAlert(predictions),
    };

    logger.info(
      "PredictiveAutoScaling",
      `Predictions updated: ${predictions[2].serverCount} servers expected in 7 days`
    );
  }

  /**
   * Calculate historical growth rates
   */
  calculateGrowthRates() {
    // Calculate daily, weekly, and monthly growth rates
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const current = this.growthHistory[this.growthHistory.length - 1];

    // Find data points close to each time period
    const oneDayData = this.findClosestDataPoint(oneDayAgo);
    const oneWeekData = this.findClosestDataPoint(oneWeekAgo);
    const oneMonthData = this.findClosestDataPoint(oneMonthAgo);

    return {
      daily: oneDayData
        ? (current.serverCount - oneDayData.serverCount) /
          Math.max(oneDayData.serverCount, 1)
        : 0,
      weekly: oneWeekData
        ? (current.serverCount - oneWeekData.serverCount) /
          Math.max(oneWeekData.serverCount, 1)
        : 0,
      monthly: oneMonthData
        ? (current.serverCount - oneMonthData.serverCount) /
          Math.max(oneMonthData.serverCount, 1)
        : 0,
    };
  }

  /**
   * Find closest data point to a timestamp
   */
  findClosestDataPoint(targetTimestamp) {
    if (this.growthHistory.length === 0) return null;

    let closest = this.growthHistory[0];
    let minDiff = Math.abs(closest.timestamp - targetTimestamp);

    for (const point of this.growthHistory) {
      const diff = Math.abs(point.timestamp - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point;
      }
    }

    return closest;
  }

  /**
   * Predict growth for a future time period
   */
  predictGrowth(currentData, growthRates, hoursAhead) {
    // Use weighted average of growth rates (more weight on recent)
    const dailyWeight = 0.5;
    const weeklyWeight = 0.3;
    const monthlyWeight = 0.2;

    const avgGrowthRate =
      growthRates.daily * dailyWeight +
      growthRates.weekly * weeklyWeight +
      growthRates.monthly * monthlyWeight;

    // Calculate hours-based growth rate
    const hourlyGrowthRate = avgGrowthRate / 24;

    // Predict future values (exponential growth model)
    const growthMultiplier = Math.pow(1 + hourlyGrowthRate, hoursAhead);

    return {
      serverCount: Math.round(currentData.serverCount * growthMultiplier),
      userCount: Math.round(currentData.userCount * growthMultiplier),
      avgGrowthRate: avgGrowthRate * 100, // Convert to percentage
      confidence: this.calculateConfidence(hoursAhead),
    };
  }

  /**
   * Calculate prediction confidence based on data quality
   */
  calculateConfidence(hoursAhead) {
    // Confidence decreases with longer predictions and less data
    const dataQuality = Math.min(this.growthHistory.length / 168, 1); // 168 hours = 1 week
    const timeFactor = Math.exp(-hoursAhead / 168); // Exponential decay

    return dataQuality * timeFactor;
  }

  /**
   * Calculate recommended shard count based on predictions
   */
  calculateRecommendedShards(predictions) {
    const recommendations = [];

    for (const prediction of predictions) {
      const requiredShards = Math.ceil(
        prediction.serverCount / this.thresholds.serversPerShard
      );

      // Add buffer for pre-scaling
      const recommendedShards = Math.ceil(
        requiredShards / this.thresholds.preScaleBuffer
      );

      recommendations.push({
        interval: prediction.interval,
        requiredShards: Math.max(this.thresholds.minShards, requiredShards),
        recommendedShards: Math.min(
          Math.max(this.thresholds.minShards, recommendedShards),
          this.thresholds.maxShards
        ),
        currentShards: this.client.shard?.count || 1,
        needsScaling: recommendedShards > (this.client.shard?.count || 1),
      });
    }

    return recommendations;
  }

  /**
   * Generate scaling alert if action needed
   */
  generateScalingAlert(predictions) {
    const sevenDayPrediction = predictions.find((p) => p.interval === "7d");
    if (!sevenDayPrediction) return null;

    const currentShards = this.client.shard?.count || 1;
    const requiredShards = Math.ceil(
      sevenDayPrediction.serverCount / this.thresholds.serversPerShard
    );

    if (requiredShards > currentShards) {
      return {
        type: "warning",
        severity: requiredShards > currentShards * 2 ? "critical" : "moderate",
        message: `Scaling recommended: ${requiredShards} shards needed in 7 days (currently ${currentShards})`,
        action: "increase_shards",
        recommendation: requiredShards,
        timeframe: "7 days",
      };
    }

    return null;
  }

  /**
   * Check if scaling is needed NOW
   */
  checkScalingNeeds() {
    if (!this.predictions) return;

    const currentShards = this.client.shard?.count || 1;
    const currentServers = this.client.guilds.cache.size;
    const capacityUsed =
      currentServers / (currentShards * this.thresholds.serversPerShard);

    // Alert if at 80% capacity
    if (capacityUsed >= this.thresholds.preScaleBuffer) {
      logger.warn(
        "PredictiveAutoScaling",
        `⚠️ SCALING NEEDED: ${(capacityUsed * 100).toFixed(1)}% capacity used (${currentServers}/${currentShards * this.thresholds.serversPerShard} servers)`
      );

      // Send alert to owner
      if (this.client.users) {
        const ownerId = process.env.OWNER_ID;
        if (ownerId) {
          this.client.users
            .fetch(ownerId)
            .then((owner) => {
              owner.send(
                `🚨 **nexus Scaling Alert**\n\n` +
                  `Current capacity: ${(capacityUsed * 100).toFixed(1)}%\n` +
                  `Servers: ${currentServers}\n` +
                  `Current shards: ${currentShards}\n` +
                  `Recommended shards: ${Math.ceil(currentServers / (this.thresholds.serversPerShard * this.thresholds.preScaleBuffer))}\n\n` +
                  `Action required: Update SHARD_COUNT in environment and restart.`
              );
            })
            .catch(() => {
              logger.error(
                "PredictiveAutoScaling",
                "Failed to send alert to owner"
              );
            });
        }
      }
    }
  }

  /**
   * Save growth history to disk
   */
  saveHistory() {
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.historyPath,
        JSON.stringify(this.growthHistory, null, 2)
      );
    } catch (error) {
      logger.error(
        "PredictiveAutoScaling",
        `Failed to save history: ${error.message}`
      );
    }
  }

  /**
   * Get current predictions
   */
  getPredictions() {
    return this.predictions;
  }

  /**
   * Get growth statistics
   */
  getStats() {
    return {
      dataPoints: this.growthHistory.length,
      oldestData: this.growthHistory[0]?.timestamp || null,
      latestData:
        this.growthHistory[this.growthHistory.length - 1]?.timestamp || null,
      predictionAvailable: this.predictions !== null,
      currentCapacity: this.client.guilds
        ? (this.client.guilds.cache.size /
            ((this.client.shard?.count || 1) *
              this.thresholds.serversPerShard)) *
          100
        : 0,
    };
  }

  /**
   * Get growth chart data for visualization
   */
  getGrowthChartData() {
    return {
      historical: this.growthHistory.map((d) => ({
        timestamp: d.timestamp,
        servers: d.serverCount,
        users: d.userCount,
      })),
      predictions: this.predictions?.predictions.map((p) => ({
        timestamp: Date.now() + p.hours * 60 * 60 * 1000,
        servers: p.serverCount,
        users: p.userCount,
        confidence: p.confidence,
      })),
    };
  }
}

module.exports = PredictiveAutoScaling;
