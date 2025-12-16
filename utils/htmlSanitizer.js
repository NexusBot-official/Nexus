/**
 * HTML Sanitization Utility
 * Prevents XSS attacks by escaping HTML entities and removing dangerous content
 */

/**
 * Escape HTML entities to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for HTML
 */
function escapeHtml(str) {
  if (typeof str !== "string") {
    return String(str);
  }

  const htmlEscapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };

  return str.replace(/[&<>"'/]/g, (match) => htmlEscapes[match]);
}

/**
 * Sanitize string for use in HTML attributes
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function escapeHtmlAttribute(str) {
  if (typeof str !== "string") {
    return String(str);
  }
  return escapeHtml(str).replace(/\s+/g, " ");
}

/**
 * Sanitize user input for safe display in innerHTML contexts
 * This should be used before inserting any user-generated content into innerHTML
 * @param {string} str - String to sanitize
 * @param {object} options - Sanitization options
 * @param {number} options.maxLength - Maximum length (default: 1000)
 * @param {boolean} options.allowLineBreaks - Allow line breaks (default: false)
 * @returns {string} - Sanitized string safe for innerHTML
 */
function sanitizeForHtml(str, options = {}) {
  if (typeof str !== "string") {
    return "";
  }

  const { maxLength = 1000, allowLineBreaks = false } = options;

  // Remove null bytes
  let sanitized = str.replace(/\0/g, "");

  // Remove control characters except newlines if allowed
  if (allowLineBreaks) {
    sanitized = sanitized.replace(
      /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g,
      ""
    );
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  }

  // Escape HTML entities
  sanitized = escapeHtml(sanitized);

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + "...";
  }

  return sanitized.trim();
}

/**
 * Sanitize object properties for safe HTML display
 * Recursively sanitizes string values in an object
 * @param {any} obj - Object to sanitize
 * @param {number} maxDepth - Maximum recursion depth (default: 3)
 * @returns {any} - Sanitized object
 */
function sanitizeObjectForHtml(obj, maxDepth = 3) {
  if (maxDepth <= 0) {
    return "[Max Depth Reached]";
  }

  if (obj === null || obj === undefined) {
    return "";
  }

  if (typeof obj === "string") {
    return sanitizeForHtml(obj);
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectForHtml(item, maxDepth - 1));
  }

  if (typeof obj === "object") {
    const sanitized = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[sanitizeForHtml(key, { maxLength: 100 })] =
          sanitizeObjectForHtml(obj[key], maxDepth - 1);
      }
    }
    return sanitized;
  }

  return String(obj);
}

module.exports = {
  escapeHtml,
  escapeHtmlAttribute,
  sanitizeForHtml,
  sanitizeObjectForHtml,
};
