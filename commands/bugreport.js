const {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const logger = require("../utils/logger");

// Set your security reports channel ID here
const SECURITY_CHANNEL_ID = "1454236892538208450";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bugreport")
    .setDescription("Report a bug or security vulnerability in Nexus")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Type of report")
        .setRequired(true)
        .addChoices(
          { name: "🐛 Bug Report", value: "bug" },
          { name: "🔒 Security Vulnerability", value: "security" },
          { name: "💡 Feature Request", value: "feature" }
        )
    ),

  async execute(interaction, client) {
    const reportType = interaction.options.getString("type");

    // Create modal based on report type
    const modal = new ModalBuilder()
      .setCustomId(`report_modal_${reportType}`)
      .setTitle(
        reportType === "security"
          ? "🔒 Security Vulnerability Report"
          : reportType === "bug"
            ? "🐛 Bug Report"
            : "💡 Feature Request"
      );

    const titleInput = new TextInputBuilder()
      .setCustomId("report_title")
      .setLabel(
        reportType === "security"
          ? "Vulnerability Title"
          : reportType === "bug"
            ? "Bug Title"
            : "Feature Title"
      )
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(
        reportType === "security"
          ? "Brief description of the vulnerability"
          : reportType === "bug"
            ? "Brief description of the bug"
            : "Brief description of the feature"
      )
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId("report_description")
      .setLabel("Detailed Description")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        reportType === "security"
          ? "Describe the vulnerability, how it works, and potential impact..."
          : reportType === "bug"
            ? "Describe the bug, what happened vs what should happen..."
            : "Describe the feature and how it would work..."
      )
      .setRequired(true)
      .setMaxLength(2000);

    const stepsInput = new TextInputBuilder()
      .setCustomId("report_steps")
      .setLabel(
        reportType === "security"
          ? "Steps to Reproduce"
          : reportType === "bug"
            ? "Steps to Reproduce"
            : "Use Case"
      )
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        reportType === "security" || reportType === "bug"
          ? "1. Do this\n2. Then this\n3. Bug/vulnerability occurs"
          : "How would this feature be used? What problem does it solve?"
      )
      .setRequired(reportType === "security" || reportType === "bug")
      .setMaxLength(1000);

    const impactInput = new TextInputBuilder()
      .setCustomId("report_impact")
      .setLabel(
        reportType === "security"
          ? "Severity & Impact"
          : reportType === "bug"
            ? "Impact"
            : "Priority (Optional)"
      )
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(
        reportType === "security"
          ? "Critical/High/Medium/Low - Who is affected?"
          : reportType === "bug"
            ? "How many users/servers are affected?"
            : "How important is this feature?"
      )
      .setRequired(reportType === "security")
      .setMaxLength(200);

    const contactInput = new TextInputBuilder()
      .setCustomId("report_contact")
      .setLabel("Contact Info (Optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Discord username, email, or other contact method")
      .setRequired(false)
      .setMaxLength(100);

    const firstRow = new ActionRowBuilder().addComponents(titleInput);
    const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
    const thirdRow = new ActionRowBuilder().addComponents(stepsInput);
    const fourthRow = new ActionRowBuilder().addComponents(impactInput);
    const fifthRow = new ActionRowBuilder().addComponents(contactInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    await interaction.showModal(modal);

    // Handle modal submission
    const filter = (i) =>
      i.customId === `report_modal_${reportType}` &&
      i.user.id === interaction.user.id;

    try {
      const modalInteraction = await interaction.awaitModalSubmit({
        filter,
        time: 600000, // 10 minutes
      });

      const title = modalInteraction.fields.getTextInputValue("report_title");
      const description =
        modalInteraction.fields.getTextInputValue("report_description");
      const steps =
        modalInteraction.fields.getTextInputValue("report_steps") ||
        "Not provided";
      const impact =
        modalInteraction.fields.getTextInputValue("report_impact") ||
        "Not specified";
      const contact =
        modalInteraction.fields.getTextInputValue("report_contact") ||
        "Not provided";

      // Send confirmation to user
      const confirmEmbed = new EmbedBuilder()
        .setTitle(
          reportType === "security"
            ? "🔒 Security Report Submitted"
            : reportType === "bug"
              ? "🐛 Bug Report Submitted"
              : "💡 Feature Request Submitted"
        )
        .setDescription(
          reportType === "security"
            ? "Thank you for responsibly disclosing this security vulnerability. Our security team will review it and respond within 48 hours.\n\n**Please do not publicly disclose this vulnerability until we've had a chance to fix it.**"
            : reportType === "bug"
              ? "Thank you for reporting this bug! We'll investigate and work on a fix.\n\n**Report Details:**\n" +
                `**${title}**\n${description}`
              : "Thank you for your feature suggestion! We'll review it and consider it for future updates.\n\n**Feature Details:**\n" +
                `**${title}**\n${description}`
        )
        .setColor(
          reportType === "security"
            ? 0xff0000
            : reportType === "bug"
              ? 0xffa500
              : 0x00ff88
        )
        .setTimestamp();

      if (reportType === "security") {
        confirmEmbed.addFields({
          name: "Bug Bounty Program",
          value:
            "Valid security vulnerabilities may be eligible for rewards:\n" +
            "• **Critical**: Recognition + Special Role\n" +
            "• **High**: Recognition + Badge\n" +
            "• **Medium/Low**: Recognition\n\n" +
            "All reporters will be credited in our security hall of fame (with permission).",
        });
      }

      await modalInteraction.reply({
        embeds: [confirmEmbed],
        flags: MessageFlags.Ephemeral,
      });

      // Send to security/bug report channel
      try {
        const reportChannel = await client.channels.fetch(SECURITY_CHANNEL_ID);

        if (!reportChannel) {
          logger.error(
            "bugreport",
            `Could not find report channel with ID: ${SECURITY_CHANNEL_ID}`
          );
          return;
        }

        const reportEmbed = new EmbedBuilder()
          .setTitle(
            reportType === "security"
              ? "🔒 NEW SECURITY VULNERABILITY REPORT"
              : reportType === "bug"
                ? "🐛 NEW BUG REPORT"
                : "💡 NEW FEATURE REQUEST"
          )
          .setDescription(`**${title}**\n\n${description}`)
          .addFields(
            {
              name:
                reportType === "security" || reportType === "bug"
                  ? "Steps to Reproduce"
                  : "Use Case",
              value: steps,
            },
            {
              name:
                reportType === "security"
                  ? "Severity & Impact"
                  : reportType === "bug"
                    ? "Impact"
                    : "Priority",
              value: impact,
            },
            {
              name: "Reported By",
              value: `${interaction.user.tag} (${interaction.user.id})`,
              inline: true,
            },
            {
              name: "Server",
              value: interaction.guild.name,
              inline: true,
            },
            {
              name: "Contact Info",
              value: contact,
              inline: true,
            }
          )
          .setColor(
            reportType === "security"
              ? 0xff0000
              : reportType === "bug"
                ? 0xffa500
                : 0x9b59b6
          )
          .setTimestamp()
          .setFooter({
            text: `User ID: ${interaction.user.id}`,
            iconURL: interaction.user.displayAvatarURL(),
          });

        if (reportType === "security") {
          reportEmbed.addFields({
            name: "⚠️ SECURITY ALERT",
            value:
              "This is a security vulnerability report. Handle with care and do not publicly disclose until patched.",
          });
        }

        await reportChannel.send({
          content:
            reportType === "security"
              ? "@here **SECURITY VULNERABILITY REPORTED**"
              : undefined,
          embeds: [reportEmbed],
        });

      } catch (channelError) {
        logger.error(
          "bugreport",
          `Failed to send report to channel ${SECURITY_CHANNEL_ID}`,
          channelError
        );
      }
    } catch (error) {
      // Don't log timeout errors as they're expected when users don't complete the modal
      if (
        error.name === "InteractionCollectorError" &&
        error.reason === "time"
      ) {
        // User didn't submit the modal within 10 minutes - this is expected behavior
        return;
      }
      // Only log actual errors
      logger.error("bugreport", "Error handling report", error);
    }
  },
};
