const {
  AutoModerationRuleTriggerType,
  AutoModerationRuleEventType,
  AutoModerationActionType,
} = require("discord.js");
const logger = require("./logger");

/**
 * Discord AutoMod Integration
 *
 * Manages Discord's native AutoModeration rules via Discord.js v14 API
 * This complements Nexus Bot's custom automod system
 */
class DiscordAutoMod {
  /**
   * Get all AutoMod rules for a guild
   */
  static async getRules(guild) {
    try {
      const rules = await guild.autoModerationRules.fetch();
      return Array.from(rules.values());
    } catch (error) {
      logger.error(
        "DiscordAutoMod",
        `Failed to fetch rules for ${guild.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get a specific AutoMod rule by ID
   */
  static async getRule(guild, ruleId) {
    try {
      return await guild.autoModerationRules.fetch(ruleId);
    } catch (error) {
      logger.error("DiscordAutoMod", `Failed to fetch rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new AutoMod rule
   *
   * @param {Guild} guild - The Discord guild
   * @param {Object} options - Rule configuration
   * @param {string} options.name - Rule name
   * @param {string} options.triggerType - 'keyword', 'spam', 'keyword_preset', 'mention_spam'
   * @param {string} options.eventType - 'message_send'
   * @param {Object} options.triggerMetadata - Trigger-specific metadata
   * @param {Array} options.actions - Array of action objects
   * @param {boolean} options.enabled - Whether rule is enabled
   * @param {Array<string>} options.exemptRoles - Role IDs exempt from rule
   * @param {Array<string>} options.exemptChannels - Channel IDs exempt from rule
   */
  static async createRule(guild, options) {
    try {
      // Map trigger type string to enum
      const triggerTypeMap = {
        keyword: AutoModerationRuleTriggerType.Keyword,
        spam: AutoModerationRuleTriggerType.Spam,
        keyword_preset: AutoModerationRuleTriggerType.KeywordPreset,
        mention_spam: AutoModerationRuleTriggerType.MentionSpam,
      };

      // Map event type string to enum
      const eventTypeMap = {
        message_send: AutoModerationRuleEventType.MessageSend,
      };

      // Map action type string to enum
      const actionTypeMap = {
        block_message: AutoModerationActionType.BlockMessage,
        send_alert: AutoModerationActionType.SendAlertMessage,
        timeout: AutoModerationActionType.Timeout,
      };

      const ruleOptions = {
        name: options.name,
        eventType:
          eventTypeMap[options.eventType] ||
          AutoModerationRuleEventType.MessageSend,
        triggerType:
          triggerTypeMap[options.triggerType] ||
          AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: options.triggerMetadata || {},
        actions: (options.actions || []).map((action) => ({
          type:
            actionTypeMap[action.type] || AutoModerationActionType.BlockMessage,
          metadata: action.metadata || {},
        })),
        enabled: options.enabled !== false,
        exemptRoles: options.exemptRoles || [],
        exemptChannels: options.exemptChannels || [],
      };

      const rule = await guild.autoModerationRules.create(ruleOptions);
      logger.info(
        "DiscordAutoMod",
        `Created AutoMod rule "${rule.name}" (${rule.id}) in ${guild.name}`
      );
      return rule;
    } catch (error) {
      logger.error(
        "DiscordAutoMod",
        `Failed to create rule in ${guild.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Edit an existing AutoMod rule
   */
  static async editRule(guild, ruleId, options) {
    try {
      const rule = await guild.autoModerationRules.fetch(ruleId);

      const updateData = {};
      if (options.name !== undefined) {
        updateData.name = options.name;
      }
      if (options.enabled !== undefined) {
        updateData.enabled = options.enabled;
      }
      if (options.exemptRoles !== undefined) {
        updateData.exemptRoles = options.exemptRoles;
      }
      if (options.exemptChannels !== undefined) {
        updateData.exemptChannels = options.exemptChannels;
      }
      if (options.triggerMetadata !== undefined) {
        updateData.triggerMetadata = options.triggerMetadata;
      }
      if (options.actions !== undefined) {
        const actionTypeMap = {
          block_message: AutoModerationActionType.BlockMessage,
          send_alert: AutoModerationActionType.SendAlertMessage,
          timeout: AutoModerationActionType.Timeout,
        };
        updateData.actions = options.actions.map((action) => ({
          type:
            actionTypeMap[action.type] || AutoModerationActionType.BlockMessage,
          metadata: action.metadata || {},
        }));
      }

      const updatedRule = await rule.edit(updateData);
      logger.info(
        "DiscordAutoMod",
        `Updated AutoMod rule "${updatedRule.name}" (${updatedRule.id}) in ${guild.name}`
      );
      return updatedRule;
    } catch (error) {
      logger.error("DiscordAutoMod", `Failed to edit rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Delete an AutoMod rule
   */
  static async deleteRule(guild, ruleId) {
    try {
      const rule = await guild.autoModerationRules.fetch(ruleId);
      await rule.delete();
      logger.info(
        "DiscordAutoMod",
        `Deleted AutoMod rule "${rule.name}" (${rule.id}) from ${guild.name}`
      );
      return true;
    } catch (error) {
      logger.error("DiscordAutoMod", `Failed to delete rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Enable/disable a rule
   */
  static async toggleRule(guild, ruleId, enabled) {
    try {
      const rule = await guild.autoModerationRules.fetch(ruleId);
      return await rule.edit({ enabled });
    } catch (error) {
      logger.error("DiscordAutoMod", `Failed to toggle rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Convert Discord.js AutoMod rule to JSON-friendly format for dashboard
   */
  static formatRuleForDashboard(rule) {
    return {
      id: rule.id,
      guildId: rule.guildId,
      name: rule.name,
      creatorId: rule.creatorId,
      eventType: rule.eventType,
      triggerType: rule.triggerType,
      triggerMetadata: rule.triggerMetadata,
      actions: rule.actions.map((action) => ({
        type: action.type,
        metadata: action.metadata,
      })),
      enabled: rule.enabled,
      exemptRoles: rule.exemptRoles,
      exemptChannels: rule.exemptChannels,
      createdAt: rule.createdTimestamp,
    };
  }
}

module.exports = DiscordAutoMod;
