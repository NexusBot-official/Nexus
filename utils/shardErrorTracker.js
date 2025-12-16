const logger = require("./logger");

class ShardErrorTracker {
  constructor() {
    this.errors = new Map(); // shardId -> [errors]
    this.maxErrorsPerShard = 100; // Keep last 100 errors per shard
    this.errorPatterns = new Map(); // Track recurring error patterns
  }

  /**
   * Track an error for a specific shard
   * @param {number} shardId - Shard ID
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  trackError(shardId, error, context = {}) {
    // Get or create error list for this shard
    if (!this.errors.has(shardId)) {
      this.errors.set(shardId, []);
    }

    const errorList = this.errors.get(shardId);
    const errorData = {
      message: error.message || String(error),
      stack: error.stack || null,
      code: error.code || null,
      timestamp: Date.now(),
      context,
    };

    // Add error to list
    errorList.push(errorData);

    // Keep only recent errors
    if (errorList.length > this.maxErrorsPerShard) {
      errorList.shift();
    }

    // Track error patterns
    this.trackErrorPattern(shardId, errorData);

    // Log error
    logger.error(
      "ShardError",
      `Shard ${shardId} error: ${errorData.message}`,
      context
    );
  }

  /**
   * Track recurring error patterns
   * @param {number} shardId - Shard ID
   * @param {Object} errorData - Error data
   */
  trackErrorPattern(shardId, errorData) {
    const pattern = this.getErrorPattern(errorData.message);
    const key = `${shardId}:${pattern}`;

    if (!this.errorPatterns.has(key)) {
      this.errorPatterns.set(key, {
        pattern,
        shardId,
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      });
    }

    const patternData = this.errorPatterns.get(key);
    patternData.count++;
    patternData.lastSeen = Date.now();

    // Alert if error is recurring
    if (
      patternData.count === 5 ||
      patternData.count === 10 ||
      patternData.count === 25
    ) {
      logger.warn(
        "ShardError",
        `⚠️ Recurring error on shard ${shardId}: "${pattern}" (${patternData.count}x in ${Math.round((Date.now() - patternData.firstSeen) / 60000)}min)`
      );
    }
  }

  /**
   * Extract error pattern from error message
   * @param {string} message - Error message
   * @returns {string} - Error pattern
   */
  getErrorPattern(message) {
    // Remove dynamic parts like IDs, numbers, timestamps
    return message
      .replace(/\d+/g, "N") // Replace numbers with N
      .replace(/[a-f0-9]{16,}/gi, "ID") // Replace long hex IDs
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "DATE") // Replace dates
      .substring(0, 100); // Limit length
  }

  /**
   * Get error statistics for a shard
   * @param {number} shardId - Shard ID
   * @returns {Object} - Error statistics
   */
  getShardErrorStats(shardId) {
    const errors = this.errors.get(shardId) || [];
    const patterns = Array.from(this.errorPatterns.entries())
      .filter(([key]) => key.startsWith(`${shardId}:`))
      .map(([, data]) => data)
      .sort((a, b) => b.count - a.count);

    // Calculate error rate (errors per hour)
    const oneHourAgo = Date.now() - 3600000;
    const recentErrors = errors.filter((e) => e.timestamp > oneHourAgo);

    return {
      totalErrors: errors.length,
      recentErrors: recentErrors.length,
      errorRate: recentErrors.length, // Errors per hour
      topPatterns: patterns.slice(0, 5),
      lastError: errors.length > 0 ? errors[errors.length - 1] : null,
    };
  }

  /**
   * Get all errors for a shard
   * @param {number} shardId - Shard ID
   * @param {number} limit - Maximum number of errors to return
   * @returns {Array} - Error list
   */
  getShardErrors(shardId, limit = 50) {
    const errors = this.errors.get(shardId) || [];
    return errors.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get error summary for all shards
   * @returns {Object} - Error summary
   */
  getErrorSummary() {
    const summary = {
      totalShards: this.errors.size,
      totalErrors: 0,
      shardStats: [],
    };

    for (const [shardId, errors] of this.errors) {
      const stats = this.getShardErrorStats(shardId);
      summary.totalErrors += errors.length;
      summary.shardStats.push({
        shardId,
        ...stats,
      });
    }

    // Sort by error rate (most problematic first)
    summary.shardStats.sort((a, b) => b.errorRate - a.errorRate);

    return summary;
  }

  /**
   * Clear old errors
   * @param {number} maxAgeMs - Maximum age of errors to keep (default: 24 hours)
   */
  clearOldErrors(maxAgeMs = 86400000) {
    const cutoff = Date.now() - maxAgeMs;

    for (const [shardId, errors] of this.errors) {
      const filtered = errors.filter((e) => e.timestamp > cutoff);
      if (filtered.length === 0) {
        this.errors.delete(shardId);
      } else {
        this.errors.set(shardId, filtered);
      }
    }

    // Clear old patterns
    for (const [key, pattern] of this.errorPatterns) {
      if (pattern.lastSeen < cutoff) {
        this.errorPatterns.delete(key);
      }
    }
  }

  /**
   * Start automatic cleanup of old errors
   * @param {number} intervalMs - Cleanup interval (default: 1 hour)
   */
  startCleanup(intervalMs = 3600000) {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.clearOldErrors();
    }, intervalMs);

    logger.info("ShardError", "Started automatic error cleanup");
  }

  /**
   * Stop cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

module.exports = new ShardErrorTracker();
