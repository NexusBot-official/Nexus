// Input validation and sanitization for security
// Consolidated validation utility - replaces validator.js and ValidationHelpers
const logger = require("./logger");

class InputValidator {
  /**
   * Sanitize string input
   */
  static sanitizeString(input, maxLength = 2000) {
    if (typeof input !== "string") {
      return "";
    }

    // Remove null bytes and control characters
    let sanitized = input.replace(/\0/g, "").replace(/[\x00-\x1F\x7F]/g, "");

    // Trim and limit length
    sanitized = sanitized.trim().substring(0, maxLength);

    return sanitized;
  }

  /**
   * Validate Discord ID (snowflake)
   */
  static isValidDiscordId(id) {
    if (typeof id !== "string") {
      return false;
    }
    return /^\d{17,19}$/.test(id);
  }

  /**
   * Validate email
   */
  static isValidEmail(email) {
    if (typeof email !== "string") {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 320;
  }

  /**
   * Sanitize for SQL (prevent injection - though we use prepared statements)
   */
  static sanitizeSQL(input) {
    if (typeof input !== "string") {
      return "";
    }
    // Remove SQL injection attempts
    return input.replace(/['";\\]/g, "");
  }

  /**
   * Validate number input
   */
  static isValidNumber(input, min = null, max = null) {
    const num = Number(input);
    if (isNaN(num)) {
      return false;
    }
    if (min !== null && num < min) {
      return false;
    }
    if (max !== null && num > max) {
      return false;
    }
    return true;
  }

  /**
   * Sanitize URL
   */
  static isValidURL(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Check for common attack patterns
   */
  static containsSuspiciousPatterns(input) {
    if (typeof input !== "string") {
      return false;
    }

    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i, // Event handlers
      /eval\(/i,
      /exec\(/i,
      /\$\{.*\}/, // Template injection
      /\.\.\//, // Path traversal
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Validate and sanitize user input
   */
  static validateInput(input, type = "string", options = {}) {
    const { maxLength = 2000, required = false, min, max } = options;

    // Check required
    if (required && (input === null || input === undefined || input === "")) {
      throw new Error("This field is required");
    }

    // Type-specific validation
    switch (type) {
      case "string":
        const sanitized = this.sanitizeString(input, maxLength);
        if (this.containsSuspiciousPatterns(sanitized)) {
          logger.warn(
            `[Security] Suspicious input detected: ${sanitized.substring(
              0,
              100
            )}`
          );
          throw new Error("Input contains potentially malicious content");
        }
        return sanitized;

      case "number":
        if (!this.isValidNumber(input, min, max)) {
          throw new Error(
            `Invalid number. Must be between ${min || "-∞"} and ${max || "∞"}`
          );
        }
        return Number(input);

      case "discord_id":
        if (!this.isValidDiscordId(input)) {
          throw new Error("Invalid Discord ID format");
        }
        return input;

      case "email":
        if (!this.isValidEmail(input)) {
          throw new Error("Invalid email format");
        }
        return input.toLowerCase();

      case "url":
        if (!this.isValidURL(input)) {
          throw new Error("Invalid URL format");
        }
        return input;

      default:
        return input;
    }
  }

  /**
   * Batch validate multiple inputs
   */
  static validateBatch(inputs) {
    const errors = [];
    const validated = {};

    for (const [key, config] of Object.entries(inputs)) {
      try {
        validated[key] = this.validateInput(
          config.value,
          config.type,
          config.options || {}
        );
      } catch (error) {
        errors.push({ field: key, error: error.message });
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Validation failed:\n${errors
          .map((e) => `- ${e.field}: ${e.error}`)
          .join("\n")}`
      );
    }

    return validated;
  }

  /**
   * Validate Discord Guild ID (snowflake)
   * @param {string} guildId - Guild ID to validate
   * @throws {Error} If invalid
   */
  static validateGuildId(guildId) {
    if (!guildId || typeof guildId !== "string") {
      throw new Error("Invalid guild ID");
    }
    if (!this.isValidDiscordId(guildId)) {
      throw new Error("Guild ID must be a valid Discord snowflake");
    }
    return true;
  }

  /**
   * Validate Discord User ID (snowflake)
   * @param {string} userId - User ID to validate
   * @throws {Error} If invalid
   */
  static validateUserId(userId) {
    if (!userId || typeof userId !== "string") {
      throw new Error("Invalid user ID");
    }
    if (!this.isValidDiscordId(userId)) {
      throw new Error("User ID must be a valid Discord snowflake");
    }
    return true;
  }

  /**
   * Validate Discord Channel ID (snowflake)
   * @param {string} channelId - Channel ID to validate
   * @throws {Error} If invalid
   */
  static validateChannelId(channelId) {
    if (!channelId || typeof channelId !== "string") {
      throw new Error("Invalid channel ID");
    }
    if (!this.isValidDiscordId(channelId)) {
      throw new Error("Channel ID must be a valid Discord snowflake");
    }
    return true;
  }

  /**
   * Validate reason string
   * @param {string} reason - Reason to validate
   * @param {number} maxLength - Maximum length (default: 512)
   * @throws {Error} If invalid
   */
  static validateReason(reason, maxLength = 512) {
    if (reason && reason.length > maxLength) {
      throw new Error(`Reason must be less than ${maxLength} characters`);
    }
    return true;
  }

  /**
   * Validate time string
   * @param {string} timeString - Time string to validate
   * @throws {Error} If invalid
   */
  static validateTime(timeString) {
    if (!timeString || typeof timeString !== "string") {
      throw new Error("Invalid time string");
    }
    // Basic validation - can be enhanced with ms library
    return true;
  }

  /**
   * Validate required fields exist
   * @param {object} data - Data object to check
   * @param {string[]} fields - Required field names
   * @throws {Error} If fields are missing
   */
  static validateRequired(data, fields) {
    const missing = [];
    for (const field of fields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ""
      ) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }

    return true;
  }

  /**
   * Validate number range
   * @param {any} value - Value to validate
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {string} fieldName - Field name for error message
   * @returns {number} Validated number
   * @throws {Error} If invalid
   */
  static validateRange(value, min, max, fieldName = "value") {
    const num = parseInt(value);
    if (isNaN(num)) {
      throw new Error(`${fieldName} must be a number`);
    }
    if (num < min || num > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return num;
  }

  /**
   * Validate string length
   * @param {string} str - String to validate
   * @param {number} min - Minimum length
   * @param {number} max - Maximum length
   * @param {string} fieldName - Field name for error message
   * @returns {string} Validated string
   * @throws {Error} If invalid
   */
  static validateLength(str, min, max, fieldName = "value") {
    if (typeof str !== "string") {
      throw new Error(`${fieldName} must be a string`);
    }
    if (str.length < min || str.length > max) {
      throw new Error(
        `${fieldName} must be between ${min} and ${max} characters`
      );
    }
    return str;
  }

  /**
   * Validate Discord snowflake ID (alias for backward compatibility)
   * @param {string} id - ID to validate
   * @param {string} fieldName - Field name for error message
   * @returns {string} Validated ID
   * @throws {Error} If invalid
   */
  static validateSnowflake(id, fieldName = "ID") {
    if (!this.isValidDiscordId(id)) {
      throw new Error(`${fieldName} is not a valid Discord ID`);
    }
    return id;
  }

  /**
   * Sanitize input (alias for backward compatibility with validator.js)
   * @param {any} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  static sanitizeInput(input) {
    return this.sanitizeString(input);
  }
}

module.exports = InputValidator;
