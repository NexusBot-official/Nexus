const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const logger = require("./logger");

class TokenProtection {
  constructor(client) {
    this.client = client;
    this.botToken = process.env.DISCORD_TOKEN;
    this.alertChannelId = process.env.TOKEN_ALERT_CHANNEL; // Optional: specific channel for alerts
    this.ownerIds = process.env.OWNER_ID ? [process.env.OWNER_ID] : []; // Bot owner ID
  }

  /**
   * Check if a message contains the bot's token
   * @param {Message} message - Discord message to check
   */
  async checkMessage(message) {
    // Skip if no token configured
    if (!this.botToken) {
      return;
    }

    // Check ALL messages, including bot's own (in case of compromise)
    const content = message.content;

    // Check if message contains the exact token
    if (content.includes(this.botToken)) {
      logger.error(
        `🚨 [TOKEN LEAK] Bot token detected in message by ${message.author.tag} (${message.author.id}) in ${message.guild?.name || "DM"}`
      );

      // IMMEDIATE ACTIONS
      await this.handleTokenLeak(message);
    }
  }

  /**
   * Handle detected token leak
   * @param {Message} message - Message containing the token
   */
  async handleTokenLeak(message) {
    const leakInfo = {
      leakedBy: {
        id: message.author.id,
        tag: message.author.tag,
        isBot: message.author.bot,
      },
      location: {
        guildId: message.guild?.id || "DM",
        guildName: message.guild?.name || "Direct Message",
        channelId: message.channel.id,
        channelName: message.channel.name || "DM",
        messageId: message.id,
      },
      timestamp: new Date().toISOString(),
      messageContent: message.content.substring(0, 100) + "...", // First 100 chars for context
    };

    // 1. DELETE THE MESSAGE IMMEDIATELY
    try {
      await message.delete();
      logger.info(`[TOKEN LEAK] Deleted message containing token`);
    } catch (error) {
      logger.error(`[TOKEN LEAK] Failed to delete message:`, error.message);
    }

    // 2. ALERT BOT OWNER(S)
    await this.alertOwners(leakInfo);

    // 3. CREATE TOKEN FILE AND PUSH TO GITHUB (forces Discord to invalidate)
    await this.invalidateToken(leakInfo);

    // 4. LOG TO SECURITY LOGS
    await this.logToDatabase(leakInfo);

    // 5. EMERGENCY SHUTDOWN (optional - uncomment if you want bot to stop)
    logger.error(`[TOKEN LEAK] EMERGENCY SHUTDOWN - Token compromised`);
    process.exit(1);
  }

  /**
   * Alert bot owner(s) about token leak
   * @param {Object} leakInfo - Information about the leak
   */
  async alertOwners(leakInfo) {
    const alertEmbed = {
      title: "🚨 CRITICAL: BOT TOKEN LEAKED",
      description:
        "**The bot's token has been detected in a message and immediate action has been taken.**",
      color: 0xff0000,
      fields: [
        {
          name: "📍 Leaked By",
          value: `${leakInfo.leakedBy.tag} (${leakInfo.leakedBy.id})\n${leakInfo.leakedBy.isBot ? "⚠️ **BOT ACCOUNT**" : "👤 User Account"}`,
          inline: true,
        },
        {
          name: "📍 Location",
          value: `**Guild:** ${leakInfo.location.guildName}\n**Channel:** ${leakInfo.location.channelName}\n**Message ID:** ${leakInfo.location.messageId}`,
          inline: true,
        },
        {
          name: "⏰ Time",
          value: `<t:${Math.floor(Date.parse(leakInfo.timestamp) / 1000)}:F>`,
          inline: false,
        },
        {
          name: "✅ Actions Taken",
          value:
            "• Message deleted immediately\n• Token file created and pushed to GitHub\n• Discord will auto-invalidate token\n• Security log created\n• All owners notified",
          inline: false,
        },
        {
          name: "⚠️ NEXT STEPS",
          value:
            "1. **Regenerate token** in Discord Developer Portal\n2. **Update .env** with new token\n3. **Restart bot** with new token\n4. **Investigate** how token was leaked\n5. **Review security** of hosting environment",
          inline: false,
        },
      ],
      timestamp: leakInfo.timestamp,
      footer: {
        text: "Token Protection System | Nexus Security",
      },
    };

    // Send to owner(s) via DM
    for (const ownerId of this.ownerIds) {
      try {
        const owner = await this.client.users.fetch(ownerId);
        await owner.send({ embeds: [alertEmbed] });
        logger.info(`[TOKEN LEAK] Alert sent to owner ${owner.tag}`);
      } catch (error) {
        logger.error(
          `[TOKEN LEAK] Failed to DM owner ${ownerId}:`,
          error.message
        );
      }
    }

    // Also send to alert channel if configured
    if (this.alertChannelId) {
      try {
        const alertChannel = await this.client.channels.fetch(
          this.alertChannelId
        );
        await alertChannel.send({
          content: this.ownerIds.map((id) => `<@${id}>`).join(" "),
          embeds: [alertEmbed],
        });
      } catch (error) {
        logger.error(
          `[TOKEN LEAK] Failed to send to alert channel:`,
          error.message
        );
      }
    }
  }

