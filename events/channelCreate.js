const db = require("../utils/database");
const { EmbedBuilder, ChannelType } = require("discord.js");
const ErrorHandler = require("../utils/errorHandler");
const logger = require("../utils/logger");

module.exports = {
  name: "channelCreate",
  async execute(channel, client) {
    // Skip anti-nuke checks if backup restore is in progress
    const backupManager = require("../utils/backupManager");
    if (backupManager.isRestoring(channel.guild.id)) {
      logger.debug(
        `[channelCreate] Skipping anti-nuke check - backup restore in progress for ${channel.guild.id}`
      );
      return; // Don't process during backup restore
    }

    // If server is in lockdown, DELETE the channel immediately
    if (
      client.advancedAntiNuke &&
      client.advancedAntiNuke.lockedGuilds.has(channel.guild.id)
    ) {
      try {
        await channel
          .delete("Anti-Nuke: Channel created during lockdown")
          .catch((err) => {
            logger.debug(
              `[channelCreate] Failed to delete channel during lockdown:`,
              err.message
            );
          });
        logger.warn(
          `[Anti-Nuke] Deleted channel ${channel.id} created during lockdown in ${channel.guild.id}`
        );
        return; // Don't process further
      } catch (error) {
        // Continue to monitoring
      }
    }

    // INSTANT anti-nuke monitoring - NO WAITING for audit logs
    if (client.advancedAntiNuke) {
      // Fetch audit logs in parallel (non-blocking)
      const auditLogPromise = channel.guild.fetchAuditLogs({
        limit: 1,
        type: 10, // CHANNEL_CREATE
      }).catch(() => null);

      // INSTANT DETECTION: Check if this looks like a raid channel
      const isRaidChannel = 
        channel.name.includes('nuked') || 
        channel.name.includes('raid') ||
        channel.name.includes('hacked') ||
        /^[^a-zA-Z0-9\s-_]{3,}$/.test(channel.name); // Spam characters

      // Get audit log result
      const auditLogs = await auditLogPromise;
      const entry = auditLogs?.entries?.first();
      
      if (entry && entry.executor) {
        // Track in event-based tracker (replaces audit log monitor)
        if (client.eventActionTracker) {
          client.eventActionTracker.trackAction(
            channel.guild.id,
            "CHANNEL_CREATE",
            entry.executor.id,
            { channelId: channel.id, channelName: channel.name }
          );
        }

        // INSTANT RESPONSE: If raid channel detected, delete immediately and trigger anti-nuke
        if (isRaidChannel) {
          logger.warn(
            `[Anti-Nuke] INSTANT DETECTION: Raid channel "${channel.name}" created by ${entry.executor.tag} in ${channel.guild.name}`
          );
          
          // Delete channel immediately
          await channel.delete("Anti-Nuke: Raid channel detected").catch(() => {});
          
          // Trigger anti-nuke with HIGH PRIORITY
          await client.advancedAntiNuke.monitorAction(
            channel.guild,
            "channelCreate",
            entry.executor.id,
            { 
              channelId: channel.id, 
              channelName: channel.name,
              instantTrigger: true, // Force immediate action
              isRaidChannel: true
            }
          );
        } else {
          // Normal monitoring
          await client.advancedAntiNuke.monitorAction(
            channel.guild,
            "channelCreate",
            entry.executor.id,
            { channelId: channel.id, channelName: channel.name }
          );
        }
      }
    }

    // Enhanced logging
    const EnhancedLogging = require("../utils/enhancedLogging");
    await EnhancedLogging.log(channel.guild.id, "channel_create", "server", {
      userId: null,
      moderatorId: null,
      action: "channel_created",
      details: `Channel created: ${channel.name}`,
      metadata: {
        channelId: channel.id,
        channelName: channel.name,
        channelType: ChannelType[channel.type],
        parentId: channel.parentId,
        nsfw: channel.nsfw,
      },
      severity: "info",
    });

    // Check for mod log channel
    const config = await db.getServerConfig(channel.guild.id);
    if (config && config.mod_log_channel) {
      const logChannel = channel.guild.channels.cache.get(
        config.mod_log_channel
      );
      if (logChannel) {
        const channelTypeNames = {
          [ChannelType.GuildText]: "Text Channel",
          [ChannelType.GuildVoice]: "Voice Channel",
          [ChannelType.GuildCategory]: "Category",
          [ChannelType.GuildAnnouncement]: "Announcement Channel",
          [ChannelType.GuildForum]: "Forum Channel",
          [ChannelType.GuildStageVoice]: "Stage Channel",
        };

        const embed = new EmbedBuilder()
          .setTitle("➕ Channel Created")
          .setDescription(`**${channel.name}** channel was created`)
          .addFields(
            {
              name: "Channel",
              value: `${channel} (${channel.id})`,
              inline: true,
            },
            {
              name: "Type",
              value: channelTypeNames[channel.type] || "Unknown",
              inline: true,
            },
            {
              name: "Category",
              value: channel.parent?.name || "None",
              inline: true,
            },
            {
              name: "NSFW",
              value: channel.nsfw ? "Yes" : "No",
              inline: true,
            }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        logChannel
          .send({ embeds: [embed] })
          .catch(
            ErrorHandler.createSafeCatch(
              `channelCreate [${channel.guild.id}]`,
              `Send mod log for channel create`
            )
          );
      }
    }
  },
};
