const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const db = require("../utils/database");
const ErrorMessages = require("../utils/errorMessages");
const { encryptText, decryptText } = require("../utils/encryption");

function sanitizeInput(input, maxLength = 2000) {
  if (!input || typeof input !== "string") {
    return input;
  }
  return input
    .replace(/\0/g, "")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .trim()
    .substring(0, maxLength);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autoresponder")
    .setDescription("Manage auto-responders (auto-reply to keywords)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create an auto-responder")
        .addStringOption((option) =>
          option
            .setName("trigger")
            .setDescription("Keyword or phrase to trigger response")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("response")
            .setDescription(
              "Response message (vars: {user}, {user.tag}, {guild}, {member}, {channel}, {membercount})"
            )
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("case_sensitive")
            .setDescription("Case sensitive matching (default: false)")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete an auto-responder")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Auto-responder ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all auto-responders")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable/disable an auto-responder")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Auto-responder ID")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const triggerRaw = interaction.options.getString("trigger");
      const responseRaw = interaction.options.getString("response");
      const caseSensitive =
        interaction.options.getBoolean("case_sensitive") || false;

      const trigger = sanitizeInput(triggerRaw, 100);
      const response = sanitizeInput(responseRaw, 2000);

      if (!trigger || trigger.length === 0) {
        return interaction.reply({
          content: "❌ Trigger cannot be empty!",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!response || response.length === 0) {
        return interaction.reply({
          content: "❌ Response cannot be empty!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO auto_responders (guild_id, trigger, response, case_sensitive, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            interaction.guild.id,
            trigger,
            encryptText(response), // Encrypt response
            caseSensitive ? 1 : 0,
            interaction.user.id,
            Date.now(),
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Auto-Responder Created")
        .setDescription(
          `**Trigger:** \`${trigger}\`\n**Response:** ${response.slice(
            0,
            200
          )}${response.length > 200 ? "..." : ""}\n**Case Sensitive:** ${
            caseSensitive ? "Yes" : "No"
          }`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "delete") {
      const id = interaction.options.getInteger("id");

      const result = await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM auto_responders WHERE guild_id = ? AND id = ?",
          [interaction.guild.id, id],
          function (err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.changes);
            }
          }
        );
      });

      if (result === 0) {
        return interaction.reply({
          content: "❌ Auto-responder not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        content: `✅ Auto-responder #${id} deleted!`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (subcommand === "list") {
      const responders = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM auto_responders WHERE guild_id = ? ORDER BY created_at DESC",
          [interaction.guild.id],
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows || []);
            }
          }
        );
      });

      if (responders.length === 0) {
        return interaction.reply({
          content: "❌ No auto-responders found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🤖 Auto-Responders")
        .setDescription(
          responders
            .map((r) => {
              const decryptedResponse = decryptText(r.response); // Decrypt for display
              return (
                `**ID:** ${r.id} ${r.enabled ? "✅" : "❌"}\n` +
                `**Trigger:** \`${r.trigger}\`\n` +
                `**Response:** ${decryptedResponse.slice(0, 100)}${
                  decryptedResponse.length > 100 ? "..." : ""
                }\n` +
                `**Case Sensitive:** ${r.case_sensitive ? "Yes" : "No"}`
              );
            })
            .join("\n\n")
        )
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "toggle") {
      const id = interaction.options.getInteger("id");

      const responder = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM auto_responders WHERE guild_id = ? AND id = ?",
          [interaction.guild.id, id],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          }
        );
      });

      if (!responder) {
        return interaction.reply({
          content: "❌ Auto-responder not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const newStatus = responder.enabled ? 0 : 1;

      await new Promise((resolve, reject) => {
        db.db.run(
          "UPDATE auto_responders SET enabled = ? WHERE guild_id = ? AND id = ?",
          [newStatus, interaction.guild.id, id],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      await interaction.reply({
        content: `✅ Auto-responder #${id} ${
          newStatus ? "enabled" : "disabled"
        }!`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

function sanitizeResponse(response, messageObj) {
  if (!response || typeof response !== "string") {
    return response;
  }

  const MAX_LENGTH = 2000;

  const sanitizeString = (str) => {
    return str
      .replace(/\0/g, "")
      .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
      .trim();
  };

  // SECURITY FIX: Removed dangerous template expression evaluation
  // Now only supports safe variable replacements using predefined patterns
  let processed = response;

  // Safe variable replacements (no code execution)
  if (messageObj && typeof messageObj === "object") {
    // Replace {user} with user mention
    processed = processed.replace(
      /{user}/g,
      `<@${messageObj.author?.id || ""}>`
    );

    // Replace {user.tag} with user tag
    processed = processed.replace(
      /{user\.tag}/g,
      messageObj.author?.tag || "Unknown"
    );

    // Replace {user.id} with user ID
    processed = processed.replace(/{user\.id}/g, messageObj.author?.id || "");

    // Replace {user.name} with username
    processed = processed.replace(
      /{user\.name}/g,
      messageObj.author?.username || "Unknown"
    );

    // Replace {guild} with guild name
    processed = processed.replace(
      /{guild}/g,
      messageObj.guild?.name || "Unknown Server"
    );

    // Replace {guild.id} with guild ID
    processed = processed.replace(/{guild\.id}/g, messageObj.guild?.id || "");

    // Replace {member} with member display name
    processed = processed.replace(
      /{member}/g,
      messageObj.member?.displayName || messageObj.author?.username || "Unknown"
    );

    // Replace {channel} with channel mention
    processed = processed.replace(
      /{channel}/g,
      `<#${messageObj.channel?.id || ""}>`
    );

    // Replace {channel.name} with channel name
    processed = processed.replace(
      /{channel\.name}/g,
      messageObj.channel?.name || "Unknown"
    );

    // Replace {membercount} with member count
    processed = processed.replace(
      /{membercount}/g,
      String(messageObj.guild?.memberCount || 0)
    );
  }

  // Remove any remaining ${...} patterns (security: prevent any code execution attempts)
  processed = processed.replace(/\$\{[^}]+\}/g, "");

  processed = sanitizeString(processed);

  if (processed.length > MAX_LENGTH) {
    processed = processed.substring(0, MAX_LENGTH);
  }

  return processed;
}

module.exports.checkAutoResponder = async (message) => {
  const responders = await new Promise((resolve, reject) => {
    db.db.all(
      "SELECT * FROM auto_responders WHERE guild_id = ? AND enabled = 1",
      [message.guild.id],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });

  for (const responder of responders) {
    const trigger = responder.trigger;
    const messageContent = responder.case_sensitive
      ? message.content
      : message.content.toLowerCase();
    const triggerLower = responder.case_sensitive
      ? trigger
      : trigger.toLowerCase();

    if (messageContent.includes(triggerLower)) {
      const decryptedResponse = decryptText(responder.response); // Decrypt response
      const sanitized = sanitizeResponse(decryptedResponse, message);
      await message.reply(sanitized);
      return true;
    }
  }

  return false;
};
