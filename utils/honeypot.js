const { ChannelType, PermissionFlagsBits } = require("discord.js");
const db = require("./database");
const logger = require("./logger");
const Security = require("./security");

/**
 * Honeypot Channel System
 * Creates fake "admin-only" channels to detect potential nukers/raiders
 * When someone tries to access them, they're flagged as suspicious
 */
class HoneypotSystem {
  constructor(client) {
    this.client = client;
    this.honeypots = new Map(); // guildId -> channelIds[]
    this.suspiciousUsers = new Map(); // userId -> suspicionScore
  }

  /**
   * Initialize honeypot channels for a guild
   */
  async initialize(guild) {
    try {
      const config = await db.getServerConfig(guild.id);
      if (!config || !config.honeypot_enabled) {
        return;
      }

      // Check if honeypots already exist
      const existing = guild.channels.cache.filter(
        (c) =>
          c.name.startsWith("🍯-honeypot-") || c.topic?.includes("[HONEYPOT]")
      );

      if (existing.size >= 3) {
        this.honeypots.set(
          guild.id,
          existing.map((c) => c.id)
        );
        logger.info(
          "Honeypot",
          `${existing.size} honeypots already active in ${guild.name}`
        );
        return;
      }

      // Create honeypot channels
      const honeypotChannels = await this.createHoneypots(guild);
      this.honeypots.set(
        guild.id,
        honeypotChannels.map((c) => c.id)
      );

      logger.success(
        "Honeypot",
        `Created ${honeypotChannels.length} honeypots in ${guild.name}`
      );
    } catch (error) {
      logger.error("Honeypot", `Failed to initialize for ${guild.name}`, error);
    }
  }

  /**
   * Create honeypot channels
   */
  async createHoneypots(guild) {
    const honeypotNames = [
      "🍯-honeypot-admin-logs",
      "🍯-honeypot-mod-only",
      "🍯-honeypot-staff-chat",
    ];

    const channels = [];

    for (const name of honeypotNames) {
      try {
        // Create channel with tempting name
        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildText,
          topic: "[HONEYPOT] This is a trap channel to detect malicious users",
          permissionOverwrites: [
            {
              id: guild.id, // @everyone
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: this.client.user.id, // Bot
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ManageChannels,
              ],
            },
          ],
          position: 0, // Place at top to make it tempting
        });

        channels.push(channel);

        // Send honeypot message
        await channel.send({
          embeds: [
            {
              title: "🍯 Honeypot Active",
              description:
                "This channel is a security measure. Any access attempts will be logged and flagged.",
              color: 0xff9800,
              footer: { text: "Nexus Security System" },
            },
          ],
        });
      } catch (error) {
        logger.error("Honeypot", `Failed to create ${name}`, error);
      }
    }

    return channels;
  }

  /**
   * Check if channel is a honeypot
   */
  isHoneypot(guildId, channelId) {
    const honeypots = this.honeypots.get(guildId) || [];
    return honeypots.includes(channelId);
  }

  /**
   * Handle honeypot access attempt
   */
  async handleAccessAttempt(guild, user, channel, attemptType = "view") {
    if (!this.isHoneypot(guild.id, channel.id)) {
      return;
    }

    logger.warn(
      "Honeypot",
      `${user.tag} (${user.id}) attempted to ${attemptType} honeypot in ${guild.name}`
    );

    // Increase suspicion score
    const currentScore = this.suspiciousUsers.get(user.id) || 0;
    const newScore = currentScore + this.getScoreIncrement(attemptType);
    this.suspiciousUsers.set(user.id, newScore);

    // Log to database
    await db.addEnhancedLog(
      guild.id,
      "honeypot",
      "security",
      user.id,
      this.client.user.id,
      `honeypot_${attemptType}`,
      `User attempted to ${attemptType} honeypot channel: ${channel.name}`,
      {
        channelId: channel.id,
        channelName: channel.name,
        attemptType,
        suspicionScore: newScore,
      },
      "warning"
    );

    // Take action based on score
    if (newScore >= 100) {
      await this.takeAction(
        guild,
        user,
        "ban",
        "Multiple honeypot access attempts"
      );
    } else if (newScore >= 50) {
      await this.takeAction(
        guild,
        user,
        "quarantine",
        "Suspicious behavior detected"
      );
    } else {
      await this.notifyMods(guild, user, channel, attemptType, newScore);
    }
  }

  /**
   * Get score increment based on attempt type
   */
  getScoreIncrement(attemptType) {
    const scores = {
      view: 10,
      message: 25,
      delete: 50,
      edit: 40,
      manage: 75,
    };
    return scores[attemptType] || 10;
  }

  /**
   * Take action against suspicious user
   */
  async takeAction(guild, user, action, reason) {
    const Moderation = require("./moderation");

    try {
      if (action === "ban") {
        await Moderation.ban(guild, user, this.client.user, reason);
        logger.success(
          "Honeypot",
          `Banned ${user.tag} from ${guild.name} - ${reason}`
        );
      } else if (action === "quarantine") {
        const member = await guild.members.fetch(user.id);
        if (member) {
          // Remove all roles except @everyone
          await member.roles.set([], reason);
          logger.success(
            "Honeypot",
            `Quarantined ${user.tag} in ${guild.name} - ${reason}`
          );
        }
      }

      // Notify via webhook
      await Security.notifySecurityEvent(guild, {
        type: "honeypot_action",
        user: user,
        action,
        reason,
        score: this.suspiciousUsers.get(user.id) || 0,
      });
    } catch (error) {
      logger.error("Honeypot", `Failed to ${action} ${user.tag}`, error);
    }
  }

  /**
   * Notify moderators of honeypot attempt
   */
  async notifyMods(guild, user, channel, attemptType, score) {
    const config = await db.getServerConfig(guild.id);
    if (!config || !config.alert_channel) {
      return;
    }

    try {
      const alertChannel = guild.channels.cache.get(config.alert_channel);
      if (!alertChannel) {
        return;
      }

      await alertChannel.send({
        embeds: [
          {
            title: "🍯 Honeypot Access Detected",
            description: `**User:** ${user.tag} (${user.id})\n**Channel:** ${channel.name}\n**Attempt:** ${attemptType}\n**Suspicion Score:** ${score}/100`,
            color: 0xff9800,
            timestamp: new Date(),
            footer: { text: "Nexus Security System" },
          },
        ],
      });
    } catch (error) {
      logger.error("Honeypot", "Failed to notify mods", error);
    }
  }

  /**
   * Clean up expired suspicion scores
   */
  cleanupScores() {
    // Reset scores that haven't been updated in 24 hours
    const now = Date.now();
    for (const [userId, lastUpdate] of this.suspiciousUsers.entries()) {
      if (now - lastUpdate > 86400000) {
        // 24 hours
        this.suspiciousUsers.delete(userId);
      }
    }
  }

  /**
   * Remove honeypots from a guild
   */
  async removeHoneypots(guild) {
    const honeypots = this.honeypots.get(guild.id) || [];

    for (const channelId of honeypots) {
      try {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          await channel.delete("Honeypot system disabled");
        }
      } catch (error) {
        logger.error(
          "Honeypot",
          `Failed to delete honeypot ${channelId}`,
          error
        );
      }
    }

    this.honeypots.delete(guild.id);
    logger.info("Honeypot", `Removed all honeypots from ${guild.name}`);
  }
}

module.exports = HoneypotSystem;
