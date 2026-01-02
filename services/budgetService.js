// budgetService.js
// Service for budget management, smart recommendations, and spending analysis

import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * Service class for budget management with predictive analytics and spending insights
 * Handles budget creation, tracking, rollovers, and smart recommendations
 */
export class BudgetService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all budgets for a user
   * @param {string|number} userId - User identifier
   * @returns {Promise<Array>} List of user budgets
   */
  async getUserBudgets(userId) {
    try {
      const budgets = await this.prisma.budget.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      logger.debug("User budgets retrieved", { userId, count: budgets.length });
      return budgets;
    } catch (error) {
      logger.error("Failed to get user budgets", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create new budget for a user
   * @param {Object} data - Budget data
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Created budget
   */
  async createBudget(data, userId) {
    try {
      const limit = parseFloat(data.limit);
      if (isNaN(limit) || limit < 0) {
        logger.warn("Invalid budget limit provided", {
          userId,
          limit: data.limit,
        });
        throw new Error("Invalid budget limit");
      }

      const budget = await this.prisma.budget.create({
        data: {
          userId,
          category: data.category,
          limit,
          period: data.period || "monthly",
          spent: 0,
          rolloverType: data.rolloverType || "none",
          rolloverAmount: data.rolloverAmount
            ? parseFloat(data.rolloverAmount)
            : 0,
          allowExceed: data.allowExceed || false,
        },
      });

      logger.info("Budget created successfully", {
        userId,
        budgetId: budget.id,
        category: budget.category,
        limit: budget.limit,
      });

      return budget;
    } catch (error) {
      logger.error("Failed to create budget", { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update existing budget
   * @param {string|number} id - Budget ID
   * @param {Object} data - Update data
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Updated budget
   */
  async updateBudget(id, data, userId) {
    try {
      const budgetId = parseInt(id);
      if (isNaN(budgetId)) {
        throw new Error("Invalid budget ID");
      }

      const updateData = {};

      // Only update provided fields
      if (data.category !== undefined) updateData.category = data.category;
      if (data.limit !== undefined) {
        const limit = parseFloat(data.limit);
        if (isNaN(limit) || limit < 0) {
          throw new Error("Invalid budget limit");
        }
        updateData.limit = limit;
      }
      if (data.period !== undefined) updateData.period = data.period;
      if (data.rolloverType !== undefined)
        updateData.rolloverType = data.rolloverType;
      if (data.rolloverAmount !== undefined)
        updateData.rolloverAmount = parseFloat(data.rolloverAmount);
      if (data.allowExceed !== undefined)
        updateData.allowExceed = data.allowExceed;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const budget = await this.prisma.budget.update({
        where: {
          id: budgetId,
          userId,
        },
        data: updateData,
      });

      logger.info("Budget updated successfully", {
        userId,
        budgetId,
        updatedFields: Object.keys(updateData),
      });

      return budget;
    } catch (error) {
      logger.error("Failed to update budget", {
        budgetId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a budget
   * @param {string|number} id - Budget ID
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Deleted budget
   */
  async deleteBudget(id, userId) {
    try {
      const budgetId = parseInt(id);
      if (isNaN(budgetId)) {
        throw new Error("Invalid budget ID");
      }

      const budget = await this.prisma.budget.delete({
        where: {
          id: budgetId,
          userId,
        },
      });

      logger.info("Budget deleted successfully", { userId, budgetId });
      return budget;
    } catch (error) {
      logger.error("Failed to delete budget", {
        budgetId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  // PREDICTIVE BUDGETING METHODS

  /**
   * Generate smart budget recommendations from transaction history
   * @param {Array} transactions - Transaction history
   * @returns {Array} Budget recommendations with confidence scores
   */
  generateSmartBudgets(transactions) {
    const categorySpending = this.analyzeCategorySpending(transactions);
    const recommendations = [];

    Object.entries(categorySpending).forEach(([category, data]) => {
      const recommendedLimit = this.calculateOptimalBudget(data);

      recommendations.push({
        category,
        currentSpending: data.total,
        recommendedLimit,
        confidence: this.calculateConfidence(data),
        suggestion: "create",
      });
    });

    logger.debug("Smart budget recommendations generated", {
      recommendationCount: recommendations.length,
    });

    return recommendations;
  }

  /**
   * Analyze spending patterns by category
   * @param {Array} transactions - Transaction history
   * @returns {Object} Category spending analysis
   */
  analyzeCategorySpending(transactions) {
    const categoryData = {};

    // Process only expense transactions
    transactions
      .filter((tx) => tx.type === "expense")
      .forEach((tx) => {
        const category = tx.category;
        const amount = Math.abs(tx.amount);

        if (!categoryData[category]) {
          categoryData[category] = {
            total: 0,
            count: 0,
            amounts: [],
            months: new Set(),
          };
        }

        categoryData[category].total += amount;
        categoryData[category].count += 1;
        categoryData[category].amounts.push(amount);

        // Track which months we have data for (YYYY-MM format)
        if (tx.date) {
          const month = new Date(tx.date).toISOString().slice(0, 7);
          categoryData[category].months.add(month);
        }
      });

    return categoryData;
  }

  /**
   * Calculate optimal budget limit based on spending patterns
   * @param {Object} categoryData - Category spending data
   * @returns {number} Recommended budget limit
   */
  calculateOptimalBudget(categoryData) {
    const { total, count, months } = categoryData;

    if (count === 0) return 0;

    const average = total / count;

    // Use different buffer strategies based on data quality
    let buffer;
    if (months.size >= 3) {
      // Multiple months of data, more confident - 15% buffer
      buffer = average * 0.15;
    } else if (count >= 5) {
      // Good transaction count but limited time span - 20% buffer
      buffer = average * 0.2;
    } else {
      // Limited data, be more conservative - 25% buffer
      buffer = average * 0.25;
    }

    return Math.ceil(average + buffer);
  }

  /**
   * Calculate confidence score for budget recommendations
   * @param {Object} categoryData - Category spending data
   * @returns {string} Confidence level (low/medium/high)
   */
  calculateConfidence(categoryData) {
    const { count, amounts, months } = categoryData;

    if (count < 3) return "low";

    if (months.size >= 3) {
      // Multiple months of data, check consistency
      if (count >= 10) return "high";
      return "medium";
    }

    if (count < 5) return "low";
    if (count < 10) return "medium";

    // Calculate coefficient of variation for recent transactions
    const recentCount = Math.min(20, count);
    const recentAmounts = amounts.slice(-recentCount);
    const recentTotal = recentAmounts.reduce((a, b) => a + b, 0);
    const recentAvg = recentTotal / recentCount;

    // Calculate variance and standard deviation
    const variance =
      recentAmounts.reduce(
        (sum, amount) => sum + Math.pow(amount - recentAvg, 2),
        0
      ) / recentCount;
    const stdDev = Math.sqrt(variance);
    const cv = recentAvg > 0 ? stdDev / recentAvg : 0;

    // Classify confidence based on coefficient of variation
    return cv < 0.4 ? "high" : cv < 0.7 ? "medium" : "low";
  }

  /**
   * Calculate rollover amount for a budget
   * @param {string|number} budgetId - Budget ID
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Rollover calculation results
   */
  async calculateRollover(budgetId, userId) {
    try {
      const id = parseInt(budgetId);
      if (isNaN(id)) {
        throw new Error("Invalid budget ID");
      }

      const budget = await this.prisma.budget.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!budget) {
        logger.warn("Budget not found for rollover calculation", {
          budgetId: id,
          userId,
        });
        throw new Error("Budget not found");
      }

      const unusedAmount = budget.limit - budget.spent;
      let rollover = 0;

      // Apply rollover logic based on rollover type
      switch (budget.rolloverType) {
        case "full":
          // Full unused amount rolls over
          rollover = Math.max(0, unusedAmount);
          break;
        case "partial":
          // Percentage of unused amount rolls over
          rollover = Math.max(0, unusedAmount * (budget.rolloverAmount / 100));
          break;
        case "capped":
          // Rollover capped at specified amount
          rollover = Math.min(Math.max(0, unusedAmount), budget.rolloverAmount);
          break;
        default: // "none"
          rollover = 0;
      }

      const result = {
        currentLimit: budget.limit,
        spent: budget.spent,
        unusedAmount,
        rolloverType: budget.rolloverType,
        rolloverAmount: budget.rolloverAmount,
        calculatedRollover: rollover,
        newLimit: budget.limit + rollover,
      };

      logger.debug("Rollover calculated", { budgetId: id, userId, ...result });
      return result;
    } catch (error) {
      logger.error("Failed to calculate rollover", {
        budgetId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update spent amount for a budget (called when transactions occur)
   * @param {string|number} budgetId - Budget ID
   * @param {number} amount - Amount to add to spent
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Updated budget
   */
  async updateSpentAmount(budgetId, amount, userId) {
    try {
      const id = parseInt(budgetId);
      if (isNaN(id)) {
        throw new Error("Invalid budget ID");
      }

      const budget = await this.prisma.budget.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!budget) {
        logger.warn("Budget not found for spend update", {
          budgetId: id,
          userId,
        });
        throw new Error("Budget not found");
      }

      const updatedBudget = await this.prisma.budget.update({
        where: { id },
        data: {
          spent: budget.spent + Math.abs(amount),
        },
      });

      logger.debug("Budget spent amount updated", {
        budgetId: id,
        userId,
        previousSpent: budget.spent,
        newSpent: updatedBudget.spent,
      });

      return updatedBudget;
    } catch (error) {
      logger.error("Failed to update budget spent amount", {
        budgetId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Reset monthly spent amounts (cron job method)
   * @returns {Promise<number>} Number of budgets reset
   */
  async resetMonthlySpent() {
    try {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Find monthly budgets that need reset (last updated before current month)
      const monthlyBudgets = await this.prisma.budget.findMany({
        where: {
          period: "monthly",
          OR: [{ updatedAt: { lt: firstOfMonth } }, { updatedAt: null }],
        },
      });

      let resetCount = 0;

      for (const budget of monthlyBudgets) {
        try {
          // Apply rollover before resetting
          const rollover = await this.calculateRollover(
            budget.id,
            budget.userId
          );

          await this.prisma.budget.update({
            where: { id: budget.id },
            data: {
              spent: 0,
              limit: rollover.newLimit,
              updatedAt: new Date(),
            },
          });

          resetCount++;
        } catch (budgetError) {
          logger.error("Failed to reset individual budget", {
            budgetId: budget.id,
            error: budgetError.message,
          });
        }
      }

      logger.info("Monthly budget reset completed", {
        budgetsFound: monthlyBudgets.length,
        budgetsReset: resetCount,
      });

      return resetCount;
    } catch (error) {
      logger.error("Failed to reset monthly budgets", { error: error.message });
      throw error;
    }
  }

  /**
   * Check if transaction would exceed budget limit
   * @param {string|number} userId - User identifier
   * @param {string} category - Transaction category
   * @param {number} amount - Transaction amount
   * @returns {Promise<Object>} Budget check result
   */
  async checkBudgetLimit(userId, category, amount) {
    try {
      const budget = await this.prisma.budget.findFirst({
        where: {
          userId,
          category,
          isActive: true,
        },
      });

      if (!budget) {
        logger.debug("No active budget for category", { userId, category });
        return { allowed: true, budget: null };
      }

      const now = new Date();
      const startOfPeriod = this.getPeriodStartDate(budget.period, now);

      // Calculate current spending for the period
      const currentSpending = await this.prisma.transaction.aggregate({
        where: {
          account: { userId },
          type: "expense",
          category,
          date: { gte: startOfPeriod },
        },
        _sum: {
          amount: true,
        },
      });

      const currentSpent = Math.abs(currentSpending._sum.amount || 0);
      const wouldBeTotal = currentSpent + Math.abs(amount);

      // Check if transaction would exceed budget
      if (wouldBeTotal > budget.limit) {
        const overspendAmount = wouldBeTotal - budget.limit;

        if (!budget.allowExceed) {
          logger.warn("Transaction would exceed budget limit", {
            userId,
            category,
            currentSpent,
            budgetLimit: budget.limit,
            wouldBeTotal,
          });

          return {
            allowed: false,
            budget,
            currentSpent,
            wouldBeTotal,
            overspendAmount,
            suggestion: `Reduce amount to ${(
              budget.limit - currentSpent
            ).toFixed(2)} or less`,
          };
        } else {
          logger.warn("Transaction exceeds budget but allowExceed is true", {
            userId,
            category,
            overspendAmount,
          });

          return {
            allowed: true,
            budget,
            warning: `This expense exceeds your ${
              budget.category
            } budget by $${overspendAmount.toFixed(2)}`,
            riskScore: 60,
          };
        }
      }

      return { allowed: true, budget };
    } catch (error) {
      logger.error("Failed to check budget limit", {
        userId,
        category,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get period start date based on budget period type
   * @param {string} period - Budget period (daily/weekly/monthly/yearly)
   * @param {Date} now - Current date
   * @returns {Date} Start date of current period
   */
  getPeriodStartDate(period, now = new Date()) {
    const startDate = new Date(now);

    switch (period) {
      case "daily":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "weekly":
        // Start of week (Sunday)
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        break;
      case "monthly":
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "yearly":
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        // Default to monthly
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
    }

    return startDate;
  }

  /**
   * Get budget summary for dashboard display
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Budget summary
   */
  async getBudgetSummary(userId) {
    try {
      const budgets = await this.getUserBudgets(userId);

      const summary = {
        totalBudgets: budgets.length,
        activeBudgets: budgets.filter((b) => b.isActive).length,
        totalLimit: budgets.reduce((sum, b) => sum + b.limit, 0),
        totalSpent: budgets.reduce((sum, b) => sum + b.spent, 0),
        byCategory: {},
        nearingLimit: [],
        exceededBudgets: [],
      };

      budgets.forEach((budget) => {
        // Group by category
        if (!summary.byCategory[budget.category]) {
          summary.byCategory[budget.category] = {
            limit: 0,
            spent: 0,
            percentage: 0,
          };
        }
        summary.byCategory[budget.category].limit += budget.limit;
        summary.byCategory[budget.category].spent += budget.spent;

        // Calculate spending percentage
        const percentage = (budget.spent / budget.limit) * 100;
        summary.byCategory[budget.category].percentage = percentage;

        // Check if nearing or exceeded limit
        if (percentage >= 100) {
          summary.exceededBudgets.push({
            ...budget,
            percentage,
          });
        } else if (percentage >= 80) {
          summary.nearingLimit.push({
            ...budget,
            percentage,
          });
        }
      });

      logger.debug("Budget summary generated", {
        userId,
        totalBudgets: summary.totalBudgets,
        exceededCount: summary.exceededBudgets.length,
      });

      return summary;
    } catch (error) {
      logger.error("Failed to get budget summary", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get smart budget recommendations based on spending history
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Budget recommendations and insights
   */
  async getSmartBudgetRecommendations(userId) {
    try {
      // Get transactions from last 90 days for analysis
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId },
          date: { gte: ninetyDaysAgo },
        },
        orderBy: { date: "desc" },
      });

      if (transactions.length === 0) {
        logger.info("No transaction history for recommendations", { userId });
        return {
          message: "Not enough transaction history to generate recommendations",
          recommendations: [],
        };
      }

      const existingBudgets = await this.getUserBudgets(userId);
      const existingCategories = new Set(
        existingBudgets.map((b) => b.category)
      );
      const recommendations = this.generateSmartBudgets(transactions);

      // Filter out categories that already have budgets
      const filteredRecommendations = recommendations.filter(
        (rec) => !existingCategories.has(rec.category)
      );

      // Calculate potential savings
      const potentialSavings = this.calculatePotentialSavings(
        transactions,
        filteredRecommendations
      );

      const result = {
        totalTransactions: transactions.length,
        timePeriod: "Last 90 days",
        existingCategories: Array.from(existingCategories),
        recommendations: filteredRecommendations,
        potentialSavings,
        insights: this.generateBudgetInsights(transactions, existingBudgets),
      };

      logger.info("Smart budget recommendations generated", {
        userId,
        recommendationCount: filteredRecommendations.length,
        transactionCount: transactions.length,
      });

      return result;
    } catch (error) {
      logger.error("Failed to generate smart budget recommendations", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate potential savings from budget recommendations
   * @param {Array} transactions - Transaction history
   * @param {Array} recommendations - Budget recommendations
   * @returns {Object} Savings calculation
   */
  calculatePotentialSavings(transactions, recommendations) {
    let totalSavings = 0;
    const savingsByCategory = {};

    recommendations.forEach((rec) => {
      // Calculate how much over the recommended limit the user currently spends
      const categoryTransactions = transactions.filter(
        (t) => t.type === "expense" && t.category === rec.category
      );

      const categoryTotal = categoryTransactions.reduce(
        (sum, t) => sum + Math.abs(t.amount),
        0
      );

      // Calculate average monthly spending (3 months of data)
      const avgMonthlySpending = categoryTotal / 3;
      const potential = avgMonthlySpending - rec.recommendedLimit;

      if (potential > 0) {
        savingsByCategory[rec.category] = Math.round(pential);
        totalSavings += potential;
      }
    });

    return {
      monthly: Math.round(totalSavings),
      yearly: Math.round(totalSavings * 12),
      byCategory: savingsByCategory,
    };
  }

  /**
   * Generate budget insights from transaction patterns
   * @param {Array} transactions - Transaction history
   * @param {Array} existingBudgets - Existing budgets
   * @returns {Array} Budget insights
   */
  generateBudgetInsights(transactions, existingBudgets) {
    const insights = [];

    // Analyze uncategorized spending
    const uncategorized = transactions.filter(
      (t) => t.type === "expense" && (!t.category || t.category === "Other")
    );

    if (uncategorized.length > 5) {
      insights.push({
        type: "uncategorized",
        title: "Uncategorized Spending",
        message: `You have ${uncategorized.length} transactions without proper categorization`,
        severity: "medium",
        suggestion:
          "Categorize these transactions to get better budget recommendations",
      });
    }

    // Check for inconsistent spending patterns using coefficient of variation
    const categorySpending = this.analyzeCategorySpending(transactions);
    const inconsistentCategories = [];

    Object.entries(categorySpending).forEach(([category, data]) => {
      if (data.count >= 5) {
        const amounts = data.amounts;
        const avg = data.total / data.count;
        const variance =
          amounts.reduce((sum, amount) => sum + Math.pow(amount - avg, 2), 0) /
          data.count;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / avg; // Coefficient of variation

        if (cv > 0.8) {
          inconsistentCategories.push({
            category,
            coefficientOfVariation: cv.toFixed(2),
            averageSpending: avg.toFixed(2),
          });
        }
      }
    });

    if (inconsistentCategories.length > 0) {
      insights.push({
        type: "inconsistent",
        title: "Inconsistent Spending",
        message: `Some categories show high spending variability`,
        severity: "low",
        details: inconsistentCategories.slice(0, 3),
      });
    }

    // Check budget coverage - categories with spending but no budget
    const budgetCategories = new Set(existingBudgets.map((b) => b.category));
    const spendingCategories = new Set(
      transactions
        .filter((t) => t.type === "expense")
        .map((t) => t.category)
        .filter(Boolean)
    );

    const uncoveredCategories = Array.from(spendingCategories).filter(
      (cat) => !budgetCategories.has(cat)
    );

    if (uncoveredCategories.length > 0) {
      insights.push({
        type: "coverage",
        title: "Unbudgeted Spending",
        message: `${uncoveredCategories.length} spending categories don't have budgets`,
        severity: "medium",
        suggestion: "Consider creating budgets for these categories",
        categories: uncoveredCategories.slice(0, 5),
      });
    }

    return insights;
  }

  /**
   * Predict future spending based on historical patterns
   * @param {string|number} userId - User identifier
   * @param {string} [period='month'] - Prediction period
   * @returns {Promise<Object>} Spending predictions
   */
  async predictFutureSpending(userId, period = "month") {
    try {
      const now = new Date();
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId },
          date: { gte: ninetyDaysAgo },
        },
        orderBy: { date: "desc" },
      });

      const existingBudgets = await this.getUserBudgets(userId);
      const predictions = {};
      const categorySpending = this.analyzeCategorySpending(transactions);

      Object.entries(categorySpending).forEach(([category, data]) => {
        const existingBudget = existingBudgets.find(
          (b) => b.category === category
        );

        if (data.count >= 3) {
          const avg = data.total / (data.months.size || 1);
          const amounts = data.amounts;

          // Calculate trend if we have enough data
          let trend = "stable";
          let trendConfidence = 0;

          if (amounts.length >= 6) {
            const firstHalf = amounts.slice(0, Math.floor(amounts.length / 2));
            const secondHalf = amounts.slice(Math.floor(amounts.length / 2));

            const firstAvg =
              firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const secondAvg =
              secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

            const change = ((secondAvg - firstAvg) / firstAvg) * 100;

            if (Math.abs(change) > 20) {
              trend = change > 0 ? "increasing" : "decreasing";
              trendConfidence = Math.min(80, Math.abs(change) / 2);
            }
          }

          predictions[category] = {
            predictedSpending: Math.round(avg),
            currentAverage: avg,
            transactionCount: data.count,
            monthsOfData: data.months.size,
            trend,
            trendConfidence,
            existingBudget: existingBudget
              ? {
                  limit: existingBudget.limit,
                  currentSpent: existingBudget.spent,
                  period: existingBudget.period,
                }
              : null,
            recommendation: existingBudget
              ? avg > existingBudget.limit
                ? "increase_limit"
                : "maintain"
              : "create_budget",
          };
        }
      });

      const result = {
        period,
        totalCategories: Object.keys(predictions).length,
        totalPredictedSpending: Object.values(predictions).reduce(
          (sum, p) => sum + p.predictedSpending,
          0
        ),
        predictions,
        dataQuality: this.assessPredictionQuality(categorySpending),
      };

      logger.debug("Future spending predictions generated", {
        userId,
        period,
        categoryCount: result.totalCategories,
      });

      return result;
    } catch (error) {
      logger.error("Failed to predict future spending", {
        userId,
        period,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Assess prediction quality based on data availability
   * @param {Object} categorySpending - Category spending analysis
   * @returns {Object} Data quality assessment
   */
  assessPredictionQuality(categorySpending) {
    let highQuality = 0;
    let mediumQuality = 0;
    let lowQuality = 0;

    Object.values(categorySpending).forEach((data) => {
      if (data.months.size >= 3 && data.count >= 10) {
        highQuality++;
      } else if (data.count >= 5) {
        mediumQuality++;
      } else {
        lowQuality++;
      }
    });

    const total = highQuality + mediumQuality + lowQuality;

    return {
      highQuality,
      mediumQuality,
      lowQuality,
      total,
      confidence: total > 0 ? (highQuality / total) * 100 : 0,
    };
  }

  /**
   * Cleanup database connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      logger.debug("BudgetService cleanup completed");
    } catch (error) {
      logger.error("BudgetService cleanup failed", { error: error.message });
      throw error;
    }
  }
}
