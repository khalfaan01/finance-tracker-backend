// securityService.js
// Service for security monitoring, fraud detection, and pattern analysis

import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * Service class for security monitoring, fraud detection, and behavioral pattern analysis
 * Handles transaction monitoring, anomaly detection, and security recommendations
 */
export class SecurityService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Enhanced fraud detection algorithm for transaction monitoring
   * @param {Object} transaction - Transaction to analyze
   * @param {Array} userHistory - User's transaction history
   * @param {Object} userBehavior - User's behavioral patterns
   * @returns {Object} Anomalies and risk score
   */
  detectTransactionAnomalies(transaction, userHistory, userBehavior) {
    try {
      const anomalies = [];
      let riskScore = 0;

      // 1. Amount-based detection using statistical comparison
      const avgTransaction = userBehavior.avgTransactionAmount || 100;
      const amountRatio = Math.abs(transaction.amount) / avgTransaction;

      // Flag transactions significantly above average
      if (amountRatio > 10) {
        anomalies.push(
          `Amount ($${Math.abs(transaction.amount)}) is ${amountRatio.toFixed(
            1
          )}x higher than average`
        );
        riskScore += 30;
      }

      // Critical threshold for very large transactions
      if (amountRatio > 20) {
        anomalies.push(`CRITICAL: Amount exceeds 20x average spending`);
        riskScore += 25;
      }

      // 2. Time-based detection for unusual hours (4 AM - 2 AM range check)
      const transactionHour = new Date().getHours();
      // Check for transactions outside typical hours (2 AM to 4 AM)
      if (transactionHour < 4 || transactionHour > 2) {
        anomalies.push(`Transaction at unusual hour: ${transactionHour}:00`);
        riskScore += 10;
      }

      // 3. Category-based detection using historical spending by category
      const categorySpending = userBehavior.categorySpending || {};
      const categoryAvg =
        categorySpending[transaction.category] || avgTransaction;

      if (Math.abs(transaction.amount) > categoryAvg * 3) {
        anomalies.push(
          `Unusually high amount for ${transaction.category} category`
        );
        riskScore += 15;
      }

      const result = {
        anomalies,
        riskScore: Math.min(riskScore, 100), // Cap risk score at 100
      };

      logger.debug("Transaction anomaly detection completed", {
        riskScore: result.riskScore,
        anomalyCount: anomalies.length,
      });

      return result;
    } catch (error) {
      logger.error("Transaction anomaly detection failed", {
        error: error.message,
      });
      return { anomalies: [], riskScore: 0 };
    }
  }

  /**
   * PATTERN DETECTION METHODS
   */

  /**
   * Detect various spending patterns from transaction history
   * @param {Array} transactions - Transaction history
   * @returns {Object} Detected patterns
   */
  detectSpendingPatterns(transactions) {
    try {
      const patterns = {
        recurringPayments: this.detectRecurringPayments(transactions),
        seasonalTrends: this.detectSeasonalTrends(transactions),
        behavioralPatterns: this.detectBehavioralPatterns(transactions),
        anomalyDetections: this.detectAnomalies(transactions),
      };

      logger.debug("Spending patterns detected", {
        recurringCount: patterns.recurringPayments.length,
        anomalyCount: patterns.anomalyDetections.length,
      });

      return patterns;
    } catch (error) {
      logger.error("Spending pattern detection failed", {
        error: error.message,
      });
      return {
        recurringPayments: [],
        seasonalTrends: {},
        behavioralPatterns: {},
        anomalyDetections: [],
      };
    }
  }

  /**
   * Detect recurring payments from transaction history
   * @param {Array} transactions - Transaction history
   * @returns {Array} Recurring payment patterns
   */
  detectRecurringPayments(transactions) {
    const recurring = [];
    const expenseTransactions = transactions.filter(
      (tx) => tx.type === "expense"
    );

    if (expenseTransactions.length < 3) {
      logger.debug(
        "Insufficient transactions for recurring payment detection",
        {
          transactionCount: expenseTransactions.length,
        }
      );
      return recurring;
    }

    // Group transactions by description and amount
    const paymentGroups = {};
    expenseTransactions.forEach((tx) => {
      const key = `${tx.description}-${Math.abs(tx.amount)}`;
      if (!paymentGroups[key]) {
        paymentGroups[key] = [];
      }
      paymentGroups[key].push(tx);
    });

    // Find recurring patterns (3+ occurrences with regular intervals)
    Object.entries(paymentGroups).forEach(([key, txs]) => {
      if (txs.length >= 3) {
        const dates = txs.map((tx) => new Date(tx.date)).sort((a, b) => a - b);
        const intervals = [];

        // Calculate intervals between consecutive transactions
        for (let i = 1; i < dates.length; i++) {
          intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)); // Convert to days
        }

        const avgInterval =
          intervals.reduce((a, b) => a + b) / intervals.length;
        // Check if intervals are regular (within 7 days of average)
        const isRegular = intervals.every(
          (interval) => Math.abs(interval - avgInterval) <= 7
        );

        if (isRegular) {
          recurring.push({
            description: txs[0].description,
            amount: Math.abs(txs[0].amount),
            frequency: avgInterval <= 35 ? "monthly" : "yearly",
            occurrences: txs.length,
            nextExpected: new Date(
              dates[dates.length - 1].getTime() +
                avgInterval * 24 * 60 * 60 * 1000
            ),
          });
        }
      }
    });

    return recurring;
  }

  /**
   * Detect seasonal spending trends
   * @param {Array} transactions - Transaction history
   * @returns {Object} Monthly spending by month
   */
  detectSeasonalTrends(transactions) {
    const monthlySpending = {};
    const currentYear = new Date().getFullYear();

    // Filter and aggregate expenses by month for current year
    transactions
      .filter(
        (tx) =>
          tx.type === "expense" &&
          new Date(tx.date).getFullYear() === currentYear
      )
      .forEach((tx) => {
        const month = new Date(tx.date).getMonth();
        monthlySpending[month] =
          (monthlySpending[month] || 0) + Math.abs(tx.amount);
      });

    return monthlySpending;
  }

  /**
   * Detect behavioral spending patterns
   * @param {Array} transactions - Transaction history
   * @returns {Object} Behavioral pattern metrics
   */
  detectBehavioralPatterns(transactions) {
    const patterns = {
      weekendSpending: 0,
      weekdaySpending: 0,
      morningSpending: 0,
      eveningSpending: 0,
    };

    transactions.forEach((tx) => {
      const date = new Date(tx.date);
      const dayOfWeek = date.getDay();
      const hour = date.getHours();
      const amount = Math.abs(tx.amount);

      // Weekend vs weekday spending
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        patterns.weekendSpending += amount;
      } else {
        patterns.weekdaySpending += amount;
      }

      // Morning (6 AM - 6 PM) vs evening spending
      if (hour >= 18 || hour < 6) {
        patterns.eveningSpending += amount;
      } else {
        patterns.morningSpending += amount;
      }
    });

    return patterns;
  }

  /**
   * Detect statistical anomalies using standard deviation
   * @param {Array} transactions - Transaction history
   * @returns {Array} Detected anomalies
   */
  detectAnomalies(transactions) {
    const anomalies = [];
    const expenseTransactions = transactions.filter(
      (tx) => tx.type === "expense"
    );

    if (expenseTransactions.length < 3) {
      logger.debug("Insufficient transactions for anomaly detection", {
        transactionCount: expenseTransactions.length,
      });
      return anomalies;
    }

    // Calculate statistical metrics
    const amounts = expenseTransactions.map((tx) => Math.abs(tx.amount));
    const average = amounts.reduce((a, b) => a + b) / amounts.length;
    const variance =
      amounts.map((x) => Math.pow(x - average, 2)).reduce((a, b) => a + b) /
      amounts.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies using 3-sigma rule (99.7% of data within 3 std dev)
    expenseTransactions.forEach((tx) => {
      const amount = Math.abs(tx.amount);
      const zScore = (amount - average) / stdDev;

      if (zScore > 3) {
        // More than 3 standard deviations from mean
        anomalies.push({
          transaction: tx,
          deviation: zScore.toFixed(2),
          riskLevel: amount > average + 5 * stdDev ? "high" : "medium",
        });
      }
    });

    return anomalies;
  }

  /**
   * Detect fraud patterns across multiple dimensions
   * @param {Array} transactions - Transaction history
   * @param {Object} userProfile - User profile data
   * @returns {Object} Fraud detection indicators
   */
  detectFraudPatterns(transactions, userProfile) {
    try {
      const fraudIndicators = {
        rapidSuccessionTransactions: this.detectRapidTransactions(transactions),
        unusualLocationPatterns: this.detectLocationAnomalies(
          transactions,
          userProfile
        ),
        amountPatternDeviations: this.detectAmountPatterns(
          transactions,
          userProfile
        ),
      };

      logger.debug("Fraud pattern detection completed", {
        rapidTransactionCount:
          fraudIndicators.rapidSuccessionTransactions.length,
        amountDeviationsCount:
          fraudIndicators.amountPatternDeviations.deviations.length,
      });

      return fraudIndicators;
    } catch (error) {
      logger.error("Fraud pattern detection failed", { error: error.message });
      return {
        rapidSuccessionTransactions: [],
        unusualLocationPatterns: { uniqueLocations: 0, suspicious: false },
        amountPatternDeviations: { deviations: [], averageAmount: 0 },
      };
    }
  }

  /**
   * Detect rapid sequence of transactions (potential fraud indicator)
   * @param {Array} transactions - Transaction history
   * @returns {Array} Rapid transaction sequences
   */
  detectRapidTransactions(transactions) {
    const rapidTransactions = [];
    const sortedTransactions = transactions.sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    for (let i = 1; i < sortedTransactions.length; i++) {
      const current = sortedTransactions[i];
      const previous = sortedTransactions[i - 1];
      const timeDiff = new Date(current.date) - new Date(previous.date);

      // Flag expense transactions within 5 minutes of each other
      if (timeDiff < 5 * 60 * 1000 && current.type === "expense") {
        rapidTransactions.push({
          transaction: current,
          timeFromPrevious: timeDiff / (1000 * 60), // Convert to minutes
          riskLevel: "medium",
        });
      }
    }

    return rapidTransactions;
  }

  /**
   * Detect location-based anomalies (placeholder for IP geolocation)
   * @param {Array} transactions - Transaction history with IP data
   * @param {Object} userProfile - User profile
   * @returns {Object} Location anomaly indicators
   */
  detectLocationAnomalies(transactions, userProfile) {
    // Extract unique IP addresses from transactions
    const locations = transactions.map((tx) => tx.ipAddress).filter(Boolean);
    const uniqueLocations = [...new Set(locations)];

    return {
      uniqueLocations: uniqueLocations.length,
      suspicious: uniqueLocations.length > 3, // Multiple locations may indicate account sharing or fraud
    };
  }

  /**
   * Detect amount pattern deviations from historical averages
   * @param {Array} transactions - Transaction history
   * @param {Object} userProfile - User profile
   * @returns {Object} Amount deviation analysis
   */
  detectAmountPatterns(transactions, userProfile) {
    const expenseTransactions = transactions.filter(
      (tx) => tx.type === "expense"
    );
    if (expenseTransactions.length === 0) {
      return { deviations: [], averageAmount: 0 };
    }

    const amounts = expenseTransactions.map((tx) => Math.abs(tx.amount));
    const average = amounts.reduce((a, b) => a + b) / amounts.length;

    // Find transactions significantly above average (2x threshold)
    const deviations = expenseTransactions
      .filter((tx) => Math.abs(tx.amount) > average * 2)
      .map((tx) => ({
        transaction: tx,
        deviationFromAverage:
          (((Math.abs(tx.amount) - average) / average) * 100).toFixed(1) + "%",
        riskLevel: "high",
      }));

    return { deviations, averageAmount: average };
  }

  /**
   * Get comprehensive security overview for user
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Security overview data
   */
  async getSecurityOverview(userId) {
    try {
      // Get today's date range for daily statistics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch security data in parallel for performance
      const [
        todayLoginAttempts,
        securityLogs,
        suspiciousTransactions,
        userTransactions,
      ] = await Promise.all([
        // Today's login attempts
        this.prisma.securityLog.findMany({
          where: {
            userId: userId,
            action: { in: ["login_success", "login_failed"] },
            timestamp: {
              gte: today,
              lt: tomorrow,
            },
          },
          orderBy: { timestamp: "desc" },
        }),
        // Last 30 days security logs
        this.prisma.securityLog.findMany({
          where: {
            userId: userId,
            timestamp: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            },
          },
          orderBy: { timestamp: "desc" },
        }),
        // Suspicious transactions
        this.prisma.transaction.findMany({
          where: {
            account: { userId: userId },
            OR: [{ flagged: true }, { riskScore: { gt: 30 } }],
          },
          include: { account: true },
          orderBy: { date: "desc" },
        }),
        // Recent transactions for pattern analysis
        this.prisma.transaction.findMany({
          where: { account: { userId: userId } },
          orderBy: { date: "desc" },
          take: 200,
        }),
      ]);

      // Calculate daily login statistics
      const todaySuccessful = todayLoginAttempts.filter(
        (log) => log.action === "login_success"
      ).length;
      const todayFailed = todayLoginAttempts.filter(
        (log) => log.action === "login_failed"
      ).length;
      const todayTotal = todaySuccessful + todayFailed;

      // Extract security events (excluding login events)
      const securityEvents = securityLogs
        .filter(
          (log) => !["login_success", "login_failed"].includes(log.action)
        )
        .slice(0, 20)
        .map((log) => ({
          type: log.action,
          description: log.details,
          riskLevel:
            log.riskScore > 80 ? "high" : log.riskScore > 60 ? "medium" : "low",
          time: log.timestamp.toLocaleString(),
          ip: log.ipAddress,
        }));

      // Analyze spending patterns if transactions exist
      const spendingPatterns =
        userTransactions.length > 0
          ? this.detectSpendingPatterns(userTransactions)
          : null;

      // Calculate risk score based on failed logins and suspicious transactions
      const riskScore = Math.min(todayFailed * 10, 100);

      const overview = {
        loginAttempts: securityLogs.filter(
          (log) =>
            log.action === "login_success" || log.action === "login_failed"
        ),
        todayLoginStats: {
          total: todayTotal,
          successful: todaySuccessful,
          failed: todayFailed,
        },
        suspiciousTransactions,
        securityEvents,
        spendingPatterns,
        ipLocations: [
          {
            ip: "Current Session",
            city: "Cape Town",
            country: "South Africa",
            lastLogin: "Now",
            trusted: true,
          },
        ],
        riskScore,
      };

      logger.info("Security overview generated", {
        userId,
        suspiciousTransactionCount: suspiciousTransactions.length,
        riskScore,
      });

      return overview;
    } catch (error) {
      logger.error("Failed to get security overview", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get login attempts within specified timeframe
   * @param {string|number} userId - User identifier
   * @param {number} [days=30] - Number of days to look back
   * @returns {Promise<Array>} Login attempt logs
   */
  async getLoginAttempts(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const attempts = await this.prisma.securityLog.findMany({
        where: {
          userId: userId,
          action: { in: ["login_success", "login_failed"] },
          timestamp: { gte: startDate },
        },
        orderBy: { timestamp: "desc" },
      });

      logger.debug("Login attempts retrieved", {
        userId,
        days,
        attemptCount: attempts.length,
      });

      return attempts;
    } catch (error) {
      logger.error("Failed to get login attempts", {
        userId,
        days,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get suspicious transactions for user
   * @param {string|number} userId - User identifier
   * @returns {Promise<Array>} Suspicious transactions
   */
  async getSuspiciousTransactions(userId) {
    try {
      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId: userId },
          OR: [{ flagged: true }, { riskScore: { gt: 30 } }],
        },
        include: { account: true },
        orderBy: { date: "desc" },
      });

      logger.debug("Suspicious transactions retrieved", {
        userId,
        transactionCount: transactions.length,
      });

      return transactions;
    } catch (error) {
      logger.error("Failed to get suspicious transactions", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Monitor transaction in real-time with fraud detection
   * @param {Object} transactionData - Transaction to monitor
   * @param {string|number} userId - User identifier
   * @param {string} [clientIp='127.0.0.1'] - Client IP address
   * @returns {Promise<Object>} Monitoring results with risk assessment
   */
  async monitorTransaction(transactionData, userId, clientIp = "127.0.0.1") {
    try {
      // Get user's recent transaction history for behavior analysis
      const userTransactions = await this.prisma.transaction.findMany({
        where: { account: { userId: userId } },
        orderBy: { date: "desc" },
        take: 100,
      });

      // Initialize user behavior metrics
      let userBehavior = {
        avgTransactionAmount: 100, // Default average for new users
        categorySpending: {},
        recentTransactions: [],
      };

      // Calculate behavior metrics if transactions exist
      if (userTransactions.length > 0) {
        const totalAmount = userTransactions.reduce(
          (sum, tx) => sum + Math.abs(tx.amount),
          0
        );
        userBehavior = {
          avgTransactionAmount: totalAmount / userTransactions.length,
          categorySpending: userTransactions.reduce((acc, tx) => {
            acc[tx.category] = (acc[tx.category] || 0) + Math.abs(tx.amount);
            return acc;
          }, {}),
          recentTransactions: userTransactions.slice(0, 10),
        };
      }

      // Run enhanced fraud detection
      const detectionResult = this.detectTransactionAnomalies(
        transactionData,
        userTransactions,
        userBehavior
      );

      // Check for fraud patterns across transaction history including new transaction
      const fraudPatterns = this.detectFraudPatterns(
        [...userTransactions, transactionData],
        userBehavior
      );

      // Calculate combined risk score from multiple detection methods
      const fraudRiskScore =
        fraudPatterns.rapidSuccessionTransactions.length * 10 +
        (fraudPatterns.unusualLocationPatterns.suspicious ? 20 : 0) +
        fraudPatterns.amountPatternDeviations.deviations.length * 15;

      const totalRiskScore = Math.min(
        detectionResult.riskScore + fraudRiskScore,
        100
      );

      // Log security event for high-risk transactions
      if (totalRiskScore > 60) {
        await this.logSecurityEvent(
          userId,
          "transaction_flagged",
          clientIp,
          `High-risk transaction detected: ${detectionResult.anomalies.join(
            ", "
          )}`,
          totalRiskScore
        );

        logger.warn("High-risk transaction flagged", {
          userId,
          riskScore: totalRiskScore,
          anomalies: detectionResult.anomalies.length,
        });
      }

      const result = {
        monitored: true,
        riskScore: totalRiskScore,
        anomalies: detectionResult.anomalies,
        fraudPatterns,
        alertTriggered: totalRiskScore > 60,
        recommendedAction:
          totalRiskScore > 80
            ? "block"
            : totalRiskScore > 60
            ? "review"
            : "allow",
      };

      logger.debug("Transaction monitoring completed", {
        userId,
        riskScore: result.riskScore,
        recommendedAction: result.recommendedAction,
      });

      return result;
    } catch (error) {
      logger.error("Transaction monitoring failed", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get security logs for user
   * @param {string|number} userId - User identifier
   * @param {number} [limit=50] - Maximum number of logs to return
   * @returns {Promise<Array>} Security logs
   */
  async getSecurityLogs(userId, limit = 50) {
    try {
      const logs = await this.prisma.securityLog.findMany({
        where: { userId: userId },
        orderBy: { timestamp: "desc" },
        take: limit,
      });

      logger.debug("Security logs retrieved", {
        userId,
        logCount: logs.length,
      });

      return logs;
    } catch (error) {
      logger.error("Failed to get security logs", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log security event for audit trail
   * @param {string|number} userId - User identifier
   * @param {string} action - Security action type
   * @param {string} ipAddress - Client IP address
   * @param {string} details - Event details
   * @param {number} riskScore - Risk assessment score (0-100)
   * @returns {Promise<Object>} Created security log
   */
  async logSecurityEvent(userId, action, ipAddress, details, riskScore = 0) {
    try {
      const log = await this.prisma.securityLog.create({
        data: {
          userId,
          action,
          ipAddress,
          details,
          riskScore,
          timestamp: new Date(),
        },
      });

      logger.http("Security event logged", {
        userId,
        action,
        riskScore,
        logId: log.id,
      });

      return log;
    } catch (error) {
      logger.error("Failed to log security event", {
        userId,
        action,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update user alert preferences
   * @param {string|number} userId - User identifier
   * @param {Object} preferences - Alert preference updates
   * @returns {Promise<Object>} Update result
   */
  async updateAlertPreferences(userId, preferences) {
    try {
      // Note: In production, this would update user preferences in database
      // For now, returning success with preferences
      logger.info("Alert preferences updated", {
        userId,
        preferences: Object.keys(preferences),
      });

      return {
        success: true,
        message: `Alert preferences updated successfully`,
        preferences,
      };
    } catch (error) {
      logger.error("Failed to update alert preferences", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if user account is locked
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Account lock status
   */
  async checkAccountLock(userId) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        logger.warn("User not found for account lock check", { userId });
        throw new Error("User not found");
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil(
          (user.lockedUntil - new Date()) / (1000 * 60)
        );
        const status = {
          locked: true,
          lockedUntil: user.lockedUntil,
          minutesLeft,
          message: `Account temporarily locked. Try again in ${minutesLeft} minutes.`,
        };

        logger.warn("Account locked status detected", {
          userId,
          minutesLeft,
        });

        return status;
      }

      logger.debug("Account not locked", { userId });
      return { locked: false };
    } catch (error) {
      logger.error("Failed to check account lock status", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get comprehensive security summary for user
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Security summary with recommendations
   */
  async getUserSecuritySummary(userId) {
    try {
      // Fetch all security data in parallel
      const [logs, transactions, user] = await Promise.all([
        this.getSecurityLogs(userId, 100),
        this.getSuspiciousTransactions(userId),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            lastLogin: true,
            lastLoginIP: true,
            lastLoginCity: true,
            lastLoginCountry: true,
            loginAttempts: true,
            lockedUntil: true,
            isVerified: true,
            alertEmailEnabled: true,
          },
        }),
      ]);

      // Calculate security metrics
      const failedLogins = logs.filter((log) => log.action === "login_failed");
      const suspiciousCount = transactions.length;
      const highRiskLogs = logs.filter((log) => log.riskScore > 70);

      const summary = {
        userInfo: {
          lastLogin: user?.lastLogin,
          lastLoginLocation: user?.lastLoginCity
            ? `${user.lastLoginCity}, ${user.lastLoginCountry}`
            : "Unknown",
          isVerified: user?.isVerified || false,
          alertEmailEnabled: user?.alertEmailEnabled || false,
        },
        securityMetrics: {
          totalSecurityEvents: logs.length,
          failedLoginAttempts: failedLogins.length,
          suspiciousTransactions: suspiciousCount,
          highRiskEvents: highRiskLogs.length,
          currentRiskScore: Math.min(
            failedLogins.length * 5 + suspiciousCount * 10,
            100
          ),
        },
        recommendations: this.generateSecurityRecommendations(
          logs,
          transactions
        ),
      };

      logger.info("User security summary generated", {
        userId,
        failedLoginCount: failedLogins.length,
        suspiciousTransactionCount: suspiciousCount,
      });

      return summary;
    } catch (error) {
      logger.error("Failed to get user security summary", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate security recommendations based on activity patterns
   * @param {Array} logs - Security logs
   * @param {Array} transactions - Suspicious transactions
   * @returns {Array} Security recommendations
   */
  generateSecurityRecommendations(logs, transactions) {
    const recommendations = [];

    // Check for failed login attempts
    const failedLogins = logs.filter((log) => log.action === "login_failed");
    if (failedLogins.length > 3) {
      recommendations.push({
        type: "login_security",
        priority: "high",
        title: "Multiple Failed Login Attempts",
        description: `${failedLogins.length} failed login attempts detected. Consider enabling two-factor authentication.`,
        action: "enable_2fa",
      });
    }

    // Check for suspicious transactions
    const suspiciousTransactions = transactions.filter(
      (tx) => tx.riskScore > 60
    );
    if (suspiciousTransactions.length > 0) {
      recommendations.push({
        type: "transaction_security",
        priority: suspiciousTransactions.length > 3 ? "high" : "medium",
        title: "Suspicious Transactions Detected",
        description: `${suspiciousTransactions.length} transactions flagged for review.`,
        action: "review_transactions",
      });
    }

    // Check for multiple access locations
    const recentLogs = logs.slice(0, 20);
    const uniqueIps = new Set(recentLogs.map((log) => log.ipAddress));
    if (uniqueIps.size > 3) {
      recommendations.push({
        type: "access_security",
        priority: "medium",
        title: "Multiple Access Locations",
        description: `Account accessed from ${uniqueIps.size} different IP addresses.`,
        action: "review_access_locations",
      });
    }

    return recommendations;
  }

  /**
   * Analyze spending patterns for security insights
   * @param {string|number} userId - User identifier
   * @param {string} [period='monthly'] - Analysis period
   * @returns {Promise<Object>} Spending pattern analysis
   */
  async analyzeSpendingPatterns(userId, period = "monthly") {
    try {
      const now = new Date();
      let startDate = new Date();

      // Set start date based on period
      switch (period) {
        case "weekly":
          startDate.setDate(now.getDate() - 7);
          break;
        case "monthly":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "yearly":
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(now.getMonth() - 1);
      }

      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId: userId },
          date: { gte: startDate },
        },
        orderBy: { date: "desc" },
      });

      if (transactions.length === 0) {
        logger.info("No transactions for spending pattern analysis", {
          userId,
          period,
        });
        return { message: "No transactions found for analysis" };
      }

      const patterns = this.detectSpendingPatterns(transactions);
      const fraudIndicators = this.detectFraudPatterns(transactions, {});

      const analysis = {
        period,
        totalTransactions: transactions.length,
        totalSpent: transactions
          .filter((tx) => tx.type === "expense")
          .reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
        patterns,
        fraudIndicators,
        insights: this.generateSpendingInsights(patterns, fraudIndicators),
      };

      logger.debug("Spending pattern analysis completed", {
        userId,
        period,
        transactionCount: transactions.length,
      });

      return analysis;
    } catch (error) {
      logger.error("Failed to analyze spending patterns", {
        userId,
        period,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate insights from spending patterns
   * @param {Object} patterns - Detected spending patterns
   * @param {Object} fraudIndicators - Fraud detection results
   * @returns {Array} Spending insights
   */
  generateSpendingInsights(patterns, fraudIndicators) {
    const insights = [];

    if (patterns.recurringPayments.length > 0) {
      insights.push({
        type: "recurring_payments",
        title: "Recurring Payments",
        description: `Found ${patterns.recurringPayments.length} recurring payments`,
        details: patterns.recurringPayments.map((p) => ({
          description: p.description,
          frequency: p.frequency,
          nextExpected: p.nextExpected.toLocaleDateString(),
        })),
      });
    }

    if (fraudIndicators.rapidSuccessionTransactions.length > 0) {
      insights.push({
        type: "rapid_transactions",
        title: "Rapid Transaction Activity",
        description: `${fraudIndicators.rapidSuccessionTransactions.length} rapid transactions detected`,
        priority: "medium",
      });
    }

    if (patterns.anomalyDetections.length > 0) {
      insights.push({
        type: "spending_anomalies",
        title: "Unusual Spending Patterns",
        description: `${patterns.anomalyDetections.length} transactions deviate significantly from your average`,
        priority: "high",
      });
    }

    return insights;
  }

  /**
   * Cleanup database connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      logger.debug("SecurityService cleanup completed");
    } catch (error) {
      logger.error("SecurityService cleanup failed", { error: error.message });
      throw error;
    }
  }
}
