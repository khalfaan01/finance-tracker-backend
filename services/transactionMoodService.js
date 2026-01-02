// transactionMoodService.js
// Service for managing transaction moods and financial emotional analytics
import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * Service for managing transaction mood tracking and financial emotional analytics
 * @class TransactionMoodService
 */
export class TransactionMoodService {
  /**
   * Create a new TransactionMoodService instance
   * @constructor
   */
  constructor() {
    this.prisma = new PrismaClient();
    this.VALID_MOODS = [
      "happy",
      "stressed",
      "bored",
      "impulsive",
      "planned",
      "anxious",
      "excited",
      "regretful",
    ];
  }

  /**
   * Create a new transaction mood entry with validation
   * @param {Object} data - Mood data including transactionId, userId, mood, notes, intensity
   * @returns {Promise<Object>} Created transaction mood record
   * @throws {Error} If validation fails or database operation fails
   */
  async createTransactionMood(data) {
    try {
      logger.info("Creating transaction mood entry", {
        transactionId: data.transactionId,
        userId: data.userId,
        mood: data.mood,
      });

      this.validateMoodData(data);

      const result = await this.prisma.transactionMood.create({
        data: {
          transactionId: data.transactionId,
          userId: data.userId,
          mood: data.mood,
          notes: data.notes,
          intensity: data.intensity || 5, // Default intensity if not provided
        },
      });

      logger.debug("Transaction mood created successfully", { id: result.id });
      return result;
    } catch (error) {
      logger.error("Failed to create transaction mood", {
        error: error.message,
        transactionId: data.transactionId,
        userId: data.userId,
      });
      throw error;
    }
  }

  /**
   * Create or update a transaction mood entry with validation
   * @param {Object} data - Mood data including transactionId, userId, mood, notes, intensity
   * @returns {Promise<Object>} Created/updated transaction mood record
   * @throws {Error} If validation fails or database operation fails
   */
  async upsertTransactionMood(data) {
    try {
      logger.info("Upserting transaction mood entry", {
        transactionId: data.transactionId,
        userId: data.userId,
        mood: data.mood,
      });

      this.validateMoodData(data);

      // Use Prisma's upsert with composite unique constraint
      const result = await this.prisma.transactionMood.upsert({
        where: {
          transactionId_userId: {
            transactionId: data.transactionId,
            userId: data.userId,
          },
        },
        update: {
          mood: data.mood,
          notes: data.notes,
          intensity: data.intensity || 5,
          updatedAt: new Date(),
        },
        create: {
          transactionId: data.transactionId,
          userId: data.userId,
          mood: data.mood,
          notes: data.notes,
          intensity: data.intensity || 5,
        },
      });

      logger.debug("Transaction mood upserted successfully", { id: result.id });
      return result;
    } catch (error) {
      logger.error("Failed to upsert transaction mood", {
        error: error.message,
        transactionId: data.transactionId,
        userId: data.userId,
      });
      throw error;
    }
  }

  /**
   * Validate mood data before creation
   * @param {Object} data - Mood data to validate
   * @throws {Error} If validation fails
   * @private
   */
  validateMoodData(data) {
    // Validate mood type
    if (!this.VALID_MOODS.includes(data.mood)) {
      const error = new Error(
        `Invalid mood. Must be one of: ${this.VALID_MOODS.join(", ")}`
      );
      logger.warn("Invalid mood value", {
        mood: data.mood,
        validMoods: this.VALID_MOODS,
      });
      throw error;
    }

    // Validate intensity range (1-10)
    if (data.intensity && (data.intensity < 1 || data.intensity > 10)) {
      const error = new Error("Intensity must be between 1 and 10");
      logger.warn("Invalid intensity value", { intensity: data.intensity });
      throw error;
    }

    // Validate transaction ownership
    return this.validateTransactionOwnership(data.transactionId, data.userId);
  }

