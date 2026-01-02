// security.js - Security monitoring and threat detection routes
import express from "express";
import logger, { authLogger } from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { SecurityService } from "../services/securityService.js";

const router = express.Router();
const securityService = new SecurityService();

/**
 * GET /security/overview - Get comprehensive security overview
 * @route GET /security/overview
 * @returns {Object} Security overview with threat scores and recommendations
 * @description Provides overall security health assessment and recommendations
 */
router.get("/overview", authenticateToken, async (req, res) => {
  try {
    const overview = await securityService.getSecurityOverview(req.user.userId);

    logger.info("Generated security overview", {
      context: "security",
      userId: req.user.userId,
      threatScore: overview.threatScore,
      recommendationsCount: overview.recommendations?.length || 0,
    });

    res.json(overview);
  } catch (error) {
    logger.error("Security overview generation failed", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to load security overview" });
  }
});

/**
 * GET /security/login-attempts - Get recent login attempts
 * @route GET /security/login-attempts
 * @param {number} [days] - Number of days to look back (default: 30)
 * @returns {Array} Login attempts with success/failure status and IP information
 * @description Retrieves authentication history for security monitoring
 */
router.get("/login-attempts", authenticateToken, async (req, res) => {
  try {
    // Parse days parameter with validation
    const days = parseInt(req.query.days) || 30;

    if (days <= 0 || days > 365) {
      logger.warn("Invalid days parameter for login attempts", {
        context: "security",
        userId: req.user.userId,
        days: days,
      });
      return res.status(400).json({ error: "Days must be between 1 and 365" });
    }

    const attempts = await securityService.getLoginAttempts(
      req.user.userId,
      days
    );

    const failedAttempts = attempts.filter((a) => !a.success);

    logger.info("Fetched login attempts", {
      context: "security",
      userId: req.user.userId,
      totalAttempts: attempts.length,
      failedAttempts: failedAttempts.length,
      daysPeriod: days,
    });

    res.json(attempts);
  } catch (error) {
    logger.error("Failed to fetch login attempts", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to load login attempts" });
  }
});

/**
 * GET /security/suspicious-transactions - Get suspicious transaction alerts
 * @route GET /security/suspicious-transactions
 * @returns {Array} Suspicious transactions with risk scores and explanations
 * @description Identifies potentially fraudulent or unusual transaction patterns
 */
router.get("/suspicious-transactions", authenticateToken, async (req, res) => {
  try {
    const transactions = await securityService.getSuspiciousTransactions(
      req.user.userId
    );

    const highRiskCount = transactions.filter(
      (t) => t.riskLevel === "high"
    ).length;

    logger.info("Fetched suspicious transactions", {
      context: "security",
      userId: req.user.userId,
      totalSuspicious: transactions.length,
      highRiskCount: highRiskCount,
      // Note: Don't log transaction details for security
      hasTransactions: transactions.length > 0,
    });

    res.json(transactions);
  } catch (error) {
    logger.error("Failed to fetch suspicious transactions", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to load suspicious transactions" });
  }
});

/**
 * POST /security/alert-preferences - Update security alert preferences
 * @route POST /security/alert-preferences
 * @param {Object} preferences - Alert notification preferences
 * @returns {Object} Updated preferences
 * @description Allows users to customize security alert notifications
 */
router.post("/alert-preferences", authenticateToken, async (req, res) => {
  try {
    const result = await securityService.updateAlertPreferences(
      req.user.userId,
      req.body
    );

    logger.info("Updated security alert preferences", {
      context: "security",
      userId: req.user.userId,
      updatedPreferences: Object.keys(req.body),
      emailAlerts: result.emailAlerts,
      pushNotifications: result.pushNotifications,
    });

    res.json(result);
  } catch (error) {
    logger.error("Failed to update alert preferences", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to update alert preferences" });
  }
});

/**
 * POST /security/monitor-transaction - Real-time transaction monitoring
 * @route POST /security/monitor-transaction
 * @param {Object} transactionData - Transaction details for analysis
 * @returns {Object} Risk assessment and monitoring results
 * @description Analyzes transactions in real-time for potential security threats
 */
router.post("/monitor-transaction", authenticateToken, async (req, res) => {
  try {
    // Enhanced IP detection with multiple fallbacks
    const clientIp =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      "127.0.0.1";

    const result = await securityService.monitorTransaction(
      req.body,
      req.user.userId,
      clientIp
    );

    // Log security event based on risk level
    if (result.riskLevel === "high") {
      authLogger.error({
        userId: req.user.userId,
        ip: clientIp,
        transactionId: result.transactionId,
        riskScore: result.riskScore,
        context: "transaction-monitoring",
      });
    } else if (result.riskLevel === "medium") {
      logger.warn("Medium risk transaction detected", {
        context: "security",
        userId: req.user.userId,
        transactionId: result.transactionId,
        riskScore: result.riskScore,
      });
    } else {
      logger.info("Transaction monitored - low risk", {
        context: "security",
        userId: req.user.userId,
        transactionId: result.transactionId,
        riskScore: result.riskScore,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error("Transaction monitoring failed", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
      transactionData: { amount: req.body.amount, type: req.body.type }, // Limited info for security
    });
    res.status(500).json({ error: "Failed to analyze transaction" });
  }
});

/**
 * GET /security/logs - Get security event logs
 * @route GET /security/logs
 * @returns {Array} Security event logs with timestamps and severity levels
 * @description Retrieves security audit logs for user activity monitoring
 */
router.get("/logs", authenticateToken, async (req, res) => {
  try {
    const logs = await securityService.getSecurityLogs(req.user.userId);

    const criticalCount = logs.filter((l) => l.severity === "critical").length;
    const warningCount = logs.filter((l) => l.severity === "warning").length;

    logger.info("Fetched security logs", {
      context: "security",
      userId: req.user.userId,
      totalLogs: logs.length,
      criticalCount: criticalCount,
      warningCount: warningCount,
      timeRange:
        logs.length > 0
          ? `${logs[logs.length - 1].timestamp} to ${logs[0].timestamp}`
          : "No logs",
    });

    res.json(logs);
  } catch (error) {
    logger.error("Failed to fetch security logs", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to load security logs" });
  }
});

/**
 * GET /security/summary - Get user security summary
 * @route GET /security/summary
 * @returns {Object} Consolidated security summary with status indicators
 * @description Provides at-a-glance security status and key metrics
 */
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const summary = await securityService.getUserSecuritySummary(
      req.user.userId
    );

    logger.info("Generated security summary", {
      context: "security",
      userId: req.user.userId,
      securityScore: summary.securityScore,
      activeAlerts: summary.activeAlerts,
      lastThreatDetected: summary.lastThreatDetected,
    });

    res.json(summary);
  } catch (error) {
    logger.error("Security summary generation failed", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to generate security summary" });
  }
});

/**
 * GET /security/check-lock - Check account lock status
 * @route GET /security/check-lock
 * @returns {Object} Account lock status and unlock information
 * @description Checks if account is locked due to security events and provides unlock options
 */
router.get("/check-lock", authenticateToken, async (req, res) => {
  try {
    const lockStatus = await securityService.checkAccountLock(req.user.userId);

    // Log based on lock status
    if (lockStatus.isLocked) {
      logger.warn("Account lock status checked - account is locked", {
        context: "security",
        userId: req.user.userId,
        lockedUntil: lockStatus.lockedUntil,
        lockReason: lockStatus.lockReason,
      });
    } else {
      logger.info("Account lock status checked - account is not locked", {
        context: "security",
        userId: req.user.userId,
      });
    }

    res.json(lockStatus);
  } catch (error) {
    logger.error("Failed to check account lock status", {
      context: "security",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to check account lock status" });
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down security service - cleaning up connections", {
    context: "security",
  });
  try {
    await securityService.cleanup();
    logger.info("Security service cleanup completed", { context: "security" });
  } catch (error) {
    logger.error("Error during security service cleanup", {
      context: "security",
      error: error.message,
    });
  }
  process.exit();
});

export default router;
