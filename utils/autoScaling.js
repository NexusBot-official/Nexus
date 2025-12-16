const logger = require("./logger");

class AutoScaling {
  constructor() {
    // Discord's recommended guild-per-shard ratio
    this.guildsPerShard = 1000; // Discord recommends ~1000 guilds per shard
    this.minShards = 1;
    this.maxShards = 16; // Discord.js max for unverified bots (can increase after verification)
  }

  /**
   * Calculate recommended shard count based on guild count
   * @param {number} guildCount - Total number of guilds
   * @returns {number} - Recommended shard count
   */
  calculateRecommendedShards(guildCount) {
    // Discord's formula: Math.ceil(guildCount / 1000)
    const recommended = Math.ceil(guildCount / this.guildsPerShard);

    // Enforce min/max limits
    if (recommended < this.minShards) {
      return this.minShards;
    }
    if (recommended > this.maxShards) {
      return this.maxShards;
    }

    return recommended;
  }

  /**
   * Check if bot needs rescaling
   * @param {number} currentShards - Current shard count
   * @param {number} guildCount - Total guild count
   * @returns {Object} - {needsRescale: boolean, recommended: number, reason: string}
   */
  shouldRescale(currentShards, guildCount) {
    const recommended = this.calculateRecommendedShards(guildCount);

    // Check if we need more shards
    if (recommended > currentShards) {
      const guildsPerCurrentShard = Math.ceil(guildCount / currentShards);
      return {
        needsRescale: true,
        recommended,
        currentShards,
        reason: `Bot is overloaded (${guildsPerCurrentShard} guilds/shard). Recommended: ${recommended} shards.`,
        urgency: guildsPerCurrentShard > 1500 ? "high" : "medium",
      };
    }

    // Check if we can reduce shards (over-provisioned)
    if (recommended < currentShards && currentShards > this.minShards) {
      const guildsPerRecommendedShard = Math.ceil(guildCount / recommended);
      // Only recommend downscaling if we're using less than 50% capacity
      if (guildsPerRecommendedShard < this.guildsPerShard * 0.5) {
        return {
          needsRescale: true,
          recommended,
          currentShards,
          reason: `Bot is over-provisioned (${Math.ceil(guildCount / currentShards)} guilds/shard). Can reduce to ${recommended} shards.`,
          urgency: "low",
        };
      }
    }

    return {
      needsRescale: false,
      recommended: currentShards,
      currentShards,
      reason: "Current shard count is optimal.",
      urgency: "none",
    };
  }

  /**
   * Get scaling recommendations for the future
   * @param {number} currentGuilds - Current guild count
   * @param {number} growthRate - Daily growth rate (guilds per day)
   * @returns {Object} - Scaling timeline
   */
  getScalingTimeline(currentGuilds, growthRate = 0) {
    const timeline = [];
    const milestones = [100, 500, 1000, 2500, 5000, 10000];

    for (const milestone of milestones) {
      if (milestone <= currentGuilds) {
        continue;
      }

      const daysUntil =
        growthRate > 0
          ? Math.ceil((milestone - currentGuilds) / growthRate)
          : null;
      const recommendedShards = this.calculateRecommendedShards(milestone);

      timeline.push({
        guildCount: milestone,
        recommendedShards,
        daysUntil,
        date: daysUntil
          ? new Date(Date.now() + daysUntil * 24 * 60 * 60 * 1000)
          : null,
      });
    }

    return timeline;
  }

  /**
   * Get current scaling status
   * @param {Client} client - Discord.js client
   * @returns {Promise<Object>} - Current scaling status
   */
  async getScalingStatus(client) {
    const guildCount = client.guilds.cache.size;
    const shardCount = client.shard ? client.shard.count : 1;

    const status = this.shouldRescale(shardCount, guildCount);

    return {
      currentGuilds: guildCount,
      currentShards: shardCount,
      guildsPerShard: Math.ceil(guildCount / shardCount),
      recommendedShards: status.recommended,
      needsRescale: status.needsRescale,
      reason: status.reason,
      urgency: status.urgency,
      thresholds: {
        guildsPerShard: this.guildsPerShard,
        maxShards: this.maxShards,
      },
    };
  }

  /**
   * Monitor scaling needs and alert owner
   * @param {Client} client - Discord.js client
   * @returns {Promise<void>}
   */
  async checkAndAlert(client) {
    try {
      const status = await this.getScalingStatus(client);

      if (status.needsRescale && status.urgency !== "low") {
        logger.warn(
          "AutoScaling",
          `⚠️ SCALING ALERT: ${status.reason} (${status.urgency} urgency)`
        );

        // Alert owner
        if (process.env.OWNER_ID) {
          try {
            const owner = await client.users.fetch(process.env.OWNER_ID);
            await owner.send({
              embeds: [
                {
                  title:
                    status.urgency === "high"
                      ? "🚨 URGENT: Bot Needs Rescaling"
                      : "⚠️ Bot Scaling Recommendation",
                  description: status.reason,
                  color: status.urgency === "high" ? 0xef4444 : 0xf59e0b,
                  fields: [
                    {
                      name: "Current Status",
                      value: `**Guilds:** ${status.currentGuilds}\n**Shards:** ${status.currentShards}\n**Guilds/Shard:** ${status.guildsPerShard}`,
                      inline: true,
                    },
                    {
                      name: "Recommended",
                      value: `**Shards:** ${status.recommendedShards}\n**New Guilds/Shard:** ${Math.ceil(status.currentGuilds / status.recommendedShards)}`,
                      inline: true,
                    },
                    {
                      name: "Action Required",
                      value:
                        status.urgency === "high"
                          ? "⚠️ **Rescale immediately** to prevent performance issues."
                          : "Consider rescaling when convenient.",
                      inline: false,
                    },
                  ],
                  footer: {
                    text: "Auto-Scaling Monitor",
                  },
                  timestamp: new Date().toISOString(),
                },
              ],
            });
          } catch (alertErr) {
            logger.error("AutoScaling", "Failed to alert owner", alertErr);
          }
        }
      }
    } catch (error) {
      logger.error("AutoScaling", "Failed to check scaling status", error);
    }
  }

  /**
   * Start periodic scaling checks
   * @param {Client} client - Discord.js client
   * @param {number} intervalMs - Check interval in milliseconds (default: 1 hour)
   */
  startMonitoring(client, intervalMs = 3600000) {
    if (this.monitorInterval) {
      logger.warn("AutoScaling", "Scaling monitor already running");
      return;
    }

    logger.info(
      "AutoScaling",
      `📊 Starting auto-scaling monitor (checks every ${intervalMs / 3600000}h)`
    );

    // Initial check
    this.checkAndAlert(client);

    // Periodic checks
    this.monitorInterval = setInterval(() => {
      this.checkAndAlert(client);
    }, intervalMs);
  }

  /**
   * Stop scaling monitor
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info("AutoScaling", "Scaling monitor stopped");
    }
  }
}

module.exports = new AutoScaling();
