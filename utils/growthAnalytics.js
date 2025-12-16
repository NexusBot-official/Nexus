const db = require("./database");
const logger = require("./logger");

/**
 * Member Growth Analytics System
 * Track and predict server growth patterns
 */
class GrowthAnalytics {
  constructor(client) {
    this.client = client;
  }

  /**
   * Track member join
   */
  async trackJoin(guildId, userId, source = "unknown") {
    try {
      await db.db.run(
        `INSERT INTO member_growth (guild_id, user_id, event_type, source, timestamp) 
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, "join", source, Date.now()]
      );
    } catch (error) {
      logger.error("GrowthAnalytics", "Failed to track join", error);
    }
  }

  /**
   * Track member leave
   */
  async trackLeave(guildId, userId, reason = "unknown") {
    try {
      await db.db.run(
        `INSERT INTO member_growth (guild_id, user_id, event_type, source, timestamp) 
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, "leave", reason, Date.now()]
      );
    } catch (error) {
      logger.error("GrowthAnalytics", "Failed to track leave", error);
    }
  }

  /**
   * Get growth statistics for a time period
   */
  async getGrowthStats(guildId, timeframe = "week") {
    const timeframes = {
      day: 86400000,
      week: 604800000,
      month: 2592000000,
      year: 31536000000,
    };

    const since = Date.now() - (timeframes[timeframe] || timeframes.week);

    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          COUNT(CASE WHEN event_type = 'join' THEN 1 END) as joins,
          COUNT(CASE WHEN event_type = 'leave' THEN 1 END) as leaves,
          COUNT(DISTINCT user_id) as unique_users
         FROM member_growth 
         WHERE guild_id = ? AND timestamp > ?`,
        [guildId, since],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const stats = rows[0] || { joins: 0, leaves: 0, unique_users: 0 };
            stats.netGrowth = stats.joins - stats.leaves;
            stats.growthRate =
              stats.joins > 0 ? (stats.netGrowth / stats.joins) * 100 : 0;
            stats.churnRate =
              stats.joins > 0 ? (stats.leaves / stats.joins) * 100 : 0;
            resolve(stats);
          }
        }
      );
    });
  }

  /**
   * Get hourly growth data for charts
   */
  async getHourlyGrowth(guildId, hours = 24) {
    const since = Date.now() - hours * 3600000;

    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT 
          strftime('%Y-%m-%d %H:00', datetime(timestamp/1000, 'unixepoch')) as hour,
          COUNT(CASE WHEN event_type = 'join' THEN 1 END) as joins,
          COUNT(CASE WHEN event_type = 'leave' THEN 1 END) as leaves
         FROM member_growth 
         WHERE guild_id = ? AND timestamp > ?
         GROUP BY hour
         ORDER BY hour ASC`,
        [guildId, since],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Detect unusual growth patterns
   */
  async detectAnomalies(guildId) {
    const anomalies = [];

    // Get recent growth
    const recentStats = await this.getGrowthStats(guildId, "day");
    const weeklyStats = await this.getGrowthStats(guildId, "week");

    // Check for raid-like join patterns
    if (recentStats.joins >= 50 && recentStats.leaves < 5) {
      anomalies.push({
        type: "potential_raid",
        severity: "high",
        description: `Unusual spike: ${recentStats.joins} joins in 24h with minimal leaves`,
        recommendation: "Enable stricter verification",
      });
    }

    // Check for mass exodus
    if (recentStats.leaves >= 20 && recentStats.joins < 5) {
      anomalies.push({
        type: "mass_exodus",
        severity: "warning",
        description: `High leave rate: ${recentStats.leaves} leaves in 24h`,
        recommendation: "Investigate server issues",
      });
    }

    // Check for bot join waves
    const hourlyData = await this.getHourlyGrowth(guildId, 24);
    const maxJoinsInHour = Math.max(...hourlyData.map((h) => h.joins));

    if (maxJoinsInHour >= 20) {
      anomalies.push({
        type: "bot_wave",
        severity: "medium",
        description: `${maxJoinsInHour} joins in a single hour`,
        recommendation: "Review recent joins for bots",
      });
    }

    return anomalies;
  }

  /**
   * Forecast future growth
   */
  async forecastGrowth(guildId, days = 30) {
    const historicalData = await this.getGrowthStats(guildId, "month");
    const weeklyGrowth = await this.getGrowthStats(guildId, "week");

    // Simple linear regression forecast
    const dailyGrowthRate = weeklyGrowth.netGrowth / 7;
    const forecast = [];

    for (let day = 1; day <= days; day++) {
      const predictedMembers = Math.max(0, Math.round(dailyGrowthRate * day));
      forecast.push({
        day,
        predicted: predictedMembers,
        confidence: Math.max(0, 100 - day * 2), // Confidence decreases over time
      });
    }

    return {
      currentGrowthRate: dailyGrowthRate,
      forecast,
      reliability: weeklyGrowth.joins > 10 ? "high" : "low",
    };
  }

  /**
   * Get top growth sources
   */
  async getTopSources(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT source, COUNT(*) as count 
         FROM member_growth 
         WHERE guild_id = ? AND event_type = 'join' AND timestamp > ?
         GROUP BY source 
         ORDER BY count DESC 
         LIMIT ?`,
        [guildId, Date.now() - 2592000000, limit], // Last 30 days
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Get retention rate
   */
  async getRetentionRate(guildId, days = 7) {
    const cutoff = Date.now() - days * 86400000;

    return new Promise((resolve, reject) => {
      db.db.get(
        `SELECT 
          COUNT(DISTINCT CASE WHEN event_type = 'join' THEN user_id END) as joined,
          COUNT(DISTINCT CASE WHEN event_type = 'leave' THEN user_id END) as left
         FROM member_growth 
         WHERE guild_id = ? AND timestamp > ?`,
        [guildId, cutoff],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            const retained = row.joined - row.left;
            const rate = row.joined > 0 ? (retained / row.joined) * 100 : 0;
            resolve({
              joined: row.joined,
              left: row.left,
              retained,
              retentionRate: Math.round(rate),
            });
          }
        }
      );
    });
  }

  /**
   * Generate comprehensive growth report
   */
  async generateReport(guildId) {
    const [daily, weekly, monthly, anomalies, forecast, topSources, retention] =
      await Promise.all([
        this.getGrowthStats(guildId, "day"),
        this.getGrowthStats(guildId, "week"),
        this.getGrowthStats(guildId, "month"),
        this.detectAnomalies(guildId),
        this.forecastGrowth(guildId, 30),
        this.getTopSources(guildId),
        this.getRetentionRate(guildId),
      ]);

    return {
      current: { daily, weekly, monthly },
      anomalies,
      forecast,
      topSources,
      retention,
      health: this.assessGrowthHealth(weekly, retention),
      timestamp: Date.now(),
    };
  }

  /**
   * Assess growth health
   */
  assessGrowthHealth(weeklyStats, retention) {
    let score = 50; // Base score
    let status = "stable";
    const factors = [];

    // Positive growth
    if (weeklyStats.netGrowth > 0) {
      score += 20;
      factors.push("Positive growth trend");
    } else if (weeklyStats.netGrowth < -10) {
      score -= 30;
      factors.push("Declining membership");
    }

    // Good retention
    if (retention.retentionRate >= 80) {
      score += 20;
      factors.push("Excellent retention rate");
    } else if (retention.retentionRate < 50) {
      score -= 20;
      factors.push("Poor retention rate");
    }

    // Active growth
    if (weeklyStats.joins >= 20) {
      score += 10;
      factors.push("Active recruitment");
    }

    // Determine status
    if (score >= 80) {
      status = "thriving";
    } else if (score >= 60) {
      status = "healthy";
    } else if (score >= 40) {
      status = "stable";
    } else if (score >= 20) {
      status = "declining";
    } else {
      status = "critical";
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      status,
      factors,
    };
  }
}

module.exports = GrowthAnalytics;
