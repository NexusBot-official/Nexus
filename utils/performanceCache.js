const cache = require("./cache");
const redisCache = require("./redisCache");
const logger = require("./logger");

/**
 * High-performance caching layer for frequently accessed data
 * Uses multi-tier caching: Memory -> Redis -> Database
 */
class PerformanceCache {
  constructor() {
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      redisHits: 0,
    };
  }

  /**
   * Get cached data with multi-tier fallback
   */
  async get(key, fetchFunction, options = {}) {
    const { ttl = 300, useRedis = true } = options;

    // Tier 1: Memory cache (fastest)
    const memoryCached = cache.get(key);
    if (memoryCached !== null) {
      this.stats.hits++;
      this.stats.memoryHits++;
      return memoryCached;
    }

    // Tier 2: Redis cache (fast)
    if (useRedis) {
      try {
        const redisCached = await redisCache.get(key);
        if (redisCached !== null) {
          // Populate memory cache for next time
          cache.set(key, redisCached, ttl);
          this.stats.hits++;
          this.stats.redisHits++;
          return redisCached;
        }
      } catch (error) {
        logger.debug("PerformanceCache", `Redis error: ${error.message}`);
      }
    }

    // Tier 3: Database (slow)
    this.stats.misses++;
    try {
      const fresh = await fetchFunction();

      // Cache in both layers
      if (fresh !== null && fresh !== undefined) {
        cache.set(key, fresh, ttl);
        if (useRedis) {
          await redisCache.set(key, fresh, ttl).catch(() => {});
        }
      }

      return fresh;
    } catch (error) {
      logger.error("PerformanceCache", `Fetch error for key ${key}`, {
        message: error?.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Invalidate cache for a specific key
   */
  async invalidate(key) {
    cache.delete(key);
    await redisCache.del(key).catch(() => {});
  }

  /**
   * Invalidate all cache entries matching a pattern (guild-specific)
   */
  async invalidatePattern(pattern) {
    // Clear memory cache entries matching pattern
    for (const key of Array.from(cache.store.keys())) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }

    // Note: Redis pattern deletion would require SCAN which is expensive
    // For now, just log that a guild's cache should be cleared
    logger.debug(
      "PerformanceCache",
      `Invalidated memory cache for pattern: ${pattern}`
    );
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate =
      totalRequests > 0
        ? ((this.stats.hits / totalRequests) * 100).toFixed(2)
        : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      memoryCache: cache.getStats(),
    };
  }

  /**
   * Specific caching helpers for common patterns
   */

  /**
   * Cache server config with automatic invalidation
   */
  async getConfig(guildId, fetchFn) {
    return this.get(`config_${guildId}`, fetchFn, {
      ttl: 600, // 10 minutes
      useRedis: true,
    });
  }

  /**
   * Cache user warnings (shorter TTL since it changes more frequently)
   */
  async getUserWarnings(guildId, userId, fetchFn) {
    return this.get(`warnings_${guildId}_${userId}`, fetchFn, {
      ttl: 180, // 3 minutes
      useRedis: true,
    });
  }

  /**
   * Cache anti-raid config (changes rarely)
   */
  async getAntiRaidConfig(guildId, fetchFn) {
    return this.get(`antiraid_${guildId}`, fetchFn, {
      ttl: 900, // 15 minutes
      useRedis: true,
    });
  }

  /**
   * Cache member count (updates frequently but doesn't need real-time accuracy)
   */
  async getMemberCount(guildId, fetchFn) {
    return this.get(`membercount_${guildId}`, fetchFn, {
      ttl: 60, // 1 minute
      useRedis: false, // Just memory cache
    });
  }

  /**
   * Cache guild data (name, icon, etc - changes rarely)
   */
  async getGuildData(guildId, fetchFn) {
    return this.get(`guild_${guildId}`, fetchFn, {
      ttl: 1800, // 30 minutes
      useRedis: true,
    });
  }

  /**
   * Batch invalidate when config changes
   */
  async invalidateGuildCache(guildId) {
    const patterns = [
      `config_${guildId}`,
      `antiraid_${guildId}`,
      `guild_${guildId}`,
    ];

    for (const pattern of patterns) {
      await this.invalidate(pattern);
    }

    logger.debug(
      "PerformanceCache",
      `Invalidated all cache for guild ${guildId}`
    );
  }
}

module.exports = new PerformanceCache();
