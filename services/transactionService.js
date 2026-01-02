// transactionService.js
// Service for managing financial transactions with fraud detection and budget enforcement
import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * Service for managing financial transactions with fraud detection, budget enforcement, and security logging
 * @class TransactionService
 */
export class TransactionService {
  /**
   * Create a new TransactionService instance
   * @constructor
   */
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all transactions for a user
   * @param {string} userId - User ID
   * @param {boolean} includeAccount - Whether to include account details
   * @returns {Promise<Array>} List of user transactions
   */
  async getUserTransactions(userId, includeAccount = true) {
    try {
      logger.debug(`Fetching transactions for user: ${userId}`);

      return await this.prisma.transaction.findMany({
        where: {
          account: {
            userId: userId,
          },
        },
        include: {
          account: includeAccount,
        },
        orderBy: {
          date: "desc",
        },
      });
    } catch (error) {
      logger.error(`Failed to fetch user transactions: ${error.message}`, {
        userId,
      });
      throw error;
    }
  }

  /**
   * Create a new transaction with fraud detection and budget validation
   * @param {Object} data - Transaction data
   * @param {string} userId - User ID
   * @param {string} ipAddress - IP address for security logging
   * @returns {Promise<Object>} Created transaction with fraud status
   * @throws {Error} If validation fails or budget limits exceeded
   */
  async createTransaction(data, userId, ipAddress) {
    try {
      logger.info(
        `Creating transaction for user: ${userId}, Type: ${data.type}, Amount: ${data.amount}`
      );

      // Auto-find the user's first account
      const account = await this.prisma.account.findFirst({
        where: {
          userId: userId,
        },
      });

      if (!account) {
        const error = new Error("No account found for user");
        logger.warn(`No account found for user: ${userId}`);
        throw error;
      }

      // Prepare transaction data with proper sign handling (negative for expenses)
      const transactionData = {
        accountId: account.id,
        amount:
          data.type === "expense"
            ? -Math.abs(data.amount)
            : Math.abs(data.amount),
        type: data.type,
        category: data.category.trim(),
        date: new Date(data.date),
        description: data.description ? data.description.trim() : null,
        flagged: false,
        fraudReason: null,
        riskScore: 0,
      };

      // Budget enforcement check
      const budgetCheck = await this.checkBudgetLimits(
        data,
        userId,
        transactionData.amount
      );
      if (budgetCheck.error && !budgetCheck.allowExceed) {
        const error = new Error(budgetCheck.error);
        logger.warn(`Budget limit exceeded: ${budgetCheck.error}`, {
          userId,
          category: data.category,
          amount: data.amount,
        });
        throw error;
      }

      // Fraud detection logic
      const fraudDetection = await this.detectFraud(data, userId);
      if (fraudDetection.detected) {
        transactionData.flagged = true;
        transactionData.fraudReason = fraudDetection.reason;
        transactionData.riskScore = fraudDetection.riskScore;

        logger.warn(`Transaction flagged for fraud: ${fraudDetection.reason}`, {
          userId,
          amount: data.amount,
          riskScore: fraudDetection.riskScore,
        });

        await this.logSecurityEvent({
          userId,
          action: "transaction_flagged",
          ipAddress,
          details: fraudDetection.reason,
          riskScore: fraudDetection.riskScore,
        });
      }

      // Create the transaction
      const transaction = await this.prisma.transaction.create({
        data: transactionData,
      });

      logger.info(`Transaction created successfully: ${transaction.id}`, {
        transactionId: transaction.id,
        flagged: transactionData.flagged,
      });

      return {
        transaction,
        warning: fraudDetection.detected
          ? "This transaction has been flagged for review"
          : null,
        fraudReason: fraudDetection.reason,
      };
    } catch (error) {
      logger.error(`Failed to create transaction: ${error.message}`, {
        userId,
        transactionType: data.type,
        amount: data.amount,
      });
      throw error;
    }
  }

