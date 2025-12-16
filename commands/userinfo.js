const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get information about a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to check").setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;

    // Fetch user info even if they're not in the server
    let user = targetUser;
    // If user is partial (not fully cached), fetch it
    if (user.partial) {
      try {
        user = await interaction.client.users.fetch(targetUser.id);
      } catch (error) {
        return interaction.reply(ErrorMessages.userNotFound());
      }
    }

    // Try to fetch member from guild (may be null if user is not in server)
    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    const isInServer = member !== null;

    // Get server-specific stats only if user is in the server
    let stats = { messages_sent: 0 };
    let warnings = [];
    let heatScore = 0;

    if (isInServer) {
      stats = await db.getUserStats(interaction.guild.id, user.id);
      warnings = await db.getWarnings(interaction.guild.id, user.id);
      heatScore = await db.getHeatScore(interaction.guild.id, user.id);
    }

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: "👤 Mention", value: `<@${user.id}>`, inline: true },
        { name: "🆔 User ID", value: user.id, inline: true },
        {
          name: "📅 Account Created",
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
          inline: true,
        }
      )
      .setColor(isInServer ? member.displayColor || 0x0099ff : 0x0099ff)
      .setTimestamp();

    // Add server-specific information only if user is in the server
    if (isInServer) {
      embed.addFields({
        name: "📥 Joined Server",
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        inline: true,
      });

      const roles =
        member.roles.cache
          .filter((role) => role.id !== interaction.guild.id)
          .map((role) => role.toString())
          .slice(0, 10)
          .join(", ") || "None";

      embed.addFields(
        {
          name: "💬 Messages Sent",
          value: `${stats.messages_sent || 0}`,
          inline: true,
        },
        { name: "⚠️ Warnings", value: `${warnings.length}`, inline: true },
        { name: "🔥 Heat Score", value: `${heatScore}`, inline: true },
        { name: "🎭 Roles", value: roles || "None", inline: false }
      );

      if (member.premiumSince) {
        embed.addFields({
          name: "💎 Boosting Since",
          value: `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`,
          inline: true,
        });
      }
    } else {
      // User is not in the server - show basic info only
      embed.addFields({
        name: "ℹ️ Status",
        value: "This user is not a member of this server.",
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
