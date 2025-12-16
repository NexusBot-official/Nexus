const axios = require("axios");
const logger = require("./logger");

/**
 * VPN/Proxy Detection System
 * Detects suspicious IPs to prevent raids and ban evasion
 */
class VPNDetection {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1 hour

    // Known VPN/Proxy indicators
    this.suspiciousHostnames = [
      "vpn",
      "proxy",
      "hosting",
      "datacenter",
      "cloud",
      "aws",
      "azure",
      "digitalocean",
      "linode",
      "vultr",
    ];
  }

  /**
   * Check if IP is suspicious
   */
  async checkIP(ip) {
    // Check cache first
    if (this.cache.has(ip)) {
      const cached = this.cache.get(ip);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.result;
      }
      this.cache.delete(ip);
    }

    const result = {
      ip,
      isVPN: false,
      isProxy: false,
      isDatacenter: false,
      isTor: false,
      riskScore: 0,
      details: {},
      checks: [],
    };

    try {
      // Perform multiple checks
      await Promise.all([
        this.checkHostname(ip, result),
        this.checkIPAPI(ip, result),
        this.checkCommonPorts(ip, result),
      ]);

      // Calculate overall risk score
      result.riskScore = this.calculateRiskScore(result);

      // Cache result
      this.cache.set(ip, {
        result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      logger.error("VPNDetection", `Error checking IP ${ip}`, error);
      return result;
    }
  }

  /**
   * Check hostname for VPN indicators
   */
  async checkHostname(ip, result) {
    try {
      // Skip for local IPs
      if (this.isLocalIP(ip)) {
        result.checks.push({
          type: "hostname",
          passed: true,
          note: "Local IP",
        });
        return;
      }

      // In production, you'd use DNS lookup here
      // For now, we'll do basic checks
      const suspicious = this.suspiciousHostnames.some((keyword) =>
        ip.toLowerCase().includes(keyword)
      );

      if (suspicious) {
        result.isDatacenter = true;
        result.checks.push({
          type: "hostname",
          passed: false,
          note: "Suspicious hostname detected",
        });
      } else {
        result.checks.push({ type: "hostname", passed: true });
      }
    } catch (error) {
      result.checks.push({
        type: "hostname",
        passed: true,
        note: "Check failed",
      });
    }
  }

  /**
   * Check using IP-API.com (free tier)
   */
  async checkIPAPI(ip, result) {
    try {
      if (this.isLocalIP(ip)) {
        return;
      }

      const response = await axios.get(`http://ip-api.com/json/${ip}`, {
        timeout: 5000,
      });

      if (response.data) {
        const data = response.data;
        result.details.country = data.country;
        result.details.isp = data.isp;
        result.details.org = data.org;
        result.details.asn = data.as;

        // Check for hosting/datacenter
        const hostingIndicators = [
          "hosting",
          "datacenter",
          "cloud",
          "server",
          "vps",
        ];
        const isHosting = hostingIndicators.some(
          (indicator) =>
            data.isp?.toLowerCase().includes(indicator) ||
            data.org?.toLowerCase().includes(indicator)
        );

        if (isHosting) {
          result.isDatacenter = true;
          result.checks.push({
            type: "ip-api",
            passed: false,
            note: "Datacenter/Hosting detected",
          });
        } else {
          result.checks.push({ type: "ip-api", passed: true });
        }

        // Check for known VPN providers
        const vpnProviders = [
          "nordvpn",
          "expressvpn",
          "surfshark",
          "private internet access",
          "protonvpn",
        ];
        const isVPN = vpnProviders.some(
          (vpn) =>
            data.isp?.toLowerCase().includes(vpn) ||
            data.org?.toLowerCase().includes(vpn)
        );

        if (isVPN) {
          result.isVPN = true;
          result.checks.push({
            type: "vpn-provider",
            passed: false,
            note: "Known VPN provider",
          });
        }
      }
    } catch (error) {
      // Rate limited or API down - not a failure
      result.checks.push({
        type: "ip-api",
        passed: true,
        note: "API unavailable",
      });
    }
  }

  /**
   * Check for common proxy ports
   */
  async checkCommonPorts(ip, result) {
    // In production, you'd scan ports here
    // For now, just log the check
    result.checks.push({
      type: "ports",
      passed: true,
      note: "Port scan skipped",
    });
  }

  /**
   * Calculate overall risk score (0-100)
   */
  calculateRiskScore(result) {
    let score = 0;

    if (result.isVPN) {
      score += 40;
    }
    if (result.isProxy) {
      score += 35;
    }
    if (result.isDatacenter) {
      score += 25;
    }
    if (result.isTor) {
      score += 50;
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Check if IP is local/private
   */
  isLocalIP(ip) {
    // Remove IPv6 prefix if present
    const cleanIP = ip.replace(/^::ffff:/, "");

    // Check for localhost
    if (
      cleanIP === "127.0.0.1" ||
      cleanIP === "::1" ||
      cleanIP === "localhost"
    ) {
      return true;
    }

    // Check for private ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
    ];

    return privateRanges.some((range) => range.test(cleanIP));
  }

  /**
   * Get action recommendation based on risk score
   */
  getRecommendedAction(riskScore, context = {}) {
    if (riskScore >= 70) {
      return {
        action: "block",
        severity: "critical",
        message: "High-risk IP detected - recommend blocking",
        autoAction: context.autoBlock ? "ban" : "none",
      };
    }

    if (riskScore >= 40) {
      return {
        action: "quarantine",
        severity: "warning",
        message: "Suspicious IP - recommend quarantine/verification",
        autoAction: context.autoQuarantine ? "quarantine" : "none",
      };
    }

    if (riskScore >= 20) {
      return {
        action: "monitor",
        severity: "info",
        message: "Potentially suspicious - recommend monitoring",
        autoAction: "none",
      };
    }

    return {
      action: "allow",
      severity: "info",
      message: "IP appears safe",
      autoAction: "none",
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      cacheTimeout: this.cacheTimeout,
    };
  }
}

module.exports = new VPNDetection();
