const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const logger = require("../logger");

class YouTubeMonitor {
  constructor(client) {
    this.client = client;
    this.monitoredChannels = new Map(); // guildId -> channelId
    this.lastVideoIds = new Map(); // channelId -> lastVideoId
    this.checkInterval = 300000; // Check every 5 minutes (YouTube API rate limits)
    this.intervalId = null;
  }

  async initialize() {
    const db = require("../database");

    try {
      const guilds = this.client.guilds.cache;

      for (const [guildId, guild] of guilds) {
        const integration = await db.getIntegration(guildId, "youtube");

        if (integration && integration.config?.enabled) {
          this.monitoredChannels.set(guildId, integration.config.channel_id);
        }
      }

      if (this.monitoredChannels.size > 0) {
        this.startMonitoring();
        logger.info(
          `YouTube Monitor initialized with ${this.monitoredChannels.size} channels`
        );
      }
    } catch (error) {
      logger.error("Failed to initialize YouTube monitor:", error);
    }
  }

  addChannel(guildId, channelId) {
    this.monitoredChannels.set(guildId, channelId);

    if (!this.intervalId) {
      this.startMonitoring();
    }

    logger.info(`Added YouTube channel ${channelId} for guild ${guildId}`);
  }

  removeChannel(guildId) {
    this.monitoredChannels.delete(guildId);

    if (this.monitoredChannels.size === 0 && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info(`Removed YouTube monitoring for guild ${guildId}`);
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
    for (const [guildId, channelId] of this.monitoredChannels) {
      try {
        await this.checkChannel(guildId, channelId);
      } catch (error) {
        logger.error(`Error checking YouTube channel ${channelId}:`, error);
      }
    }
  }

  async checkChannel(guildId, channelId) {
    try {
      // Note: In production, use YouTube Data API v3 with API key
      // For now, we'll use RSS feed (no API key required)
      const response = await axios.get(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
        {
          timeout: 10000,
        }
      );

      // Parse RSS feed (simplified)
      const videoIdMatch = response.data.match(
        /<yt:videoId>(.*?)<\/yt:videoId>/
      );
      const titleMatch = response.data.match(/<title>(.*?)<\/title>/g);
      const publishedMatch = response.data.match(
        /<published>(.*?)<\/published>/
      );

      if (!videoIdMatch) return;

      const latestVideoId = videoIdMatch[1];
      const videoTitle = titleMatch && titleMatch[1] ? titleMatch[1].replace(/<\/?title>/g, "") : "New Video";
      const published = publishedMatch ? new Date(publishedMatch[1].replace(/<\/?published>/g, "")) : new Date();

      const lastVideoId = this.lastVideoIds.get(channelId);

      // Check if this is a new video (uploaded in last 10 minutes)
      const isNewVideo = latestVideoId !== lastVideoId && 
                         Date.now() - published.getTime() < 600000;

      if (isNewVideo) {
        await this.sendNotification(guildId, channelId, {
          videoId: latestVideoId,
          title: videoTitle,
          url: `https://www.youtube.com/watch?v=${latestVideoId}`,
          thumbnail: `https://img.youtube.com/vi/${latestVideoId}/maxresdefault.jpg`,
        });
      }

      this.lastVideoIds.set(channelId, latestVideoId);
    } catch (error) {
      logger.debug(`YouTube check failed for ${channelId}:`, error.message);
    }
  }

  async sendNotification(guildId, channelId, videoData) {
    try {
      const db = require("../database");
      const integration = await db.getIntegration(guildId, "youtube");

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
        .setTitle(videoData.title)
        .setURL(videoData.url)
        .setDescription(`New video uploaded!`)
        .setColor(0xff0000)
        .setImage(videoData.thumbnail)
        .setTimestamp()
        .setFooter({ text: "YouTube Integration" });

      await channel.send({
        content: `🎥 **New YouTube Video!**`,
        embeds: [embed],
      });

      logger.info(
        `Sent YouTube notification for ${channelId} in guild ${guildId}`
      );
    } catch (error) {
      logger.error(`Failed to send YouTube notification:`, error);
    }
  }
}

module.exports = new YouTubeMonitor();

