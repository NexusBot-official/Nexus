const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("integrations")
    .setDescription("Manage platform integrations")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("View all available integrations")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("twitch")
        .setDescription("Configure Twitch integration")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
              { name: "Connect", value: "connect" },
              { name: "Disconnect", value: "disconnect" },
              { name: "Status", value: "status" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("channel")
            .setDescription("Twitch channel name (for connect)")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("notification_channel")
            .setDescription("Discord channel for notifications (for connect)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("youtube")
        .setDescription("Configure YouTube integration")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
              { name: "Connect", value: "connect" },
              { name: "Disconnect", value: "disconnect" },
              { name: "Status", value: "status" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("channel_id")
            .setDescription("YouTube channel ID (for connect)")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("notification_channel")
            .setDescription("Discord channel for notifications (for connect)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("github")
        .setDescription("Configure GitHub integration")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
              { name: "Connect", value: "connect" },
              { name: "Disconnect", value: "disconnect" },
              { name: "Status", value: "status" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("repository")
            .setDescription("GitHub repository (owner/repo) (for connect)")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("notification_channel")
            .setDescription("Discord channel for notifications (for connect)")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "list") {
        return await this.showIntegrationsList(interaction);
      } else if (subcommand === "twitch") {
        return await this.handleTwitch(interaction);
      } else if (subcommand === "youtube") {
        return await this.handleYouTube(interaction);
      } else if (subcommand === "github") {
        return await this.handleGitHub(interaction);
      }
    } catch (error) {
      const logger = require("../utils/logger");
      logger.error("Error in /integrations command:", error);

      const reply = {
        content: `❌ Error: ${error.message}`,
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  },

  async showIntegrationsList(interaction) {
    const integrations = await db.getIntegrations(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setTitle("🔗 Platform Integrations")
      .setDescription(
        "Connect external platforms to your Discord server!\n\n" +
          "**Available Integrations:**"
      )
      .addFields(
        {
          name: "📺 Twitch",
          value:
            integrations.twitch?.enabled
              ? `✅ Connected to **${integrations.twitch.channel}**`
              : "❌ Not connected\nUse `/integrations twitch` to connect",
          inline: false,
        },
        {
          name: "🎥 YouTube",
          value:
            integrations.youtube?.enabled
              ? `✅ Connected to channel **${integrations.youtube.channel_id}**`
              : "❌ Not connected\nUse `/integrations youtube` to connect",
          inline: false,
        },
        {
          name: "🐙 GitHub",
          value:
            integrations.github?.enabled
              ? `✅ Connected to **${integrations.github.repository}**`
              : "❌ Not connected\nUse `/integrations github` to connect",
          inline: false,
        }
      )
      .setColor(0x667eea)
      .setFooter({
        text: "More integrations coming soon!",
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async handleTwitch(interaction) {
    const action = interaction.options.getString("action");
    const channel = interaction.options.getString("channel");
    const notificationChannel = interaction.options.getChannel(
      "notification_channel"
    );

    if (action === "connect") {
      if (!channel || !notificationChannel) {
        return interaction.reply({
          content:
            "❌ Please provide both Twitch channel name and Discord notification channel!",
          ephemeral: true,
        });
      }

      await db.setIntegration(interaction.guild.id, "twitch", {
        enabled: true,
        channel: channel,
        notification_channel: notificationChannel.id,
        last_check: Date.now(),
      });

      // Start monitoring
      const TwitchMonitor = require("../utils/integrations/twitchMonitor");
      TwitchMonitor.addChannel(interaction.guild.id, channel);

      const embed = new EmbedBuilder()
        .setTitle("✅ Twitch Integration Connected")
        .setDescription(
          `Now monitoring **${channel}** on Twitch!\n\n` +
            `Notifications will be sent to ${notificationChannel}`
        )
        .addFields({
          name: "📢 What You'll Get",
          value:
            "• Stream go-live notifications\n" +
            "• Stream title & game updates\n" +
            "• Viewer count updates",
        })
        .setColor(0x9146ff);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (action === "disconnect") {
      await db.setIntegration(interaction.guild.id, "twitch", {
        enabled: false,
      });

      const TwitchMonitor = require("../utils/integrations/twitchMonitor");
      TwitchMonitor.removeChannel(interaction.guild.id);

      await interaction.reply({
        content: "✅ Twitch integration disconnected",
        ephemeral: true,
      });
    } else if (action === "status") {
      const integration = await db.getIntegration(
        interaction.guild.id,
        "twitch"
      );

      if (!integration?.enabled) {
        return interaction.reply({
          content: "❌ Twitch integration is not connected",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📺 Twitch Integration Status")
        .addFields(
          {
            name: "Channel",
            value: integration.channel,
            inline: true,
          },
          {
            name: "Notification Channel",
            value: `<#${integration.notification_channel}>`,
            inline: true,
          },
          {
            name: "Last Check",
            value: `<t:${Math.floor(integration.last_check / 1000)}:R>`,
            inline: true,
          }
        )
        .setColor(0x9146ff);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  async handleYouTube(interaction) {
    const action = interaction.options.getString("action");
    const channelId = interaction.options.getString("channel_id");
    const notificationChannel = interaction.options.getChannel(
      "notification_channel"
    );

    if (action === "connect") {
      if (!channelId || !notificationChannel) {
        return interaction.reply({
          content:
            "❌ Please provide both YouTube channel ID and Discord notification channel!",
          ephemeral: true,
        });
      }

      await db.setIntegration(interaction.guild.id, "youtube", {
        enabled: true,
        channel_id: channelId,
        notification_channel: notificationChannel.id,
        last_check: Date.now(),
      });

      // Start monitoring
      const YouTubeMonitor = require("../utils/integrations/youtubeMonitor");
      YouTubeMonitor.addChannel(interaction.guild.id, channelId);

      const embed = new EmbedBuilder()
        .setTitle("✅ YouTube Integration Connected")
        .setDescription(
          `Now monitoring YouTube channel **${channelId}**!\n\n` +
            `Notifications will be sent to ${notificationChannel}`
        )
        .addFields({
          name: "📢 What You'll Get",
          value:
            "• New video upload notifications\n" +
            "• Live stream start notifications\n" +
            "• Video title, thumbnail, and link",
        })
        .setColor(0xff0000);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (action === "disconnect") {
      await db.setIntegration(interaction.guild.id, "youtube", {
        enabled: false,
      });

      const YouTubeMonitor = require("../utils/integrations/youtubeMonitor");
      YouTubeMonitor.removeChannel(interaction.guild.id);

      await interaction.reply({
        content: "✅ YouTube integration disconnected",
        ephemeral: true,
      });
    } else if (action === "status") {
      const integration = await db.getIntegration(
        interaction.guild.id,
        "youtube"
      );

      if (!integration?.enabled) {
        return interaction.reply({
          content: "❌ YouTube integration is not connected",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🎥 YouTube Integration Status")
        .addFields(
          {
            name: "Channel ID",
            value: integration.channel_id,
            inline: true,
          },
          {
            name: "Notification Channel",
            value: `<#${integration.notification_channel}>`,
            inline: true,
          },
          {
            name: "Last Check",
            value: `<t:${Math.floor(integration.last_check / 1000)}:R>`,
            inline: true,
          }
        )
        .setColor(0xff0000);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  async handleGitHub(interaction) {
    const action = interaction.options.getString("action");
    const repository = interaction.options.getString("repository");
    const notificationChannel = interaction.options.getChannel(
      "notification_channel"
    );

    if (action === "connect") {
      if (!repository || !notificationChannel) {
        return interaction.reply({
          content:
            "❌ Please provide both GitHub repository (owner/repo) and Discord notification channel!",
          ephemeral: true,
        });
      }

      // Validate repository format
      if (!repository.match(/^[\w-]+\/[\w-]+$/)) {
        return interaction.reply({
          content:
            '❌ Invalid repository format! Use "owner/repo" (e.g., "microsoft/vscode")',
          ephemeral: true,
        });
      }

      await db.setIntegration(interaction.guild.id, "github", {
        enabled: true,
        repository: repository,
        notification_channel: notificationChannel.id,
        webhook_secret: require("crypto").randomBytes(32).toString("hex"),
      });

      const webhookUrl = `${process.env.WEBHOOK_BASE_URL || "https://your-domain.com"}/webhooks/github/${interaction.guild.id}`;

      const embed = new EmbedBuilder()
        .setTitle("✅ GitHub Integration Connected")
        .setDescription(
          `Now monitoring **${repository}** on GitHub!\n\n` +
            `Notifications will be sent to ${notificationChannel}`
        )
        .addFields(
          {
            name: "📢 What You'll Get",
            value:
              "• Push notifications\n" +
              "• Pull request updates\n" +
              "• Issue notifications\n" +
              "• Release announcements",
          },
          {
            name: "⚙️ Setup Webhook",
            value:
              `1. Go to https://github.com/${repository}/settings/hooks\n` +
              `2. Click "Add webhook"\n` +
              `3. Paste this URL:\n\`\`\`${webhookUrl}\`\`\`\n` +
              `4. Content type: application/json\n` +
              `5. Select events you want\n` +
              `6. Click "Add webhook"`,
          }
        )
        .setColor(0x238636);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (action === "disconnect") {
      await db.setIntegration(interaction.guild.id, "github", {
        enabled: false,
      });

      await interaction.reply({
        content: "✅ GitHub integration disconnected",
        ephemeral: true,
      });
    } else if (action === "status") {
      const integration = await db.getIntegration(
        interaction.guild.id,
        "github"
      );

      if (!integration?.enabled) {
        return interaction.reply({
          content: "❌ GitHub integration is not connected",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🐙 GitHub Integration Status")
        .addFields(
          {
            name: "Repository",
            value: integration.repository,
            inline: true,
          },
          {
            name: "Notification Channel",
            value: `<#${integration.notification_channel}>`,
            inline: true,
          }
        )
        .setColor(0x238636);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

