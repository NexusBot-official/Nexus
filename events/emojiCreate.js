const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "emojiCreate",
  async execute(emoji, client) {
    try {
      // Monitor emoji creation for anti-nuke
      if (emoji.guild && client.advancedAntiNuke) {
        try {
          // Try to get executor from audit log (on-demand, not periodic)
          const auditLogs = await emoji.guild.fetchAuditLogs({
            limit: 1,
            type: 60, // EMOJI_CREATE
          });
          const entry = auditLogs.entries.first();
          const executorId = entry?.executor?.id || "unknown";

          // Track in event-based tracker
          if (client.eventActionTracker && executorId !== "unknown") {
            client.eventActionTracker.trackAction(
              emoji.guild.id,
              "EMOJI_CREATE",
              executorId,
              {
                emojiId: emoji.id,
                emojiName: emoji.name,
                animated: emoji.animated,
              }
            );
          }

          await client.advancedAntiNuke.monitorAction(
            emoji.guild,
            "emojiCreate",
            executorId,
            {
              emojiId: emoji.id,
              emojiName: emoji.name,
              animated: emoji.animated,
            }
          );
        } catch (error) {
          // Fallback if audit log fetch fails
          await client.advancedAntiNuke.monitorAction(
            emoji.guild,
            "emojiCreate",
            "unknown",
            {
              emojiId: emoji.id,
              emojiName: emoji.name,
              animated: emoji.animated,
            }
          );
        }
      }

      logger.info(
        `Emoji created: ${emoji.name} (${emoji.id}) in ${
          emoji.guild?.name || "DM"
        }`,
        {
          emojiId: emoji.id,
          emojiName: emoji.name,
          animated: emoji.animated,
          guildId: emoji.guild?.id,
        }
      );
    } catch (error) {
      logger.error("Error in emojiCreate event:", error);
    }
  },
};
