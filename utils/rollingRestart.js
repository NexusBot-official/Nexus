const logger = require("./logger");

class RollingRestart {
  constructor() {
    this.isRestarting = false;
    this.restartDelay = 10000; // 10 seconds between shard restarts
  }

  /**
   * Perform a rolling restart of all shards
   * @param {ShardingManager} manager - Discord.js ShardingManager
   * @param {Object} options - Restart options
   * @returns {Promise<void>}
   */
  async restart(manager, options = {}) {
    if (this.isRestarting) {
      logger.warn("RollingRestart", "Rolling restart already in progress");
      return;
    }

    this.isRestarting = true;
    const delay = options.delay || this.restartDelay;
    const shardOrder = options.shardOrder || "sequential"; // sequential or reverse

    try {
      logger.info(
        "RollingRestart",
        `🔄 Starting rolling restart of ${manager.shards.size} shards...`
      );

      const shards = Array.from(manager.shards.values());
      if (shardOrder === "reverse") {
        shards.reverse();
      }

      for (const shard of shards) {
        logger.info(
          "RollingRestart",
          `Restarting shard ${shard.id}/${manager.shards.size - 1}...`
        );

        try {
          await shard.respawn({
            delay: 500,
            timeout: 30000,
          });

          logger.success(
            "RollingRestart",
            `✅ Shard ${shard.id} restarted successfully`
          );

          // Wait before restarting next shard (except for last shard)
          if (shard.id < manager.shards.size - 1) {
            logger.info(
              "RollingRestart",
              `Waiting ${delay / 1000}s before next shard...`
            );
            await this.sleep(delay);
          }
        } catch (error) {
          logger.error(
            "RollingRestart",
            `Failed to restart shard ${shard.id}:`,
            error.message
          );
          // Continue with next shard even if one fails
        }
      }

      logger.success(
        "RollingRestart",
        `🎉 Rolling restart complete! All ${manager.shards.size} shards restarted.`
      );
    } catch (error) {
      logger.error("RollingRestart", "Rolling restart failed:", error);
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Restart a specific shard
   * @param {ShardingManager} manager - Discord.js ShardingManager
   * @param {number} shardId - Shard ID to restart
   * @returns {Promise<void>}
   */
  async restartShard(manager, shardId) {
    const shard = manager.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard ${shardId} not found`);
    }

    logger.info("RollingRestart", `Restarting shard ${shardId}...`);

    await shard.respawn({
      delay: 500,
      timeout: 30000,
    });

    logger.success("RollingRestart", `✅ Shard ${shardId} restarted`);
  }

  /**
   * Restart shards in batches (for large bot with many shards)
   * @param {ShardingManager} manager - Discord.js ShardingManager
   * @param {Object} options - Batch restart options
   * @returns {Promise<void>}
   */
  async batchRestart(manager, options = {}) {
    if (this.isRestarting) {
      logger.warn("RollingRestart", "Rolling restart already in progress");
      return;
    }

    this.isRestarting = true;
    const batchSize = options.batchSize || 3; // Restart 3 shards at a time
    const delay = options.delay || this.restartDelay;

    try {
      logger.info(
        "RollingRestart",
        `🔄 Starting batch restart (${batchSize} shards at a time)...`
      );

      const shards = Array.from(manager.shards.values());
      const batches = [];

      // Split shards into batches
      for (let i = 0; i < shards.length; i += batchSize) {
        batches.push(shards.slice(i, i + batchSize));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        logger.info(
          "RollingRestart",
          `Restarting batch ${batchIndex + 1}/${batches.length} (shards: ${batch.map((s) => s.id).join(", ")})...`
        );

        // Restart all shards in batch in parallel
        await Promise.all(
          batch.map((shard) =>
            shard
              .respawn({
                delay: 500,
                timeout: 30000,
              })
              .catch((err) => {
                logger.error(
                  "RollingRestart",
                  `Failed to restart shard ${shard.id}:`,
                  err.message
                );
              })
          )
        );

        logger.success(
          "RollingRestart",
          `✅ Batch ${batchIndex + 1} completed`
        );

        // Wait before next batch (except for last batch)
        if (batchIndex < batches.length - 1) {
          logger.info(
            "RollingRestart",
            `Waiting ${delay / 1000}s before next batch...`
          );
          await this.sleep(delay);
        }
      }

      logger.success(
        "RollingRestart",
        `🎉 Batch restart complete! All ${manager.shards.size} shards restarted.`
      );
    } catch (error) {
      logger.error("RollingRestart", "Batch restart failed:", error);
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Check if rolling restart is in progress
   * @returns {boolean}
   */
  isInProgress() {
    return this.isRestarting;
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new RollingRestart();
