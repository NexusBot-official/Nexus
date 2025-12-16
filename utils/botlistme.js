const BotList = require("botlist.me.js");
const logger = require("./logger");

class BotListMe {
  constructor(client, token) {
    this.client = client;
    this.token = token;
    this.botList = null;
    this.initialized = false;
    this.postInterval = null;
  }

  /**
   * Initialize automatic stats posting
   */
  initialize() {
    if (this.initialized) {
      logger.warn(
        "[Botlist.me] Already initialized, skipping duplicate initialization"
      );
      return;
    }

    if (!this.token) {
      logger.warn("[Botlist.me] No token provided, skipping integration");
      return;
    }

    if (!this.client.user) {
      logger.warn(
        "[Botlist.me] Client not ready yet, will initialize when ready"
      );
      return;
    }

    try {
      // Initialize the botlist.me.js client
      this.botList = new BotList({
        token: this.token,
        botID: this.client.user.id,
      });

      // Set up automatic stats posting interval
      // botlist.me.js doesn't have startPosting(), so we use setInterval
      const postInterval = 30 * 60 * 1000; // Post every 30 minutes (same as VoidBots)

      // Don't post immediately - wait 3 minutes to respect rate limit
      // This prevents double-posting on startup
      const minPostInterval = 3 * 60 * 1000;
      setTimeout(() => {
        this.postStats();
      }, minPostInterval);

      // Post every 30 minutes
      this.postInterval = setInterval(() => {
        this.postStats();
      }, postInterval);

      this.initialized = true;
      logger.info(
        "[Botlist.me] Stats posting initialized (first post in 3 minutes)"
      );
    } catch (error) {
      logger.error("[Botlist.me] Failed to initialize:", error);
    }
  }

  /**
   * Manually post bot statistics
   */
  async postStats() {
    if (!this.token || !this.client.user) {
      return false;
    }

    try {
      const serverCount = this.client.guilds.cache.size;
      const userCount = this.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0
      );

      // If botlist client is initialized, use it
      if (this.botList) {
        await this.botList.postStats({
          servers: serverCount,
          users: userCount,
        });
        logger.info(
          `[Botlist.me] Posted stats: ${serverCount} servers, ${userCount} users`
        );
        return true;
      }

      // Fallback: initialize if not already done
      this.initialize();
      return false;
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.response?.status === 429 || error.status === 429) {
        logger.debug("[Botlist.me] Rate limited (expected behavior)");
      } else {
        logger.error("[Botlist.me] Error posting stats:", error);
      }
      return false;
    }
  }

  /**
   * Check if a user has voted
   */
  async hasVoted(userId) {
    if (!this.token || !this.client.user || !this.botList) {
      return false;
    }

    try {
      const hasVoted = await this.botList.hasVoted(userId);
      return hasVoted;
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.response?.status === 429 || error.status === 429) {
        logger.debug("[Botlist.me] Rate limited checking vote (expected)");
      } else {
        logger.debug(
          "[Botlist.me] Error checking vote status:",
          error.message || error
        );
      }
      return false;
    }
  }
}

module.exports = BotListMe;
