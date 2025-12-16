const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "webhookDelete",
  async execute(webhook, client) {
    try {
      // Monitor webhook deletion for anti-nuke
      if (webhook.guild && client.advancedAntiNuke) {
        try {
          // Try to get executor from audit log (on-demand, not periodic)
          const auditLogs = await webhook.guild.fetchAuditLogs({
            limit: 1,
            type: 72, // WEBHOOK_DELETE
          });
          const entry = auditLogs.entries.first();
          const executorId = entry?.executor?.id || "unknown";

          // Track in event-based tracker
          if (client.eventActionTracker && executorId !== "unknown") {
            client.eventActionTracker.trackAction(
              webhook.guild.id,
              "WEBHOOK_DELETE",
              executorId,
              {
                webhookId: webhook.id,
                webhookName: webhook.name,
                channelId: webhook.channelId,
              }
            );
          }

          await client.advancedAntiNuke.monitorAction(
            webhook.guild,
            "webhookDelete",
            executorId,
            {
              webhookId: webhook.id,
              webhookName: webhook.name,
              channelId: webhook.channelId,
            }
          );
        } catch (error) {
          // Fallback if audit log fetch fails
          await client.advancedAntiNuke.monitorAction(
            webhook.guild,
            "webhookDelete",
            "unknown",
            {
              webhookId: webhook.id,
              webhookName: webhook.name,
              channelId: webhook.channelId,
            }
          );
        }
      }

      logger.info(
        `Webhook deleted: ${webhook.name} (${webhook.id}) in ${
          webhook.guild?.name || "DM"
        }`,
        {
          webhookId: webhook.id,
          webhookName: webhook.name,
          channelId: webhook.channelId,
          guildId: webhook.guild?.id,
        }
      );
    } catch (error) {
      logger.error("Error in webhookDelete event:", error);
    }
  },
};