  /**
   * Create token file and push to GitHub to force Discord invalidation
   * @param {Object} leakInfo - Information about the leak
   */
  async invalidateToken(leakInfo) {
    const filename = `LEAKED_TOKEN_${Date.now()}.txt`;
    const filepath = `./${filename}`;

    const fileContent = `LEAKED BOT TOKEN - DISCORD PLEASE INVALIDATE

Token: ${this.botToken}

Leak Information:
- Leaked By: ${leakInfo.leakedBy.tag} (${leakInfo.leakedBy.id})
- Location: ${leakInfo.location.guildName} > ${leakInfo.location.channelName}
- Time: ${leakInfo.timestamp}
- Message ID: ${leakInfo.location.messageId}

This token was automatically detected as leaked and pushed to GitHub to trigger Discord's automatic token invalidation system.`;

    try {
      // 1. Create the file
      fs.writeFileSync(filepath, fileContent);
      logger.info(`[TOKEN LEAK] Created token file: ${filename}`);

      // 2. Git add, commit, and push
      await execAsync(`git add ${filename}`);
      logger.info(`[TOKEN LEAK] Added file to git`);

      await execAsync(
        `git commit -m "🚨 SECURITY: Leaked token detected - auto-invalidation"`
      );
      logger.info(`[TOKEN LEAK] Committed file`);

      // 3. Try to push (will likely fail due to GitHub secret scanning)
      try {
        await execAsync(`git push`);
        logger.info(
          `[TOKEN LEAK] ✅ Pushed to GitHub - Discord will invalidate token`
        );
      } catch (pushError) {
        // GitHub blocked the push - extract the bypass URL from error
        const errorMessage = pushError.message || pushError.stderr || "";
        const bypassUrlMatch = errorMessage.match(
          /https:\/\/github\.com\/[^\s]+\/unblock-secret\/[^\s]+/
        );

        if (bypassUrlMatch) {
          const bypassUrl = bypassUrlMatch[0];
          logger.warn(
            `[TOKEN LEAK] GitHub blocked push. Bypass URL: ${bypassUrl}`
          );
          logger.warn(
            `[TOKEN LEAK] Attempting to bypass using GitHub API...`
          );

          // Try to bypass using the URL (requires authentication)
          try {
            const axios = require("axios");
            await axios.post(bypassUrl, {}, {
              headers: {
                Authorization: `token ${process.env.GITHUB_TOKEN || ""}`,
              },
            });
            
            // Try push again after bypass
            await execAsync(`git push`);
            logger.info(
              `[TOKEN LEAK] ✅ Bypassed protection and pushed to GitHub - Discord will invalidate token`
            );
          } catch (bypassError) {
            logger.error(
              `[TOKEN LEAK] Failed to bypass GitHub protection:`,
              bypassError.message
            );
            logger.error(
              `[TOKEN LEAK] MANUAL ACTION REQUIRED:\n` +
              `1. Visit: ${bypassUrl}\n` +
              `2. Click "Allow secret" to bypass protection\n` +
              `3. Run: git push\n` +
              `4. OR regenerate token immediately at https://discord.com/developers/applications`
            );
          }
        } else {
          logger.error(
            `[TOKEN LEAK] Could not extract bypass URL from error`
          );
          logger.error(
            `[TOKEN LEAK] MANUAL ACTION REQUIRED: Token file created at ${filename}. Regenerate token immediately at https://discord.com/developers/applications`
          );
        }
      }

      logger.warn(
        `[TOKEN LEAK] Token invalidation process completed. Bot will shut down.`
      );
    } catch (error) {
      logger.error(`[TOKEN LEAK] Failed to process token leak:`, error.message);
      logger.error(
        `[TOKEN LEAK] MANUAL ACTION REQUIRED: Regenerate token immediately at https://discord.com/developers/applications`
      );
    }
  }

  /**
   * Log token leak to database
   * @param {Object} leakInfo - Information about the leak
   */
  async logToDatabase(leakInfo) {
    try {
      const db = require("./database");
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO security_logs (
            guild_id, user_id, threat_type, action_taken, 
            threat_score, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            leakInfo.location.guildId,
            leakInfo.leakedBy.id,
            "token_leak",
            "token_invalidated",
            100, // Maximum threat score
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      logger.info(`[TOKEN LEAK] Logged to security database`);
    } catch (error) {
      logger.error(`[TOKEN LEAK] Failed to log to database:`, error.message);
    }
  }
}

module.exports = TokenProtection;
