const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "webhookCreate",
  async execute(webhook, client) {
    try {
      // Monitor webhook creation for anti-nuke
      if (webhook.guild && client.advancedAntiNuke) {
        const ownerId = webhook.owner?.id || "unknown";

        // Track in event-based tracker
        if (client.eventActionTracker && ownerId !== "unknown") {
          client.eventActionTracker.trackAction(
            webhook.guild.id,
            "WEBHOOK_CREATE",
            ownerId,
            {
              webhookId: webhook.id,
              webhookName: webhook.name,
              channelId: webhook.channelId,
            }
          );
        }

        await client.advancedAntiNuke.monitorAction(
          webhook.guild,
          "webhookCreate",
          ownerId,
          {
            webhookId: webhook.id,
            webhookName: webhook.name,
            channelId: webhook.channelId,
          }
        );
      }

      logger.info(
        `Webhook created: ${webhook.name} (${webhook.id}) in ${
          webhook.guild?.name || "DM"
        }`,
        {
          webhookId: webhook.id,
          webhookName: webhook.name,
          channelId: webhook.channelId,
          guildId: webhook.guild?.id,
          ownerId: webhook.owner?.id,
        }
      );
    } catch (error) {
      logger.error("Error in webhookCreate event:", error);
    }
  },
};
