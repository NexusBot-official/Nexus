const axios = require("axios");
const { EmbedBuilder} = require("discord.js");
const logger = require("../logger");

class TwitchMonitor {
  constructor(client) {
    this.client = client;
    this.monitoredChannels = new Map(); // guildId -> channelName
    this.streamStatus = new Map(); // channelName -> isLive
    this.checkInterval = 60000; // Check every 60 seconds
    this.intervalId = null;
  }

  async initialize() {
    // Load all Twitch integrations from database
    const db = require("../database");
    
    try {
      const guilds = this.client.guilds.cache;
      
      for (const [guildId, guild] of guilds) {
        const integration = await db.getIntegration(guildId, "twitch");
        
        if (integration && integration.config?.enabled) {
          this.monitoredChannels.set(guildId, integration.config.channel);
        }
      }

      // Start monitoring
      if (this.monitoredChannels.size > 0) {
        this.startMonitoring();
        logger.info(`Twitch Monitor initialized with ${this.monitoredChannels.size} channels`);
      }
    } catch (error) {
      logger.error("Failed to initialize Twitch monitor:", error);
    }
  }

  addChannel(guildId, channelName) {
    this.monitoredChannels.set(guildId, channelName);
    
    if (!this.intervalId) {
      this.startMonitoring();
    }
    
    logger.info(`Added Twitch channel ${channelName} for guild ${guildId}`);
  }

  removeChannel(guildId) {
    this.monitoredChannels.delete(guildId);
    
    if (this.monitoredChannels.size === 0 && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    logger.info(`Removed Twitch monitoring for guild ${guildId}`);
  }

  startMonitoring() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.checkAllChannels();
    }, this.checkInterval);

    // Check immediately
    this.checkAllChannels();
  }

  async checkAllChannels() {
    for (const [guildId, channelName] of this.monitoredChannels) {
      try {
        await this.checkChannel(guildId, channelName);
      } catch (error) {
        logger.error(`Error checking Twitch channel ${channelName}:`, error);
      }
    }
  }

  async checkChannel(guildId, channelName) {
    try {
      // Note: In production, you'd use Twitch API with OAuth
      // For now, we'll use a simplified check using public data
      const response = await axios.get(
        `https://www.twitch.tv/${channelName}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
          timeout: 10000,
        }
      );

      // Check if stream is live (simplified - in production use Twitch API)
      const isLive = response.data.includes('"isLiveBroadcast":true');
      const wasLive = this.streamStatus.get(channelName);

      if (isLive && !wasLive) {
        // Stream just went live
        await this.sendNotification(guildId, channelName, {
          title: `${channelName} is now live on Twitch!`,
          url: `https://www.twitch.tv/${channelName}`,
          thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channelName}-440x248.jpg`,
        });
      }

      this.streamStatus.set(channelName, isLive);
    } catch (error) {
      // Silently fail - channel might be offline or rate limited
      logger.debug(`Twitch check failed for ${channelName}:`, error.message);
    }
  }

  async sendNotification(guildId, channelName, streamData) {
    try {
      const db = require("../database");
      const integration = await db.getIntegration(guildId, "twitch");

      if (!integration || !integration.config?.notification_channel) {
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(
        integration.config.notification_channel
      );
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle(streamData.title)
        .setURL(streamData.url)
        .setDescription(`${channelName} is now streaming on Twitch!`)
        .setColor(0x9146ff)
        .setThumbnail(streamData.thumbnail)
        .setTimestamp()
        .setFooter({ text: "Twitch Integration" });

      await channel.send({
        content: `📺 **${channelName}** is live!`,
        embeds: [embed],
      });

      logger.info(`Sent Twitch notification for ${channelName} in guild ${guildId}`);
    } catch (error) {
      logger.error(`Failed to send Twitch notification:`, error);
    }
  }
}

module.exports = new TwitchMonitor();