  /**
   * Check if transaction exceeds budget limits
   * @param {Object} data - Transaction data
   * @param {string} userId - User ID
   * @param {number} transactionAmount - Transaction amount (with sign)
   * @returns {Promise<Object>} Budget check result
   * @private
   */
  async checkBudgetLimits(data, userId, transactionAmount) {
    // Only check expenses against budget
    if (data.type !== "expense") {
      return { allowed: true };
    }

    const budget = await this.prisma.budget.findFirst({
      where: {
        userId,
        category: data.category,
        isActive: true,
      },
    });

    if (!budget) {
      return { allowed: true };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculate current spending for this month
    const currentSpending = await this.prisma.transaction.aggregate({
      where: {
        account: { userId },
        type: "expense",
        category: data.category,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const currentSpent = Math.abs(currentSpending._sum.amount || 0);
    const absoluteAmount = Math.abs(transactionAmount);
    const wouldBeTotal = currentSpent + absoluteAmount;

    // Check if transaction would exceed budget
    if (wouldBeTotal > budget.limit) {
      const overspendAmount = wouldBeTotal - budget.limit;

      if (!budget.allowExceed) {
        return {
          allowed: false,
          error: `Transaction would exceed ${budget.category} budget limit`,
          details: {
            budgetCategory: budget.category,
            budgetLimit: budget.limit,
            currentSpent,
            transactionAmount: absoluteAmount,
            wouldBeTotal,
            overspendAmount,
            suggestion: `Reduce amount to ${(
              budget.limit - currentSpent
            ).toFixed(2)} or less`,
          },
        };
      } else {
        // Budget allows exceeding, but log warning
        logger.warn(
          `Transaction exceeds budget but allowed: ${budget.category}`,
          {
            userId,
            category: budget.category,
            overspendAmount,
          }
        );

        return {
          allowed: true,
          allowExceed: true,
          warning: `This expense exceeds your ${
            budget.category
          } budget by $${overspendAmount.toFixed(2)}`,
          riskScore: 60,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Detect potential fraud patterns in transaction
   * @param {Object} data - Transaction data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Fraud detection result
   * @private
   */
  async detectFraud(data, userId) {
    // Only detect fraud on expense transactions
    if (data.type !== "expense") {
      return { detected: false };
    }

    const averageAmount = await this.calculateAverageTransaction(userId);
    const absoluteAmount = Math.abs(data.amount);

    // Flag if amount is 5x larger than user's average spending
    if (absoluteAmount > averageAmount * 5) {
      return {
        detected: true,
        reason: `Amount ($${absoluteAmount}) significantly higher than average spending ($${averageAmount.toFixed(
          2
        )})`,
        riskScore: 85,
      };
    }

    return { detected: false };
  }

  /**
   * Calculate average transaction amount for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Average transaction amount
   * @private
   */
  async calculateAverageTransaction(userId) {
    try {
      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId },
          type: "expense",
        },
      });

      // Return default average if no transactions exist
      if (transactions.length === 0) {
        return 100; // Default baseline average
      }

      const total = transactions.reduce(
        (sum, tx) => sum + Math.abs(tx.amount),
        0
      );
      return total / transactions.length;
    } catch (error) {
      logger.error(
        `Failed to calculate average transaction: ${error.message}`,
        { userId }
      );
      return 100; // Fallback default
    }
  }

  /**
   * Log security event to database
   * @param {Object} eventData - Security event data
   * @returns {Promise<Object|null>} Logged event or null on failure
   * @private
   */
  async logSecurityEvent(eventData) {
    try {
      const securityLog = await this.prisma.securityLog.create({
        data: {
          userId: eventData.userId,
          action: eventData.action,
          ipAddress: eventData.ipAddress,
          details: eventData.details,
          riskScore: eventData.riskScore || 0,
        },
      });

      logger.debug(`Security event logged: ${eventData.action}`, {
        userId: eventData.userId,
        riskScore: eventData.riskScore,
      });

      return securityLog;
    } catch (error) {
      // Log to Winston but don't throw - security logging should not break transaction flow
      logger.error(`Failed to log security event: ${error.message}`, {
        action: eventData.action,
        userId: eventData.userId,
      });
      return null;
    }
  }

  /**
   * Update an existing transaction
   * @param {string} id - Transaction ID
   * @param {Object} data - Updated transaction data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated transaction
   */
  async updateTransaction(id, data, userId) {
    try {
      logger.info(`Updating transaction: ${id} for user: ${userId}`);

      const updateData = {
        amount:
          data.type === "expense"
            ? -Math.abs(data.amount)
            : Math.abs(data.amount),
        type: data.type,
        category: data.category.trim(),
        date: new Date(data.date),
        description: data.description ? data.description.trim() : null,
      };

      const transaction = await this.prisma.transaction.update({
        where: {
          id: parseInt(id),
          account: {
            userId: userId,
          },
        },
        data: updateData,
      });

      logger.debug(`Transaction updated successfully: ${id}`);
      return transaction;
    } catch (error) {
      logger.error(`Failed to update transaction: ${error.message}`, {
        transactionId: id,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete a transaction
   * @param {string} id - Transaction ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deleted transaction
   */
  async deleteTransaction(id, userId) {
    try {
      logger.info(`Deleting transaction: ${id} for user: ${userId}`);

      const transaction = await this.prisma.transaction.delete({
        where: {
          id: parseInt(id),
          account: {
            userId: userId,
          },
        },
      });

      logger.debug(`Transaction deleted successfully: ${id}`);
      return transaction;
    } catch (error) {
      logger.error(`Failed to delete transaction: ${error.message}`, {
        transactionId: id,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get all flagged transactions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of flagged transactions
   */
  async getFlaggedTransactions(userId) {
    try {
      logger.debug(`Fetching flagged transactions for user: ${userId}`);

      return await this.prisma.transaction.findMany({
        where: {
          account: { userId },
          flagged: true,
        },
        include: {
          account: true,
        },
        orderBy: {
          date: "desc",
        },
      });
    } catch (error) {
      logger.error(`Failed to fetch flagged transactions: ${error.message}`, {
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark a transaction as reviewed (clear fraud flag)
   * @param {string} transactionId - Transaction ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated transaction
   */
  async markAsReviewed(transactionId, userId) {
    try {
      logger.info(
        `Marking transaction as reviewed: ${transactionId} for user: ${userId}`
      );

      const transaction = await this.prisma.transaction.update({
        where: {
          id: transactionId,
          account: {
            userId: userId,
          },
        },
        data: {
          flagged: false,
          reviewed: true,
          fraudReason: null,
          riskScore: 0,
        },
      });

      logger.debug(`Transaction marked as reviewed: ${transactionId}`);
      return transaction;
    } catch (error) {
      logger.error(`Failed to mark transaction as reviewed: ${error.message}`, {
        transactionId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get transaction summary for a user within a timeframe
   * @param {string} userId - User ID
   * @param {string} timeframe - Timeframe: 'daily', 'weekly', 'monthly', 'yearly'
   * @returns {Promise<Object>} Transaction summary
   */
  async getTransactionSummary(userId, timeframe = "monthly") {
    try {
      logger.debug(
        `Generating transaction summary for user: ${userId}, timeframe: ${timeframe}`
      );

      const dateFilter = this.getDateFilter(timeframe);

      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId },
          date: dateFilter,
        },
        include: {
          account: true,
          mood: true,
        },
      });

      const summary = {
        totalIncome: 0,
        totalExpenses: 0,
        netFlow: 0,
        transactionCount: transactions.length,
        byCategory: {},
        byType: { income: 0, expense: 0 },
      };

      // Aggregate transaction data
      transactions.forEach((transaction) => {
        const amount = Math.abs(transaction.amount);

        if (transaction.type === "income") {
          summary.totalIncome += amount;
          summary.byType.income++;
        } else {
          summary.totalExpenses += amount;
          summary.byType.expense++;
        }

        // Group by category for detailed analysis
        const category = transaction.category;
        if (!summary.byCategory[category]) {
          summary.byCategory[category] = {
            total: 0,
            count: 0,
            type: transaction.type,
          };
        }
        summary.byCategory[category].total += amount;
        summary.byCategory[category].count++;
      });

      summary.netFlow = summary.totalIncome - summary.totalExpenses;

      logger.debug(
        `Transaction summary generated: ${summary.transactionCount} transactions`
      );
      return summary;
    } catch (error) {
      logger.error(`Failed to generate transaction summary: ${error.message}`, {
        userId,
        timeframe,
      });
      throw error;
    }
  }

  /**
   * Helper to get date filter object based on timeframe
   * @param {string} timeframe - 'daily', 'weekly', 'monthly', 'yearly'
   * @returns {Object} Date filter for Prisma queries
   * @private
   */
  getDateFilter(timeframe) {
    const now = new Date();
    const from = new Date();

    switch (timeframe) {
      case "daily":
        from.setDate(now.getDate() - 1);
        break;
      case "weekly":
        from.setDate(now.getDate() - 7);
        break;
      case "monthly":
        from.setMonth(now.getMonth() - 1);
        break;
      case "yearly":
        from.setFullYear(now.getFullYear() - 1);
        break;
      default:
        from.setMonth(now.getMonth() - 1); // Default to monthly
    }

    return {
      gte: from,
      lte: now,
    };
  }

  /**
   * Cleanup database connection
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      logger.debug("TransactionService cleanup completed");
    } catch (error) {
      logger.error("Error during TransactionService cleanup", {
        error: error.message,
      });
      throw error;
    }
  }
}
