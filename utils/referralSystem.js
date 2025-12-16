const db = require("./database");
const logger = require("./logger");

/**
 * Referral System
 * Viral growth through server invites
 * Unlock premium features by inviting Nexus to multiple servers
 */
class ReferralSystem {
  constructor(client) {
    this.client = client;
    this.referralCodes = new Map(); // userId -> referralCode
    this.rewards = this.defineRewards();
  }

  /**
   * Define reward tiers
   */
  defineRewards() {
    return {
      tier1: {
        requiredReferrals: 5,
        rewards: [
          "Priority support response",
          "Custom bot status",
          "Early access to new features",
        ],
        badge: "🥉 Bronze Supporter",
      },
      tier2: {
        requiredReferrals: 15,
        rewards: [
          "All Tier 1 rewards",
          "Faster snapshot intervals (30min)",
          "Advanced analytics access",
          "Custom branding options",
        ],
        badge: "🥈 Silver Supporter",
      },
      tier3: {
        requiredReferrals: 50,
        rewards: [
          "All Tier 2 rewards",
          "Dedicated support channel",
          "API rate limit increase (10x)",
          "Feature request priority",
          "Listed as top contributor",
        ],
        badge: "🥇 Gold Supporter",
      },
      tier4: {
        requiredReferrals: 100,
        rewards: [
          "All Tier 3 rewards",
          "Lifetime premium features",
          "Custom feature development",
          "Listed in credits",
          "Direct developer access",
        ],
        badge: "💎 Diamond Supporter",
      },
    };
  }

  /**
   * Generate unique referral code for user
   */
  generateReferralCode(userId) {
    // Use user ID + random string for uniqueness
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `NXS-${userId.substring(0, 8)}-${randomPart}`;
  }

  /**
   * Get or create referral code for user
   */
  async getReferralCode(userId) {
    // Check cache
    if (this.referralCodes.has(userId)) {
      return this.referralCodes.get(userId);
    }

    // Check database
    const existing = await new Promise((resolve, reject) => {
      db.db.get(
        `SELECT referral_code FROM user_referrals WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.referral_code || null);
          }
        }
      );
    });

    if (existing) {
      this.referralCodes.set(userId, existing);
      return existing;
    }

    // Generate new code
    const code = this.generateReferralCode(userId);

    // Store in database
    await new Promise((resolve, reject) => {
      db.db.run(
        `INSERT INTO user_referrals (user_id, referral_code, created_at) VALUES (?, ?, ?)`,
        [userId, code, Date.now()],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    this.referralCodes.set(userId, code);
    return code;
  }

  /**
   * Record a referral when bot joins new server
   */
  async recordReferral(guildId, referralCode) {
    try {
      // Find referrer by code
      const referrer = await new Promise((resolve, reject) => {
        db.db.get(
          `SELECT user_id FROM user_referrals WHERE referral_code = ?`,
          [referralCode],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row?.user_id || null);
            }
          }
        );
      });

      if (!referrer) {
        logger.warn("Referral", `Invalid referral code: ${referralCode}`);
        return false;
      }

      // Record the referral
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO referral_history (referrer_id, guild_id, referral_code, created_at) VALUES (?, ?, ?, ?)`,
          [referrer, guildId, referralCode, Date.now()],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // Update referral count
      await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE user_referrals SET total_referrals = total_referrals + 1 WHERE user_id = ?`,
          [referrer],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      logger.success(
        "Referral",
        `User ${referrer} earned a referral for guild ${guildId}`
      );

      // Check if user unlocked new tier
      await this.checkTierUnlock(referrer);

      return true;
    } catch (error) {
      logger.error("Referral", "Failed to record referral", error);
      return false;
    }
  }

  /**
   * Check if user unlocked a new tier
   */
  async checkTierUnlock(userId) {
    const stats = await this.getUserStats(userId);
    const newTier = this.getTier(stats.totalReferrals);

    if (newTier && newTier !== stats.currentTier) {
      // Unlock new tier
      await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE user_referrals SET current_tier = ? WHERE user_id = ?`,
          [newTier, userId],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // Notify user
      await this.notifyTierUnlock(userId, newTier);

      logger.success("Referral", `User ${userId} unlocked ${newTier}!`);
    }
  }

  /**
   * Get user's referral statistics
   */
  async getUserStats(userId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        `SELECT * FROM user_referrals WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || { totalReferrals: 0, currentTier: "none" });
          }
        }
      );
    });
  }

  /**
   * Get tier based on referral count
   */
  getTier(referralCount) {
    if (referralCount >= 100) {
      return "tier4";
    }
    if (referralCount >= 50) {
      return "tier3";
    }
    if (referralCount >= 15) {
      return "tier2";
    }
    if (referralCount >= 5) {
      return "tier1";
    }
    return "none";
  }

  /**
   * Notify user of tier unlock
   */
  async notifyTierUnlock(userId, tier) {
    try {
      const user = await this.client.users.fetch(userId);
      const tierData = this.rewards[tier];

      if (user && tierData) {
        await user.send({
          embeds: [
            {
              title: `🎉 Congratulations! You unlocked ${tierData.badge}!`,
              description: `You've referred Nexus to enough servers to unlock premium rewards!`,
              fields: [
                {
                  name: "Your Rewards",
                  value: tierData.rewards.map((r) => `✅ ${r}`).join("\n"),
                },
                {
                  name: "Keep Growing!",
                  value:
                    "Invite Nexus to more servers to unlock even better rewards!",
                },
              ],
              color: 0x9333ea,
              timestamp: new Date(),
            },
          ],
        });
      }
    } catch (error) {
      logger.error("Referral", `Failed to notify ${userId}`, error);
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit = 100) {
    return new Promise((resolve, reject) => {
      db.db.all(
        `SELECT user_id, total_referrals, current_tier FROM user_referrals 
         ORDER BY total_referrals DESC LIMIT ?`,
        [limit],
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
   * Check if user has unlocked a specific reward
   */
  async hasReward(userId, rewardId) {
    const stats = await this.getUserStats(userId);
    const tier = this.getTier(stats.total_referrals || 0);

    // Check if user's tier includes this reward
    const tierData = this.rewards[tier];
    return tierData && tierData.rewards.includes(rewardId);
  }
}

module.exports = ReferralSystem;