  /**
   * Validate that transaction exists and belongs to user
   * @param {string} transactionId - Transaction ID to validate
   * @param {string} userId - User ID to check ownership
   * @returns {Promise<boolean>} True if valid
   * @throws {Error} If transaction not found or doesn't belong to user
   * @private
   */
  async validateTransactionOwnership(transactionId, userId) {
    try {
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          id: transactionId,
          account: { userId },
        },
      });

      if (!transaction) {
        const error = new Error(
          "Transaction not found or does not belong to user"
        );
        logger.warn("Transaction ownership validation failed", {
          transactionId,
          userId,
        });
        throw error;
      }

      return true;
    } catch (error) {
      logger.error("Error validating transaction ownership", {
        transactionId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get mood analytics for a user within a timeframe
   * @param {string} userId - User ID for analytics
   * @param {string} timeframe - Timeframe for analysis: 'weekly', 'monthly', 'yearly'
   * @returns {Promise<Object>} Comprehensive mood analytics
   */
  async getUserMoodAnalytics(userId, timeframe = "monthly") {
    try {
      logger.info("Generating user mood analytics", { userId, timeframe });

      const allMoods = await this.prisma.transactionMood.findMany({
        where: {
          userId,
        },
        include: {
          transaction: {
            include: {
              account: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      logger.debug("All moods for user (no date filter)", {
        userId,
        totalMoods: allMoods.length,
        moods: allMoods.map((m) => ({
          id: m.id,
          createdAt: m.createdAt,
          mood: m.mood,
        })),
      });

      // Use all moods (no date filter)
      const moods = allMoods;

      // Fetch transactions WITHOUT date filter
      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId },
          // date: dateFilter, // REMOVED
        },
        orderBy: { date: "desc" },
      });

      // Generate various analyses
      const basicAnalysis = this.analyzeMoodPatterns(moods);
      const enhancedAnalysis = this.analyzeMoodPatternsWithTransactions(
        moods,
        transactions
      );
      const moodTrends = this.analyzeMoodTrend(
        moods.map((m) => ({
          score: this.calculateMoodScore(m.transaction).score,
          date: m.createdAt,
        }))
      );

      const result = {
        ...basicAnalysis,
        emotionalSpending: enhancedAnalysis.emotionalSpending,
        plannedSpending: enhancedAnalysis.plannedSpending,
        moodCorrelation: enhancedAnalysis.correlation,
        trends: moodTrends,
        insights: enhancedAnalysis.insights,
      };

      logger.info("Mood analytics generated successfully", {
        userId,
        moodCount: moods.length,
        transactionCount: transactions.length,
        uniqueMoods: basicAnalysis.summary?.totalMoods || 0,
      });

      return result;
    } catch (error) {
      logger.error("Failed to generate mood analytics", {
        userId,
        timeframe,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Analyze basic mood patterns from mood entries
   * @param {Array} moods - Array of mood entries
   * @returns {Object} Mood pattern analysis
   * @private
   */
  analyzeMoodPatterns(moods) {
    const analysis = {
      summary: {},
      byMood: {},
      byCategory: {},
      trends: [],
    };

    // Early return for empty or invalid input
    if (!moods || !Array.isArray(moods) || moods.length === 0) {
      analysis.summary = {
        totalMoods: 0,
        averageIntensity: 0,
        mostCommonMood: "none",
      };
      return analysis;
    }

    moods.forEach((mood) => {
      // Aggregate by mood type
      if (!analysis.byMood[mood.mood]) {
        analysis.byMood[mood.mood] = {
          count: 0,
          totalIntensity: 0,
          averageIntensity: 0,
        };
      }
      analysis.byMood[mood.mood].count++;
      analysis.byMood[mood.mood].totalIntensity += mood.intensity;

      // Aggregate by transaction category for cross-analysis
      const category = mood.transaction?.category || "uncategorized";
      if (!analysis.byCategory[category]) {
        analysis.byCategory[category] = {
          count: 0,
          moods: {},
        };
      }
      analysis.byCategory[category].count++;
      if (!analysis.byCategory[category].moods[mood.mood]) {
        analysis.byCategory[category].moods[mood.mood] = 0;
      }
      analysis.byCategory[category].moods[mood.mood]++;
    });

    // Calculate averages for each mood type
    Object.keys(analysis.byMood).forEach((mood) => {
      analysis.byMood[mood].averageIntensity =
        analysis.byMood[mood].totalIntensity / analysis.byMood[mood].count;
    });

    // Calculate summary statistics
    analysis.summary = {
      totalMoods: moods.length,
      averageIntensity:
        moods.reduce((sum, m) => sum + m.intensity, 0) / moods.length,
      mostCommonMood: Object.entries(analysis.byMood).reduce(
        (a, b) => (a[1].count > b[1].count ? a : b),
        ["", { count: 0 }]
      )[0],
    };

    return analysis;
  }

  /**
   * Enhanced mood analysis incorporating transaction data
   * @param {Array} moods - Mood entries
   * @param {Array} transactions - Transaction data
   * @returns {Object} Enhanced analysis with spending correlations
   * @private
   */
  analyzeMoodPatternsWithTransactions(moods, transactions) {
    const analysis = {
      emotionalSpending: 0,
      plannedSpending: 0,
      correlation: {},
      insights: [],
    };

    // Calculate spending by mood type
    moods.forEach((mood) => {
      const transaction = transactions.find((t) => t.id === mood.transactionId);
      if (transaction) {
        const amount = Math.abs(transaction.amount);

        // Categorize emotional vs planned spending based on mood
        if (["stressed", "anxious", "bored", "impulsive"].includes(mood.mood)) {
          analysis.emotionalSpending += amount;
        } else if (mood.mood === "planned") {
          analysis.plannedSpending += amount;
        }

        // Build correlation data between mood and spending
        if (!analysis.correlation[mood.mood]) {
          analysis.correlation[mood.mood] = { total: 0, count: 0, average: 0 };
        }
        analysis.correlation[mood.mood].total += amount;
        analysis.correlation[mood.mood].count += 1;
        analysis.correlation[mood.mood].average =
          analysis.correlation[mood.mood].total /
          analysis.correlation[mood.mood].count;
      }
    });

    // Generate behavioral insights
    if (analysis.emotionalSpending > analysis.plannedSpending * 1.5) {
      analysis.insights.push({
        type: "behavioral",
        title: "Emotional Spending Dominance",
        message: `You spend $${analysis.emotionalSpending.toFixed(
          2
        )} when emotional vs $${analysis.plannedSpending.toFixed(
          2
        )} on planned purchases`,
        severity: "medium",
        recommendation:
          "Practice mindful spending by waiting 24 hours before emotional purchases",
      });
    }

    // Find the mood associated with highest average spending
    const highestMood = Object.entries(analysis.correlation).reduce(
      (max, [mood, data]) =>
        data.average > max.average ? { mood, ...data } : max,
      { mood: "", average: 0 }
    );

    if (highestMood.mood) {
      analysis.insights.push({
        type: "pattern",
        title: "Highest Spending Mood",
        message: `You spend the most when feeling ${
          highestMood.mood
        } ($${highestMood.average.toFixed(2)} on average)`,
        severity: "low",
        recommendation:
          "Be particularly mindful of spending when feeling this way",
      });
    }

    return analysis;
  }

  /**
   * Predict spending impact based on current mood and historical patterns
   * @param {Array} transactions - Historical transactions
   * @param {string} currentMood - Current mood state
   * @returns {Object|null} Prediction results or null if insufficient data
   */
  predictMoodImpact(transactions, currentMood) {
    // Filter transactions with similar historical moods
    const similarMoodTransactions = transactions.filter(
      (t) => t.mood && t.mood.mood === currentMood
    );

    if (similarMoodTransactions.length === 0) {
      logger.debug("Insufficient data for mood impact prediction", {
        currentMood,
      });
      return null;
    }

    // Calculate average spending for this mood
    const avgAmount =
      similarMoodTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) /
      similarMoodTransactions.length;

    // Analyze category patterns
    const categories = {};
    similarMoodTransactions.forEach((t) => {
      categories[t.category] = (categories[t.category] || 0) + 1;
    });

    const mostCommonCategory = Object.entries(categories).reduce(
      (max, [cat, count]) =>
        count > max.count ? { category: cat, count } : max,
      { category: "", count: 0 }
    );

    return {
      predictedSpending: avgAmount,
      likelyCategories: mostCommonCategory.category,
      confidence: similarMoodTransactions.length > 5 ? "high" : "medium",
      warning:
        avgAmount > 100 ? "High spending predicted in this mood state" : null,
    };
  }

  /**
   * Calculate a mood score based on transaction and context
   * @param {Object} transaction - Transaction data
   * @param {Object} context - Additional financial context
   * @returns {Object} Score and contributing factors
   */
  calculateMoodScore(transaction, context = {}) {
    const baseScore = 50;
    let score = baseScore;
    const factors = [];

    const amount = Math.abs(transaction.amount);
    const isIncome = transaction.amount > 0;

    // Amount-based scoring: income increases score, expenses decrease it
    if (isIncome) {
      // Positive impact for income
      if (amount > 1000) {
        score += 25;
        factors.push("large-income");
      } else if (amount > 500) {
        score += 15;
        factors.push("medium-income");
      } else if (amount > 100) {
        score += 8;
        factors.push("small-income");
      }
    } else {
      // Negative impact for expenses, with micro-expenses being positive
      if (amount > 500) {
        score -= 30;
        factors.push("large-expense");
      } else if (amount > 200) {
        score -= 20;
        factors.push("medium-expense");
      } else if (amount > 50) {
        score -= 10;
        factors.push("small-expense");
      } else if (amount < 10) {
        score += 5;
        factors.push("micro-expense");
      }
    }

    // Category-specific impact scoring
    const categoryImpact = this.getCategoryImpact(transaction.category);
    score += categoryImpact.score;
    if (categoryImpact.factor) {
      factors.push(categoryImpact.factor);
    }

    // Contextual factors from overall financial health
    if (context.budgetStatus === "under_budget") {
      score += 10;
      factors.push("under-budget");
    } else if (context.budgetStatus === "over_budget") {
      score -= 15;
      factors.push("over-budget");
    }

    if (context.savingsTrend === "increasing") {
      score += 8;
      factors.push("savings-increasing");
    } else if (context.savingsTrend === "decreasing") {
      score -= 12;
      factors.push("savings-decreasing");
    }

    // Clamp score to 0-100 range
    score = Math.max(0, Math.min(100, score));

    return {
      score: Math.round(score),
      factors,
    };
  }

  /**
   * Get impact score for a transaction category
   * @param {string} category - Transaction category
   * @returns {Object} Impact score and factor identifier
   * @private
   */
  getCategoryImpact(category) {
    // Category impact mapping: positive for savings/investments, negative for discretionary spending
    const impacts = {
      Savings: { score: 15, factor: "savings" },
      Investment: { score: 12, factor: "investment" },
      Education: { score: 8, factor: "education" },
      Healthcare: { score: 5, factor: "healthcare" },
      Groceries: { score: 0, factor: "groceries" },
      Utilities: { score: -2, factor: "utilities" },
      Transportation: { score: -3, factor: "transportation" },
      Dining: { score: -8, factor: "dining" },
      Entertainment: { score: -10, factor: "entertainment" },
      Shopping: { score: -12, factor: "shopping" },
      Travel: { score: -15, factor: "travel" },
    };

    return impacts[category] || { score: 0, factor: "other" };
  }

  /**
   * Analyze mood trend from historical scores
   * @param {Array} moodHistory - Array of {score, date} objects
   * @returns {Object} Trend analysis with direction and confidence
   */
  analyzeMoodTrend(moodHistory) {
    // Need at least 2 data points for trend analysis
    if (!moodHistory || moodHistory.length < 2) {
      return {
        trend: "stable",
        direction: 0,
        confidence: 0,
      };
    }

    // Compare recent week vs previous week for trend detection
    const recentScores = moodHistory.slice(-7).map((entry) => entry.score);
    const olderScores = moodHistory.slice(-14, -7).map((entry) => entry.score);

    const recentAvg =
      recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const olderAvg =
      olderScores.length > 0
        ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length
        : recentAvg;

    const difference = recentAvg - olderAvg;
    const absoluteDiff = Math.abs(difference);

    // Determine trend based on magnitude of change
    let trend = "stable";
    if (absoluteDiff > 10) {
      trend = difference > 0 ? "improving" : "declining";
    } else if (absoluteDiff > 5) {
      trend = difference > 0 ? "slightly improving" : "slightly declining";
    }

    return {
      trend,
      direction: difference,
      confidence: Math.min(100, absoluteDiff * 2), // Scale difference to confidence percentage
    };
  }

  /**
   * Calculate financial health score based on recent transactions
   * @param {Array} transactions - Transaction history
   * @param {string} period - Time period for analysis
   * @returns {number} Health score 0-100
   */
  calculateFinancialHealthScore(transactions, period = "month") {
    if (!transactions || transactions.length === 0) {
      return 50; // Neutral score for no data
    }

    // Filter to recent transactions (last 30 days)
    const recentTransactions = transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      return transactionDate >= cutoffDate;
    });

    // Calculate income and expenses
    const income = recentTransactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = recentTransactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Calculate component scores
    const savingsRate = income > 0 ? (income - expenses) / income : 0;
    const expenseDiversity = this.calculateExpenseDiversity(recentTransactions);
    const consistencyScore =
      this.calculateSpendingConsistency(recentTransactions);

    // Weighted score calculation
    const savingsScore = Math.min(100, savingsRate * 200); // 50% savings rate = 100 points
    const diversityScore = expenseDiversity * 100;
    const consistencyScorePoints = consistencyScore * 100;

    const totalScore =
      savingsScore * 0.5 + // 50% weight on savings
      diversityScore * 0.3 + // 30% weight on diversity
      consistencyScorePoints * 0.2; // 20% weight on consistency

    return Math.round(Math.max(0, Math.min(100, totalScore)));
  }

  /**
   * Calculate expense category diversity score
   * @param {Array} transactions - Expense transactions
   * @returns {number} Diversity score 0-1
   * @private
   */
  calculateExpenseDiversity(transactions) {
    const expenses = transactions.filter((t) => t.amount < 0);
    const categoryCounts = {};

    // Count transactions per category
    expenses.forEach((transaction) => {
      const category = transaction.category || "Other";
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    const totalCategories = Object.keys(categoryCounts).length;
    const totalExpenses = expenses.length;

    // Diversity score: more categories is better, but avoid extreme fragmentation
    // Normalize by dividing by expected categories (total expenses / 3)
    return totalExpenses > 0
      ? Math.min(1, totalCategories / Math.max(1, totalExpenses / 3))
      : 0.5;
  }

  /**
   * Calculate spending consistency (low variance = high consistency)
   * @param {Array} transactions - Daily transactions
   * @returns {number} Consistency score 0-1
   * @private
   */
  calculateSpendingConsistency(transactions) {
    const dailySpending = {};

    // Aggregate spending by day
    transactions.forEach((transaction) => {
      if (transaction.amount < 0) {
        const date = new Date(transaction.date).toISOString().split("T")[0];
        dailySpending[date] =
          (dailySpending[date] || 0) + Math.abs(transaction.amount);
      }
    });

    const spendingAmounts = Object.values(dailySpending);
    if (spendingAmounts.length < 2) return 0.5;

    // Calculate coefficient of variation (standard deviation / mean)
    const average =
      spendingAmounts.reduce((a, b) => a + b, 0) / spendingAmounts.length;
    const variance =
      spendingAmounts.reduce(
        (acc, val) => acc + Math.pow(val - average, 2),
        0
      ) / spendingAmounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / average;

    // Lower variation = higher consistency
    return Math.max(0, 1 - coefficientOfVariation);
  }

  /**
   * Get personalized mood-based financial recommendations
   * @param {string} userId - User ID for recommendations
   * @returns {Promise<Object>} Personalized recommendations and analysis
   */
  async getMoodRecommendations(userId) {
    try {
      logger.info("Generating mood recommendations", { userId });

      // Fetch recent moods and transactions
      const moods = await this.prisma.transactionMood.findMany({
        where: { userId },
        include: { transaction: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      if (moods.length === 0) {
        logger.debug("No mood data for recommendations", { userId });
        return {
          generalAdvice:
            "Track your moods with transactions to get personalized insights!",
          recommendations: [],
        };
      }

      const transactions = await this.prisma.transaction.findMany({
        where: {
          account: { userId },
          date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        },
      });

      const analysis = this.analyzeMoodPatternsWithTransactions(
        moods,
        transactions
      );
      const recommendations = [];

      // Emotional spending recommendation
      if (analysis.emotionalSpending > 0) {
        recommendations.push({
          type: "emotional_spending",
          title: "Manage Emotional Spending",
          description: `You've spent $${analysis.emotionalSpending.toFixed(
            2
          )} during emotional states`,
          actions: [
            "Implement a 24-hour waiting rule for emotional purchases",
            'Create a "fun money" budget for spontaneous spending',
            "Practice mindfulness before making purchases",
          ],
        });
      }

      // Stress-related spending recommendation
      const stressedCount = moods.filter((m) => m.mood === "stressed").length;
      if (stressedCount > 5) {
        recommendations.push({
          type: "stress_management",
          title: "Stress-Related Spending",
          description: `You've recorded ${stressedCount} stressed moods with transactions`,
          actions: [
            "Identify stress triggers that lead to spending",
            "Develop alternative stress-relief activities",
            "Set up budget alerts for high-stress periods",
          ],
        });
      }

      // Financial health recommendation
      const financialHealth = this.calculateFinancialHealthScore(transactions);
      if (financialHealth < 60) {
        recommendations.push({
          type: "financial_health",
          title: "Improve Financial Health",
          description: `Your financial health score is ${financialHealth}/100`,
          actions: [
            "Increase savings rate by 5%",
            "Review and categorize all transactions",
            "Set specific financial goals",
          ],
        });
      }

      const result = {
        summary: {
          totalMoodsTracked: moods.length,
          emotionalSpending: analysis.emotionalSpending,
          plannedSpending: analysis.plannedSpending,
          financialHealthScore: financialHealth,
        },
        recommendations,
        analysis,
      };

      logger.debug("Mood recommendations generated", {
        userId,
        recommendationCount: recommendations.length,
      });

      return result;
    } catch (error) {
      logger.error("Failed to generate mood recommendations", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get date filter object based on timeframe
   * @param {string} timeframe - 'weekly', 'monthly', or 'yearly'
   * @returns {Object} Prisma date filter object
   * @private
   */
  getDateFilter(timeframe) {
    const now = new Date();
    const from = new Date();

    switch (timeframe) {
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
      logger.info("TransactionMoodService cleanup completed");
    } catch (error) {
      logger.error("Error during cleanup", { error: error.message });
      throw error;
    }
  }
}
