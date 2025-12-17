const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const logger = require("../utils/logger");
const Owner = require("../utils/owner");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tokeninvalidate")
    .setDescription(
      "Invalidate bot token if unauthorized usage detected (Owner Only) - FORCES BOT LOGOUT"
    )
    .addBooleanOption((option) =>
      option
        .setName("confirm")
        .setDescription("Confirm you want to invalidate the token")
        .setRequired(true)
    ),

  async execute(interaction) {
    // SECURITY: Owner-only command
    if (!Owner.isOwner(interaction.user.id)) {
      return interaction.reply(ErrorMessages.ownerOnly());
    }

    const confirm = interaction.options.getBoolean("confirm");

    if (!confirm) {
      return interaction.reply({
        content: "❌ You must confirm to invalidate the token. This will force the bot to logout.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const tokenMonitor = interaction.client.tokenMonitor;

      if (!tokenMonitor) {
        return interaction.editReply({
          content: "❌ Token monitoring is not initialized",
        });
      }

      // Invalidate the token
      logger.warn("TokenInvalidate", `Token invalidation requested by owner ${interaction.user.id}`);

      const embed = new EmbedBuilder()
        .setTitle("🔒 Token Invalidation")
        .setDescription("Invalidating bot token and forcing logout...")
        .setColor(0xff0000)
        .addFields({
          name: "⚠️ Warning",
          value: "The bot will logout immediately. You must reset the token in Discord Developer Portal before restarting.",
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Wait a moment for the reply to be sent
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Invalidate and logout
      await tokenMonitor.invalidateToken();

      // This should not be reached, but just in case
      return interaction.followUp({
        content: "✅ Token invalidated. Bot is logging out...",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error("tokeninvalidate", "Error invalidating token", error);
      return interaction.editReply({
        content: `❌ Failed to invalidate token: ${error.message}`,
      });
    }
  },
};

