const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "emojiDelete",
  async execute(emoji, client) {
    try {
      // Monitor emoji deletion for anti-nuke
      if (emoji.guild && client.advancedAntiNuke) {
        try {
          // Try to get executor from audit log (on-demand, not periodic)
          const auditLogs = await emoji.guild.fetchAuditLogs({
            limit: 1,
            type: 62, // EMOJI_DELETE
          });
          const entry = auditLogs.entries.first();
          const executorId = entry?.executor?.id || "unknown";

          // Track in event-based tracker
          if (client.eventActionTracker && executorId !== "unknown") {
            client.eventActionTracker.trackAction(
              emoji.guild.id,
              "EMOJI_DELETE",
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
            "emojiDelete",
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
            "emojiDelete",
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
        `Emoji deleted: ${emoji.name} (${emoji.id}) in ${
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
      logger.error("Error in emojiDelete event:", error);
    }
  },
};
