const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const wordFilter = require("../utils/wordFilter");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("wordfilter")
    .setDescription("Configure word filtering to block offensive content")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a word to the blacklist")
        .addStringOption((option) =>
          option
            .setName("word")
            .setDescription("Word or phrase to blacklist")
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a word from the blacklist")
        .addStringOption((option) =>
          option
            .setName("word")
            .setDescription("Word or phrase to remove")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("View all blacklisted words")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("test")
        .setDescription("Test if a message would be blocked")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Message to test")
            .setRequired(true)
            .setMaxLength(500)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("enable").setDescription("Enable word filtering")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Disable word filtering")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("action")
        .setDescription("Set action taken when blacklisted word is detected")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Action to take")
            .setRequired(true)
            .addChoices(
              { name: "Delete Message", value: "delete" },
              { name: "Delete & Warn", value: "warn" },
              { name: "Delete & Timeout (10min)", value: "timeout" },
              { name: "Delete & Kick", value: "kick" },
              { name: "Delete & Ban", value: "ban" }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "add":
          await this.handleAdd(interaction);
          break;
        case "remove":
          await this.handleRemove(interaction);
          break;
        case "list":
          await this.handleList(interaction);
          break;
        case "test":
          await this.handleTest(interaction);
          break;
        case "enable":
          await this.handleEnable(interaction);
          break;
        case "disable":
          await this.handleDisable(interaction);
          break;
        case "action":
          await this.handleAction(interaction);
          break;
      }
    } catch (error) {
      logger.error("WordFilter", "Command execution error", error);
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  async handleAdd(interaction) {
    const word = interaction.options.getString("word").trim().toLowerCase();

    if (word.length === 0) {
      return interaction.reply({
        content: "❌ Word cannot be empty!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Get current blacklist
    const config = await db.getServerConfig(interaction.guild.id);
    const currentBlacklist = config?.blacklisted_words
      ? JSON.parse(config.blacklisted_words)
      : [];

    // Check if already exists
    if (currentBlacklist.includes(word)) {
      return interaction.reply({
        content: `❌ \`${word}\` is already in the blacklist!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Add to blacklist
    currentBlacklist.push(word);
    await db.setServerConfig(interaction.guild.id, {
      blacklisted_words: JSON.stringify(currentBlacklist),
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Word Added to Blacklist")
      .setDescription(`\`${word}\` has been added to the word filter.`)
      .addFields({
        name: "Detection",
        value:
          "This word will be detected even with:\n• Spacing variations (b a d w o r d)\n• Case variations (BadWord, BADWORD)\n• Leetspeak (b4dw0rd)\n• Font variations (Unicode fonts)\n• Special characters",
        inline: false,
      })
      .setColor(0x00ff00)
      .setFooter({
        text: `Total blacklisted words: ${currentBlacklist.length}`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async handleRemove(interaction) {
    const word = interaction.options.getString("word").trim().toLowerCase();

    // Get current blacklist
    const config = await db.getServerConfig(interaction.guild.id);
    const currentBlacklist = config?.blacklisted_words
      ? JSON.parse(config.blacklisted_words)
      : [];

    // Check if exists
    if (!currentBlacklist.includes(word)) {
      return interaction.reply({
        content: `❌ \`${word}\` is not in the blacklist!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Remove from blacklist
    const updatedBlacklist = currentBlacklist.filter((w) => w !== word);
    await db.setServerConfig(interaction.guild.id, {
      blacklisted_words: JSON.stringify(updatedBlacklist),
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Word Removed from Blacklist")
      .setDescription(`\`${word}\` has been removed from the word filter.`)
      .setColor(0x00ff00)
      .setFooter({
        text: `Total blacklisted words: ${updatedBlacklist.length}`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async handleList(interaction) {
    const config = await db.getServerConfig(interaction.guild.id);
    const blacklist = config?.blacklisted_words
      ? JSON.parse(config.blacklisted_words)
      : [];
    const enabled = config?.word_filter_enabled !== 0;
    const action = config?.word_filter_action || "delete";

    if (blacklist.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("📝 Word Filter Blacklist")
        .setDescription(
          "No server-specific words are currently blacklisted.\n\n⚠️ **Default blacklist is always active** (common slurs and offensive terms)."
        )
        .addFields({
          name: "Status",
          value: enabled
            ? "✅ Enabled"
            : "❌ Disabled\n(Default blacklist still active)",
          inline: true,
        })
        .addFields({
          name: "Action",
          value: this.formatAction(action),
          inline: true,
        })
        .setColor(0x0099ff)
        .setFooter({ text: "Use /wordfilter add to add server-specific words" })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Paginate if too many words
    const wordsPerPage = 20;
    const pages = Math.ceil(blacklist.length / wordsPerPage);
    const page = 1; // Could add pagination later

    const start = (page - 1) * wordsPerPage;
    const end = start + wordsPerPage;
    const pageWords = blacklist.slice(start, end);

    const embed = new EmbedBuilder()
      .setTitle("📝 Word Filter Blacklist")
      .setDescription(
        pageWords.map((w, i) => `${start + i + 1}. \`${w}\``).join("\n")
      )
      .addFields({
        name: "Status",
        value: enabled ? "✅ Enabled" : "❌ Disabled",
        inline: true,
      })
      .addFields({
        name: "Action",
        value: this.formatAction(action),
        inline: true,
      })
      .addFields({
        name: "Total Words",
        value: `${blacklist.length}`,
        inline: true,
      })
      .setColor(0x0099ff)
      .setFooter({
        text:
          pages > 1
            ? `Page ${page}/${pages}`
            : `Total: ${blacklist.length} words`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async handleTest(interaction) {
    const message = interaction.options.getString("message");
    const config = await db.getServerConfig(interaction.guild.id);
    const serverBlacklist = config?.blacklisted_words
      ? JSON.parse(config.blacklisted_words)
      : [];

    // Test with both default and server blacklist
    const result = wordFilter.checkText(message, serverBlacklist, true);

    const embed = new EmbedBuilder()
      .setTitle("🧪 Word Filter Test")
      .setDescription(`**Test Message:**\n\`\`\`${message}\`\`\``)
      .addFields({
        name: "Result",
        value: result.detected
          ? `❌ **BLOCKED** - Detected: \`${result.word}\`\nMethod: ${this.formatMethod(result.method)}\n${result.isDefault ? "⚠️ Default blacklist (always active)" : "📝 Server blacklist"}`
          : "✅ **ALLOWED** - No blacklisted words detected",
        inline: false,
      })
      .setColor(result.detected ? 0xff0000 : 0x00ff00)
      .setFooter({
        text: result.detected
          ? result.isDefault
            ? "Default blacklist violations are always deleted"
            : "Server blacklist uses configured action"
          : "Default blacklist is always active",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async handleEnable(interaction) {
    await db.setServerConfig(interaction.guild.id, {
      word_filter_enabled: 1,
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Word Filter Enabled")
      .setDescription(
        "Word filtering is now active. Blacklisted words will be detected and action will be taken."
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async handleDisable(interaction) {
    await db.setServerConfig(interaction.guild.id, {
      word_filter_enabled: 0,
    });

    const embed = new EmbedBuilder()
      .setTitle("❌ Word Filter Disabled")
      .setDescription(
        "Word filtering is now inactive. Blacklisted words will not be checked."
      )
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async handleAction(interaction) {
    const action = interaction.options.getString("type");

    await db.setServerConfig(interaction.guild.id, {
      word_filter_action: action,
    });

    const embed = new EmbedBuilder()
      .setTitle("✅ Action Updated")
      .setDescription(
        `When a blacklisted word is detected, the bot will: **${this.formatAction(action)}**`
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  formatAction(action) {
    const actions = {
      delete: "Delete Message",
      warn: "Delete & Warn User",
      timeout: "Delete & Timeout (10min)",
      kick: "Delete & Kick User",
      ban: "Delete & Ban User",
    };
    return actions[action] || action;
  },

  formatMethod(method) {
    const methods = {
      normalized_match: "Normalized Match",
      case_insensitive: "Case Insensitive",
      spacing_variation: "Spacing Variation",
      case_variation: "Case Variation (CamelCase/PascalCase)",
      separator_variation: "Separator Variation",
      leetspeak: "Leetspeak Detection",
      repeated_chars: "Repeated Characters",
      font_variation: "Font Variation (Unicode fonts)",
    };
    return methods[method] || method;
  },
};
