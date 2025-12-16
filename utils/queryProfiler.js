const logger = require("./logger");

/**
 * Query profiler to track and identify slow database queries
 */
class QueryProfiler {
  constructor() {
    this.queries = new Map(); // query -> { count, totalTime, maxTime, minTime }
    this.slowQueries = [];
    this.enabled = process.env.PROFILE_QUERIES === "true";
    this.slowQueryThreshold = 100; // ms
  }

  /**
   * Profile a database query
   */
  async profile(queryName, queryFn) {
    if (!this.enabled) {
      // If profiling disabled, just run the query
      return await queryFn();
    }

    const startTime = performance.now();
    let result;
    let error = null;

    try {
      result = await queryFn();
    } catch (err) {
      error = err;
      throw err;
    } finally {
      const duration = performance.now() - startTime;

      // Track query statistics
      if (!this.queries.has(queryName)) {
        this.queries.set(queryName, {
          count: 0,
          totalTime: 0,
          maxTime: 0,
          minTime: Infinity,
          errors: 0,
        });
      }

      const stats = this.queries.get(queryName);
      stats.count++;
      stats.totalTime += duration;
      stats.maxTime = Math.max(stats.maxTime, duration);
      stats.minTime = Math.min(stats.minTime, duration);
      if (error) {
        stats.errors++;
      }

      // Log slow queries
      if (duration > this.slowQueryThreshold) {
        const slowQuery = {
          query: queryName,
          duration: duration.toFixed(2),
          timestamp: Date.now(),
        };

        this.slowQueries.push(slowQuery);

        // Keep only last 100 slow queries
        if (this.slowQueries.length > 100) {
          this.slowQueries.shift();
        }

        logger.warn(
          "QueryProfiler",
          `Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`
        );
      }
    }

    return result;
  }

  /**
   * Get profiling statistics
   */
  getStats() {
    const stats = [];

    for (const [query, data] of this.queries.entries()) {
      stats.push({
        query,
        count: data.count,
        avgTime: (data.totalTime / data.count).toFixed(2),
        maxTime: data.maxTime.toFixed(2),
        minTime: data.minTime === Infinity ? 0 : data.minTime.toFixed(2),
        totalTime: data.totalTime.toFixed(2),
        errors: data.errors,
      });
    }

    // Sort by total time (most expensive queries first)
    stats.sort((a, b) => parseFloat(b.totalTime) - parseFloat(a.totalTime));

    return {
      queries: stats,
      slowQueries: this.slowQueries.slice(-10), // Last 10 slow queries
      totalQueries: Array.from(this.queries.values()).reduce(
        (sum, s) => sum + s.count,
        0
      ),
      enabled: this.enabled,
    };
  }

  /**
   * Get slow queries (queries that took longer than threshold)
   */
  getSlowQueries() {
    return this.slowQueries.slice(-50); // Last 50 slow queries
  }

  /**
   * Get top N slowest queries by average time
   */
  getTopSlowestQueries(n = 10) {
    const stats = [];

    for (const [query, data] of this.queries.entries()) {
      if (data.count >= 5) {
        // Only consider queries with at least 5 executions
        stats.push({
          query,
          avgTime: data.totalTime / data.count,
          count: data.count,
          maxTime: data.maxTime,
        });
      }
    }

    stats.sort((a, b) => b.avgTime - a.avgTime);
    return stats.slice(0, n);
  }

  /**
   * Reset profiling data
   */
  reset() {
    this.queries.clear();
    this.slowQueries = [];
    logger.info("QueryProfiler", "Profiling data reset");
  }

  /**
   * Enable/disable profiling
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(
      "QueryProfiler",
      `Query profiling ${enabled ? "enabled" : "disabled"}`
    );
  }

  /**
   * Set slow query threshold
   */
  setSlowQueryThreshold(ms) {
    this.slowQueryThreshold = ms;
    logger.info("QueryProfiler", `Slow query threshold set to ${ms}ms`);
  }
}

module.exports = new QueryProfiler();
