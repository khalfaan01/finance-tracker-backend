// recurringService.js Backend
// Service for managing recurring transactions, subscription analysis, and automated billing

import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * Service class for recurring transaction management with subscription analytics
 * Handles automated billing, subscription analysis, and optimization recommendations
 */
export class RecurringService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create recurring transaction with validation
   * @param {Object} data - Recurring transaction data
   * @returns {Promise<Object>} Created recurring transaction
   */
  async createRecurringTransaction(data) {
    try {
      this.validateRecurringData(data);

      const nextRunDate = this.calculateNextRunDate(
        data.startDate,
        data.frequency,
        data.interval || 1
      );

      const recurring = await this.prisma.recurringTransaction.create({
        data: {
          ...data,
          nextRunDate,
          interval: data.interval || 1,
          isActive: data.isActive !== false,
          autoApprove: data.autoApprove || false,
          totalRuns: 0,
        },
      });

      logger.info("Recurring transaction created", {
        recurringId: recurring.id,
        description: recurring.description,
        frequency: recurring.frequency,
        nextRunDate: recurring.nextRunDate,
      });

      return recurring;
    } catch (error) {
      logger.error("Failed to create recurring transaction", {
        error: error.message,
        data: { ...data, amount: data.amount, frequency: data.frequency },
      });
      throw error;
    }
  }

  /**
   * Validate recurring transaction data
   * @param {Object} data - Recurring transaction data to validate
   * @returns {boolean} True if data is valid
   * @throws {Error} If validation fails
   */
  validateRecurringData(data) {
    const validFrequencies = [
      "daily",
      "weekly",
      "monthly",
      "yearly",
      "biweekly",
      "quarterly",
    ];

    if (!validFrequencies.includes(data.frequency)) {
      logger.warn("Invalid frequency provided", {
        frequency: data.frequency,
        validFrequencies,
      });
      throw new Error(
        `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`
      );
    }

    if (data.amount <= 0) {
      logger.warn("Invalid amount for recurring transaction", {
        amount: data.amount,
      });
      throw new Error("Amount must be positive");
    }

    if (!["income", "expense"].includes(data.type)) {
      logger.warn("Invalid transaction type", { type: data.type });
      throw new Error("Type must be income or expense");
    }

    const startDate = new Date(data.startDate);
    const now = new Date();

    if (startDate < new Date(now.getTime() - 5 * 60 * 1000)) {
      logger.warn("Start date too far in the past", { startDate });
      throw new Error("Start date cannot be more than 5 minutes in the past");
    }

    if (data.endDate && new Date(data.endDate) <= startDate) {
      logger.warn("End date before start date", {
        startDate,
        endDate: data.endDate,
      });
      throw new Error("End date must be after start date");
    }

    return true;
  }

  /**
   * Calculate next run date based on frequency and interval
   * @param {string|Date} startDate - Start date of recurrence
   * @param {string} frequency - Recurrence frequency
   * @param {number} interval - Recurrence interval
   * @returns {Date} Next run date
   */
  calculateNextRunDate(startDate, frequency, interval) {
    const date = new Date(startDate);
    const now = new Date();

    // If start date is in the future, use it as next run date
    if (date > now) {
      logger.debug("Start date in future, using as next run date", {
        startDate,
        frequency,
        interval,
      });
      return date;
    }

    // Calculate next occurrence from current date
    const nextDate = new Date(now);

    switch (frequency) {
      case "daily":
        nextDate.setDate(nextDate.getDate() + interval);
        break;
      case "weekly":
        nextDate.setDate(nextDate.getDate() + 7 * interval);
        break;
      case "biweekly":
        nextDate.setDate(nextDate.getDate() + 14 * interval);
        break;
      case "monthly":
        nextDate.setMonth(nextDate.getMonth() + interval);
        break;
      case "quarterly":
        nextDate.setMonth(nextDate.getMonth() + 3 * interval);
        break;
      case "yearly":
        nextDate.setFullYear(nextDate.getFullYear() + interval);
        break;
      default:
        logger.error("Unsupported frequency", { frequency });
        throw new Error(`Unsupported frequency: ${frequency}`);
    }

    logger.debug("Next run date calculated", {
      frequency,
      interval,
      nextDate,
    });

    return nextDate;
  }

  /**
   * Analyze subscription impact and generate recommendations
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Subscription analysis with recommendations
   */
  async analyzeSubscriptionImpact(userId) {
    try {
      const subscriptions = await this.prisma.recurringTransaction.findMany({
        where: {
          userId,
          isActive: true,
          type: "expense", // Focus on expense subscriptions
        },
      });

      if (subscriptions.length === 0) {
        logger.info("No active subscriptions found for user", { userId });
        return {
          message: "No active subscriptions found",
          recommendations: [],
        };
      }

      // Calculate costs based on frequency
      const monthlyCost = this.calculateMonthlyCost(subscriptions);
      const yearlyProjection = monthlyCost * 12;

      // Comprehensive subscription analysis
      const subscriptionAnalysis = {
        activeSubscriptions: subscriptions.length,
        monthlyCost: Math.round(monthlyCost * 100) / 100,
        yearlyProjection: Math.round(yearlyProjection * 100) / 100,
        byCategory: this.groupSubscriptionsByCategory(subscriptions),
        byFrequency: this.groupSubscriptionsByFrequency(subscriptions),
        upcomingCharges: this.getUpcomingCharges(subscriptions, 30), // Next 30 days
        breakdown: subscriptions.map((s) => ({
          id: s.id,
          name: s.description,
          amount: s.amount,
          frequency: s.frequency,
          category: s.category,
          nextCharge: s.nextRunDate,
          isEssential: this.isEssentialSubscription(s.description),
        })),
        recommendations: this.generateSubscriptionRecommendations(
          subscriptions,
          monthlyCost
        ),
        insights: this.generateSubscriptionInsights(subscriptions),
      };

      logger.info("Subscription impact analysis completed", {
        userId,
        subscriptionCount: subscriptions.length,
        monthlyCost: subscriptionAnalysis.monthlyCost,
      });

      return subscriptionAnalysis;
    } catch (error) {
      logger.error("Failed to analyze subscription impact", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate total monthly cost of subscriptions with frequency conversion
   * @param {Array} subscriptions - Array of subscription objects
   * @returns {number} Total monthly cost
   */
  calculateMonthlyCost(subscriptions) {
    let totalMonthly = 0;

    subscriptions.forEach((subscription) => {
      const amount = subscription.amount;
      let monthlyEquivalent = amount;

      // Convert different frequencies to monthly equivalent
      switch (subscription.frequency) {
        case "daily":
          monthlyEquivalent = amount * 30.44; // Average days in month
          break;
        case "weekly":
          monthlyEquivalent = amount * 4.345; // Average weeks in month
          break;
        case "biweekly":
          monthlyEquivalent = amount * 2.173; // Twice per month average
          break;
        case "monthly":
          monthlyEquivalent = amount;
          break;
        case "quarterly":
          monthlyEquivalent = amount / 3;
          break;
        case "yearly":
          monthlyEquivalent = amount / 12;
          break;
        default:
          monthlyEquivalent = amount;
      }

      totalMonthly += monthlyEquivalent;
    });

    return totalMonthly;
  }

  /**
   * Group subscriptions by category with aggregated metrics
   * @param {Array} subscriptions - Array of subscription objects
   * @returns {Object} Categories with aggregated data
   */
  groupSubscriptionsByCategory(subscriptions) {
    const categories = {};

    subscriptions.forEach((sub) => {
      const category = sub.category || "Uncategorized";
      if (!categories[category]) {
        categories[category] = {
          count: 0,
          totalAmount: 0,
          monthlyCost: 0,
        };
      }
      categories[category].count++;
      categories[category].totalAmount += sub.amount;

      // Calculate monthly equivalent for this subscription
      let monthlyEquivalent = sub.amount;
      switch (sub.frequency) {
        case "daily":
          monthlyEquivalent *= 30.44;
          break;
        case "weekly":
          monthlyEquivalent *= 4.345;
          break;
        case "biweekly":
          monthlyEquivalent *= 2.173;
          break;
        case "quarterly":
          monthlyEquivalent /= 3;
          break;
        case "yearly":
          monthlyEquivalent /= 12;
          break;
      }
      categories[category].monthlyCost += monthlyEquivalent;
    });

    return categories;
  }

  /**
   * Group subscriptions by frequency
   * @param {Array} subscriptions - Array of subscription objects
   * @returns {Object} Frequencies with aggregated data
   */
  groupSubscriptionsByFrequency(subscriptions) {
    const frequencies = {};

    subscriptions.forEach((sub) => {
      if (!frequencies[sub.frequency]) {
        frequencies[sub.frequency] = {
          count: 0,
          totalAmount: 0,
        };
      }
      frequencies[sub.frequency].count++;
      frequencies[sub.frequency].totalAmount += sub.amount;
    });

    return frequencies;
  }

  /**
   * Get upcoming charges within specified days
   * @param {Array} subscriptions - Array of subscription objects
   * @param {number} days - Number of days to look ahead
   * @returns {Array} Upcoming charges sorted by date
   */
  getUpcomingCharges(subscriptions, days = 30) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() + days);

    return subscriptions
      .filter((sub) => {
        const nextCharge = new Date(sub.nextRunDate);
        return nextCharge >= now && nextCharge <= cutoff;
      })
      .map((sub) => ({
        name: sub.description,
        amount: sub.amount,
        nextCharge: sub.nextRunDate,
        daysUntil: Math.ceil(
          (new Date(sub.nextRunDate) - now) / (1000 * 60 * 60 * 24)
        ),
      }))
      .sort((a, b) => new Date(a.nextCharge) - new Date(b.nextCharge));
  }

  /**
   * Determine if subscription is essential based on description keywords
   * @param {string} description - Subscription description
   * @returns {boolean} True if subscription is essential
   */
  isEssentialSubscription(description) {
    const essentialKeywords = [
      "insurance",
      "mortgage",
      "rent",
      "electricity",
      "water",
      "gas",
      "internet",
      "phone",
      "medical",
      "prescription",
      "loan",
    ];

    const lowerDesc = description.toLowerCase();
    return essentialKeywords.some((keyword) => lowerDesc.includes(keyword));
  }

  /**
   * Generate subscription recommendations based on analysis
   * @param {Array} subscriptions - Array of subscription objects
   * @param {number} monthlyCost - Total monthly cost
   * @returns {Array} Recommendation objects
   */
  generateSubscriptionRecommendations(subscriptions, monthlyCost) {
    const recommendations = [];

    // Cost-based recommendations
    if (monthlyCost > 300) {
      recommendations.push({
        type: "cost_reduction",
        title: "High Subscription Costs",
        message: `Your monthly subscriptions cost $${monthlyCost.toFixed(
          2
        )}. Consider reviewing unused services.`,
        priority: "high",
        action: "review_subscriptions",
        potentialSavings: Math.round(monthlyCost * 0.2), // Estimate 20% savings
      });
    } else if (monthlyCost > 150) {
      recommendations.push({
        type: "cost_reduction",
        title: "Moderate Subscription Costs",
        message: `Your monthly subscriptions cost $${monthlyCost.toFixed(2)}.`,
        priority: "medium",
        action: "analyze_usage",
        potentialSavings: Math.round(monthlyCost * 0.1), // Estimate 10% savings
      });
    }

    // Duplicate service recommendations
    const duplicateServices = this.findDuplicateServices(subscriptions);
    if (duplicateServices.length > 0) {
      recommendations.push({
        type: "optimization",
        title: "Duplicate Services Detected",
        message: `You have multiple similar subscriptions: ${duplicateServices
          .map((d) => d.category)
          .join(", ")}`,
        priority: "medium",
        action: "consolidate_services",
        affectedServices: duplicateServices,
      });
    }

    // Infrequently used subscription detection
    const infrequentSubs = this.identifyInfrequentSubscriptions(subscriptions);
    if (infrequentSubs.length > 0) {
      recommendations.push({
        type: "usage_optimization",
        title: "Potentially Underutilized Subscriptions",
        message: `${infrequentSubs.length} subscriptions may be underutilized`,
        priority: "low",
        action: "review_usage",
        subscriptions: infrequentSubs.slice(0, 3),
      });
    }

    // Annual savings opportunities
    const annualSavingsOpportunities =
      this.identifyAnnualSavings(subscriptions);
    if (annualSavingsOpportunities.length > 0) {
      recommendations.push({
        type: "savings_opportunity",
        title: "Annual Payment Savings",
        message: `Switch ${annualSavingsOpportunities.length} subscriptions to annual billing to save money`,
        priority: "medium",
        action: "switch_to_annual",
        potentialSavings: annualSavingsOpportunities.reduce(
          (sum, sub) => sum + sub.potentialSavings,
          0
        ),
        subscriptions: annualSavingsOpportunities,
      });
    }

    return recommendations;
  }

  /**
   * Find duplicate services by category patterns
   * @param {Array} subscriptions - Array of subscription objects
   * @returns {Array} Duplicate service categories
   */
  findDuplicateServices(subscriptions) {
    const servicePatterns = {
      streaming: [
        "netflix",
        "hulu",
        "disney",
        "hbo",
        "prime video",
        "streaming",
        "tv",
      ],
      music: ["spotify", "apple music", "youtube music", "pandora", "music"],
      cloud: ["dropbox", "google drive", "icloud", "onedrive", "cloud storage"],
      productivity: [
        "microsoft 365",
        "office 365",
        "adobe",
        "slack",
        "zoom",
        "teams",
      ],
      fitness: ["peloton", "apple fitness", "gym", "workout", "fitness app"],
    };

    const duplicateCategories = [];

    Object.entries(servicePatterns).forEach(([category, keywords]) => {
      const matches = subscriptions.filter((s) =>
        keywords.some((keyword) =>
          s.description.toLowerCase().includes(keyword.toLowerCase())
        )
      );

      if (matches.length > 1) {
        duplicateCategories.push({
          category,
          count: matches.length,
          subscriptions: matches.map((m) => ({
            name: m.description,
            amount: m.amount,
            frequency: m.frequency,
          })),
        });
      }
    });

    return duplicateCategories;
  }

  /**
   * Identify infrequently used expensive subscriptions
   * @param {Array} subscriptions - Array of subscription objects
   * @returns {Array} Infrequent subscription details
   */
  identifyInfrequentSubscriptions(subscriptions) {
    // Subscriptions that are expensive relative to frequency
    return subscriptions
      .filter((sub) => {
        const monthlyEquivalent = this.calculateMonthlyEquivalent(
          sub.amount,
          sub.frequency
        );
        return (
          monthlyEquivalent > 20 &&
          !this.isEssentialSubscription(sub.description)
        );
      })
      .map((sub) => ({
        name: sub.description,
        monthlyCost: this.calculateMonthlyEquivalent(sub.amount, sub.frequency),
        frequency: sub.frequency,
        lastUsed: sub.lastRun,
      }));
  }

  /**
   * Identify annual savings opportunities
   * @param {Array} subscriptions - Array of subscription objects
   * @returns {Array} Annual savings opportunities
   */
  identifyAnnualSavings(subscriptions) {
    const monthlySubs = subscriptions.filter(
      (sub) =>
        sub.frequency === "monthly" &&
        !this.isEssentialSubscription(sub.description) &&
        sub.amount > 5
    );

    return monthlySubs
      .map((sub) => {
        const annualCost = sub.amount * 12;
        const potentialSavings = annualCost * 0.1; // Assume 10% discount for annual payment

        return {
          name: sub.description,
          monthlyCost: sub.amount,
          annualCost,
          potentialSavings,
          savingsPercentage: 10,
        };
      })
      .filter((sub) => sub.potentialSavings > 10); // Only show if savings > $10
  }

  /**
   * Calculate monthly equivalent for any frequency
   * @param {number} amount - Subscription amount
   * @param {string} frequency - Subscription frequency
   * @returns {number} Monthly equivalent cost
   */
  calculateMonthlyEquivalent(amount, frequency) {
    switch (frequency) {
      case "daily":
        return amount * 30.44;
      case "weekly":
        return amount * 4.345;
      case "biweekly":
        return amount * 2.173;
      case "monthly":
        return amount;
      case "quarterly":
        return amount / 3;
      case "yearly":
        return amount / 12;
      default:
        return amount;
    }
  }

  /**
   * Generate subscription insights based on patterns
   * @param {Array} subscriptions - Array of subscription objects
   * @returns {Array} Insight objects
   */
  generateSubscriptionInsights(subscriptions) {
    const insights = [];

    const totalMonthlyCost = this.calculateMonthlyCost(subscriptions);
    const essentialSubs = subscriptions.filter((sub) =>
      this.isEssentialSubscription(sub.description)
    );
    const nonEssentialSubs = subscriptions.filter(
      (sub) => !this.isEssentialSubscription(sub.description)
    );

    const essentialCost = this.calculateMonthlyCost(essentialSubs);
    const nonEssentialCost = this.calculateMonthlyCost(nonEssentialSubs);

    // Cost distribution insight
    if (nonEssentialCost > essentialCost) {
      insights.push({
        type: "cost_distribution",
        title: "Non-Essential Dominance",
        message: `You spend more on non-essential subscriptions ($${nonEssentialCost.toFixed(
          2
        )}) than essentials ($${essentialCost.toFixed(2)})`,
        severity: "medium",
      });
    }

    // Subscription count insight
    if (subscriptions.length > 10) {
      insights.push({
        type: "subscription_count",
        title: "High Subscription Count",
        message: `You have ${subscriptions.length} active subscriptions`,
        severity: "low",
      });
    }

    // Upcoming charges insight
    const upcomingCharges = this.getUpcomingCharges(subscriptions, 7);
    if (upcomingCharges.length > 3) {
      const totalUpcoming = upcomingCharges.reduce(
        (sum, charge) => sum + charge.amount,
        0
      );
      insights.push({
        type: "upcoming_charges",
        title: "Multiple Upcoming Charges",
        message: `${
          upcomingCharges.length
        } subscriptions will charge $${totalUpcoming.toFixed(
          2
        )} in the next 7 days`,
        severity: "low",
      });
    }

    return insights;
  }

  /**
   * Get all active recurring transactions for a user
   * @param {string|number} userId - User identifier
   * @returns {Promise<Array>} Active recurring transactions
   */
  async getActiveRecurringTransactions(userId) {
    try {
      const transactions = await this.prisma.recurringTransaction.findMany({
        where: {
          userId,
          isActive: true,
          OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
        },
        include: {
          account: true,
        },
        orderBy: {
          nextRunDate: "asc",
        },
      });

      logger.debug("Active recurring transactions retrieved", {
        userId,
        count: transactions.length,
      });

      return transactions;
    } catch (error) {
      logger.error("Failed to get active recurring transactions", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process due recurring transactions (cron job)
   * @returns {Promise<Object>} Processing results
   */
  async processDueRecurringTransactions() {
    try {
      const now = new Date();

      const dueTransactions = await this.prisma.recurringTransaction.findMany({
        where: {
          isActive: true,
          nextRunDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gt: now } }],
        },
        include: {
          account: true,
        },
      });

      if (dueTransactions.length === 0) {
        logger.info("No due recurring transactions to process");
        return {
          processed: 0,
          failed: 0,
          results: [],
        };
      }

      const results = [];

      for (const recurring of dueTransactions) {
        try {
          const transaction = await this.executeRecurringTransaction(recurring);
          await this.updateNextRunDate(recurring);
          await this.sendSubscriptionNotification(recurring, transaction);

          results.push({
            success: true,
            recurringId: recurring.id,
            transactionId: transaction.id,
            description: recurring.description,
            amount: recurring.amount,
          });
        } catch (error) {
          logger.error("Failed to process recurring transaction", {
            recurringId: recurring.id,
            error: error.message,
          });
          results.push({
            success: false,
            recurringId: recurring.id,
            error: error.message,
            description: recurring.description,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      logger.info("Recurring transactions processed", {
        total: dueTransactions.length,
        success: successCount,
        failed: failedCount,
      });

      return {
        processed: successCount,
        failed: failedCount,
        results,
      };
    } catch (error) {
      logger.error("Failed to process due recurring transactions", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a recurring transaction
   * @param {Object} recurring - Recurring transaction object
   * @returns {Promise<Object>} Created transaction
   */
  async executeRecurringTransaction(recurring) {
    // Determine if transaction should be auto-approved
    const shouldAutoApprove =
      recurring.autoApprove || recurring.type === "income";

    if (!shouldAutoApprove) {
      // For non-auto-approved expenses, create a pending transaction
      const transaction = await this.prisma.transaction.create({
        data: {
          accountId: recurring.accountId,
          amount:
            recurring.type === "expense" ? -recurring.amount : recurring.amount,
          type: recurring.type,
          category: recurring.category,
          description: recurring.description,
          date: new Date(),
          isRecurring: true,
          recurringTransactionId: recurring.id,
          status: "pending",
        },
      });

      logger.debug("Pending transaction created for approval", {
        transactionId: transaction.id,
        recurringId: recurring.id,
      });

      return transaction;
    }

    // Create and process the transaction immediately
    const transaction = await this.prisma.transaction.create({
      data: {
        accountId: recurring.accountId,
        amount:
          recurring.type === "expense" ? -recurring.amount : recurring.amount,
        type: recurring.type,
        category: recurring.category,
        description: recurring.description,
        date: new Date(),
        isRecurring: true,
        recurringTransactionId: recurring.id,
        status: "completed",
      },
    });

    // Update account balance for auto-approved transactions
    if (shouldAutoApprove) {
      await this.prisma.account.update({
        where: { id: recurring.accountId },
        data: {
          balance: {
            increment:
              recurring.type === "income"
                ? recurring.amount
                : -recurring.amount,
          },
        },
      });

      logger.debug("Account balance updated for auto-approved transaction", {
        accountId: recurring.accountId,
        amount:
          recurring.type === "income" ? recurring.amount : -recurring.amount,
      });
    }

    return transaction;
  }

  /**
   * Update next run date for recurring transaction
   * @param {Object} recurring - Recurring transaction object
   * @returns {Promise<Object>} Updated recurring transaction
   */
  async updateNextRunDate(recurring) {
    const nextDate = this.calculateNextRunDate(
      recurring.nextRunDate,
      recurring.frequency,
      recurring.interval
    );

    // Check if we've reached the end date
    const shouldDeactivate =
      recurring.endDate && nextDate > new Date(recurring.endDate);

    const updated = await this.prisma.recurringTransaction.update({
      where: { id: recurring.id },
      data: {
        nextRunDate: shouldDeactivate ? null : nextDate,
        lastRun: new Date(),
        totalRuns: { increment: 1 },
        isActive: !shouldDeactivate,
      },
    });

    logger.debug("Next run date updated", {
      recurringId: recurring.id,
      newNextRunDate: updated.nextRunDate,
      deactivated: shouldDeactivate,
    });

    return updated;
  }

  /**
   * Send subscription notification for processed transaction
   * @param {Object} subscription - Subscription object
   * @param {Object} transaction - Created transaction
   * @returns {Promise<Object>} Created notification
   */
  async sendSubscriptionNotification(subscription, transaction) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: subscription.userId,
          type: "subscription",
          title: `Subscription Processed: ${subscription.description}`,
          message: `$${Math.abs(transaction.amount)} ${subscription.type} for ${
            subscription.description
          }`,
          data: {
            subscriptionId: subscription.id,
            transactionId: transaction.id,
            amount: transaction.amount,
            type: subscription.type,
          },
          isRead: false,
        },
      });

      logger.debug("Subscription notification created", {
        notificationId: notification.id,
        userId: subscription.userId,
        subscriptionId: subscription.id,
      });

      return notification;
    } catch (error) {
      logger.error("Failed to create subscription notification", {
        subscriptionId: subscription.id,
        error: error.message,
      });
      // Don't throw error as notification failure shouldn't break transaction processing
    }
  }

  /**
   * Get comprehensive subscription analytics dashboard
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Subscription analytics
   */
  async getSubscriptionAnalytics(userId) {
    try {
      const [subscriptions, transactionHistory] = await Promise.all([
        this.getActiveRecurringTransactions(userId),
        this.prisma.transaction.findMany({
          where: {
            account: { userId },
            isRecurring: true,
            status: "completed",
            date: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
            },
          },
          orderBy: { date: "desc" },
        }),
      ]);

      const analysis = await this.analyzeSubscriptionImpact(userId);

      // Calculate monthly trends from transaction history
      const monthlyTrends = this.calculateMonthlyTrends(transactionHistory);

      const result = {
        summary: {
          activeSubscriptions: analysis.activeSubscriptions,
          monthlyCost: analysis.monthlyCost,
          yearlyProjection: analysis.yearlyProjection,
          essentialRatio: this.calculateEssentialRatio(subscriptions),
        },
        upcomingCharges: analysis.upcomingCharges,
        categories: analysis.byCategory,
        monthlyTrends,
        recommendations: analysis.recommendations,
        insights: analysis.insights,
      };

      logger.info("Subscription analytics generated", {
        userId,
        subscriptionCount: subscriptions.length,
        monthlyCost: result.summary.monthlyCost,
      });

      return result;
    } catch (error) {
      logger.error("Failed to get subscription analytics", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate monthly trends from transaction history
   * @param {Array} transactions - Transaction history
   * @returns {Array} Monthly trend data
   */
  calculateMonthlyTrends(transactions) {
    const monthlyData = {};

    transactions.forEach((transaction) => {
      const monthYear = new Date(transaction.date).toISOString().slice(0, 7); // YYYY-MM format
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = {
          total: 0,
          count: 0,
        };
      }
      monthlyData[monthYear].total += Math.abs(transaction.amount);
      monthlyData[monthYear].count++;
    });

    // Convert to array and sort by date
    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        total: data.total,
        count: data.count,
        average: data.total / data.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Calculate essential vs non-essential subscription ratio
   * @param {Array} subscriptions - Subscription array
   * @returns {Object|null} Essential ratio metrics or null if no subscriptions
   */
  calculateEssentialRatio(subscriptions) {
    const essential = subscriptions.filter((sub) =>
      this.isEssentialSubscription(sub.description)
    ).length;
    const total = subscriptions.length;

    return total > 0
      ? {
          essentialCount: essential,
          nonEssentialCount: total - essential,
          essentialPercentage: (essential / total) * 100,
        }
      : null;
  }

  /**
   * Cancel a subscription
   * @param {string|number} subscriptionId - Subscription ID
   * @param {string|number} userId - User identifier
   * @param {string} [reason='user_requested'] - Cancellation reason
   * @returns {Promise<Object>} Cancelled subscription
   */
  async cancelSubscription(subscriptionId, userId, reason = "user_requested") {
    try {
      const subscription = await this.prisma.recurringTransaction.findFirst({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      });

      if (!subscription) {
        logger.warn("Subscription not found or unauthorized", {
          subscriptionId,
          userId,
        });
        throw new Error("Subscription not found or unauthorized");
      }

      const cancelled = await this.prisma.recurringTransaction.update({
        where: { id: subscriptionId },
        data: {
          isActive: false,
          endDate: new Date(),
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });

      logger.info("Subscription cancelled", {
        subscriptionId,
        userId,
        reason,
      });

      return cancelled;
    } catch (error) {
      logger.error("Failed to cancel subscription", {
        subscriptionId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cleanup database connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      logger.debug("RecurringService cleanup completed");
    } catch (error) {
      logger.error("RecurringService cleanup failed", { error: error.message });
      throw error;
    }
  }
}
