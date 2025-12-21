const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the bot invite link"),

  async execute(interaction) {
    // Direct Discord OAuth invite link
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=268443574&scope=bot%20applications.commands`;

    const embed = new EmbedBuilder()
      .setTitle("🔗 Invite Nexus Bot")
      .setDescription(
        "Add nexus to your server for advanced security and moderation features!"
      )
      .addFields(
        {
          name: "✨ Features",
          value: [
            "🛡️ Advanced anti-raid & anti-nuke",
            "🤖 AI-powered security recommendations",
            "📊 Interactive dashboard",
            "🔓 Open source & 100% free",
          ].join("\n"),
          inline: false,
        },
        {
          name: "📋 Required Permissions",
          value: [
            "• Manage Roles (for auto-roles)",
            "• Manage Channels (for moderation)",
            "• Ban/Kick Members (for protection)",
            "• Manage Messages (for auto-mod)",
            "• View Channels, Send Messages (basic functionality)",
          ].join("\n"),
          inline: false,
        }
      )
      .setColor(0x0099ff)
      .setFooter({
        text: "nexus - Beyond Wick. Free. Open Source. Powerful.",
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Invite nexus")
        .setURL(inviteUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel("Support Server")
        .setURL("https://discord.gg/9vQzqBVMNX")
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel("GitHub")
        .setURL("https://github.com/nexusBot-official/nexus")
        .setStyle(ButtonStyle.Link)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
