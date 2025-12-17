// Webhook Integration Hub
// Send events to external services for custom integrations

const axios = require("axios");
const logger = require("./logger");
const db = require("./database");

class WebhookHub {
  constructor() {
    // Defer table creation to ensure database is ready
    setImmediate(() => {
      this.createTable();
    });
  }

  createTable() {
    if (!db.db) {
      // Database not ready yet, retry
      setTimeout(() => this.createTable(), 100);
      return;
    }
    db.db.run(`
      CREATE TABLE IF NOT EXISTS webhook_integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        webhook_url TEXT NOT NULL,
        events TEXT NOT NULL,
        name TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        last_triggered INTEGER,
        trigger_count INTEGER DEFAULT 0
      )
    `);
  }

  /**
   * Register a new webhook integration
   */
  async registerWebhook(guildId, webhookUrl, events, name) {
    // SECURITY FIX: Validate webhook URL to prevent SSRF
    try {
      const url = new URL(webhookUrl);
      
      // Only allow HTTPS (prevent SSRF to internal services)
      if (url.protocol !== "https:") {
        throw new Error("Webhook URL must use HTTPS protocol");
      }
      
      // Block private/internal IP addresses (SSRF protection)
      const hostname = url.hostname.toLowerCase();
      const privateIPPatterns = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^::1$/,
        /^localhost$/,
        /^0\.0\.0\.0$/,
      ];
      
      if (privateIPPatterns.some(pattern => pattern.test(hostname))) {
        throw new Error("Webhook URL cannot point to private/internal addresses");
      }
      
      // Block metadata endpoints (AWS, GCP, Azure)
      if (hostname.includes("metadata") || hostname.includes("169.254")) {
        throw new Error("Invalid webhook URL");
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("Invalid webhook URL format");
      }
      throw error;
    }

    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO webhook_integrations (guild_id, webhook_url, events, name) VALUES (?, ?, ?, ?)`,
        [guildId, webhookUrl, JSON.stringify(events), name],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Send event to all registered webhooks
   */
  async triggerEvent(guildId, eventType, eventData) {
    try {
      const webhooks = await this.getWebhooks(guildId);

      for (const webhook of webhooks) {
        if (!webhook.enabled) {
          continue;
        }

        const events = JSON.parse(webhook.events);
        if (!events.includes(eventType)) {
          continue;
        }

        // SECURITY FIX: Validate URL again before making request (defense in depth)
        let url;
        try {
          url = new URL(webhook.webhook_url);
          
          // Only allow HTTPS
          if (url.protocol !== "https:") {
            logger.warn("Webhook Hub", `Blocked non-HTTPS webhook: ${webhook.webhook_url}`);
            continue;
          }

          // Block private/internal IP addresses (SSRF protection)
          const hostname = url.hostname.toLowerCase();
          const privateIPPatterns = [
            /^127\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^169\.254\./,
            /^::1$/,
            /^localhost$/,
            /^0\.0\.0\.0$/,
          ];
          
          if (privateIPPatterns.some(pattern => pattern.test(hostname)) || 
              hostname.includes("metadata") || hostname.includes("169.254")) {
            logger.warn("Webhook Hub", `Blocked SSRF attempt: ${webhook.webhook_url}`);
            continue;
          }
        } catch (error) {
          logger.warn("Webhook Hub", `Blocked invalid webhook URL during send: ${webhook.webhook_url}`);
          continue; // Skip this webhook
        }

        // Send webhook
        try {
          await axios.post(
            webhook.webhook_url,
            {
              event: eventType,
              guildId,
              timestamp: Date.now(),
              data: eventData,
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
              timeout: 5000,
            }
          );

          // Update trigger count
          await this.updateTriggerCount(webhook.id);

          logger.info(
            "Webhook Hub",
            `Triggered: ${webhook.name} for ${eventType}`
          );
        } catch (error) {
          logger.error(
            "Webhook Hub",
            `Failed to send to ${webhook.name}`,
            error
          );
        }
      }
    } catch (error) {
      logger.error("Webhook Hub", "Error triggering event", error);
    }
  }

  /**
   * Get all webhooks for a guild
   */
  async getWebhooks(guildId) {
    return new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM webhook_integrations WHERE guild_id = ?",
        [guildId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "DELETE FROM webhook_integrations WHERE id = ?",
        [id],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ deleted: this.changes > 0 });
          }
        }
      );
    });
  }

  /**
   * Toggle webhook enabled status
   */
  async toggleWebhook(id) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE webhook_integrations SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?",
        [id],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ updated: this.changes > 0 });
          }
        }
      );
    });
  }

  async updateTriggerCount(id) {
    return new Promise((resolve, reject) => {
      db.db.run(
        "UPDATE webhook_integrations SET trigger_count = trigger_count + 1, last_triggered = ? WHERE id = ?",
        [Date.now(), id],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Available event types
   */
  getAvailableEvents() {
    return [
      "member.join",
      "member.leave",
      "member.ban",
      "member.kick",
      "raid.detected",
      "nuke.detected",
      "threat.high",
      "server.health.critical",
      "command.executed",
      "config.changed",
    ];
  }
}

module.exports = new WebhookHub();
