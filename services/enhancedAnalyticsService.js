// enhancedAnalyticsService.js
// Enhanced analytics module with advanced features including cash flow analysis, income breakdown,
// spending forecasting, and contextual insights

import logger from "../logger.js";
import { GoalOptimizer } from "./goalOptimizer.js";
import { PatternDetector } from "./patternDetection.js";
import { PredictiveBudgeting } from "./predictiveBudgeting.js";

/**
 * Enhanced analytics service with static methods for advanced financial analysis
 * Focuses on comprehensive transaction analysis, forecasting, and insights generation
 */
export class EnhancedAnalyticsService {
  /**
   * Comprehensive enhanced analysis with multiple advanced features
   * @param {string|number} userId - User identifier
   * @param {Object} prisma - Prisma client instance
   * @param {string} timeframe - Analysis timeframe
   * @returns {Promise<Object>} Comprehensive analytics results
   */
  static async getEnhancedComprehensiveAnalysis(userId, prisma, timeframe) {
    try {
      logger.info("Starting enhanced comprehensive analysis", {
        userId,
        timeframe,
      });

      // Fetch all required data in parallel for performance
      const [transactions, budgets, goals, accounts] = await Promise.all([
        prisma.transaction.findMany({
          where: { account: { userId } },
          include: { mood: true, account: true },
        }),
        prisma.budget.findMany({ where: { userId } }),
        prisma.financialGoal.findMany({ where: { userId } }),
        prisma.account.findMany({ where: { userId } }),
      ]);

      // Execute analysis modules in parallel for better performance
      const [
        patterns,
        budgetRecommendations,
        goalOptimization,
        securityInsights,
      ] = await Promise.all([
        PatternDetector.detectSpendingPatterns(transactions),
        PredictiveBudgeting.generateSmartBudgets(transactions, budgets),
        GoalOptimizer.optimizeGoalAllocation(goals, 1000),
        this.generateSecurityInsights(transactions),
      ]);

      // Execute enhanced analytics modules
      const cashFlowAnalysis = this.analyzeCashFlow(
        transactions,
        "daily",
        userId
      );
      const incomeBreakdown = this.analyzeIncomeStreams(transactions);
      const spendingForecast = this.generateSpendingForecast(transactions, 30);
      const contextualInsights = this.generateContextualInsights(transactions);

      const result = {
        patterns,
        budgetRecommendations,
        goalOptimization,
        securityInsights,
        cashFlowAnalysis,
        incomeBreakdown,
        spendingForecast,
        contextualInsights,
        summary: this.generateEnhancedSummary(
          patterns,
          budgetRecommendations,
          goalOptimization,
          cashFlowAnalysis,
          spendingForecast
        ),
      };

      logger.info("Enhanced comprehensive analysis completed", {
        userId,
        timeframe,
        transactionCount: transactions.length,
        accountCount: accounts.length,
      });

      return result;
    } catch (error) {
      logger.error("Enhanced comprehensive analysis failed", {
        userId,
        timeframe,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * TRANSACTION ANALYSIS MODULE
   */

  /**
   * Analyze spending patterns with trends, categories, and anomaly detection
   * @param {Array} transactions - Transaction data
   * @param {string} [timeRange='monthly'] - Analysis time range
   * @returns {Object} Comprehensive transaction analysis
   */
  static analyzeSpendingPatterns(transactions, timeRange = "monthly") {
    try {
      const analysis = {
        summary: {},
        trends: {},
        categories: {},
        anomalies: [],
        predictions: {},
      };

      const filteredTransactions = this.filterByTimeRange(
        transactions,
        timeRange
      );

      // Basic summary with robust null checks
      const incomeTransactions = filteredTransactions.filter(
        (t) => t?.type === "income"
      );
      const expenseTransactions = filteredTransactions.filter(
        (t) => t?.type === "expense"
      );

      analysis.summary = {
        totalIncome: incomeTransactions.reduce(
          (sum, t) => sum + (t?.amount || 0),
          0
        ),
        totalExpenses: Math.abs(
          expenseTransactions.reduce((sum, t) => sum + (t?.amount || 0), 0)
        ),
        netFlow: filteredTransactions.reduce(
          (sum, t) => sum + (t?.amount || 0),
          0
        ),
        transactionCount: filteredTransactions.length,
      };

      // Category analysis with aggregation
      analysis.categories = this.analyzeCategories(filteredTransactions);

      // Trend analysis over time
      analysis.trends = this.analyzeTrends(filteredTransactions, timeRange);

      // Statistical anomaly detection
      analysis.anomalies = this.detectAnomalies(filteredTransactions);

      // Future predictions based on trends
      analysis.predictions = this.generatePredictions(
        analysis.trends,
        analysis.categories
      );

      logger.debug("Spending patterns analyzed", {
        timeRange,
        transactionCount: filteredTransactions.length,
        anomalyCount: analysis.anomalies.length,
      });

      return analysis;
    } catch (error) {
      logger.error("Spending pattern analysis failed", {
        timeRange,
        error: error.message,
      });

      // Return safe default structure
      return {
        summary: {},
        trends: {},
        categories: {},
        anomalies: [],
        predictions: {},
      };
    }
  }

  /**
   * Analyze transaction categories with aggregation and percentages
   * @param {Array} transactions - Transaction data
   * @returns {Object} Category analysis
   */
  static analyzeCategories(transactions) {
    const categories = {};

    transactions.forEach((tx) => {
      if (!tx || !tx.category) return;

      const category = tx.category;
      if (!categories[category]) {
        categories[category] = {
          total: 0,
          count: 0,
          average: 0,
          percentage: 0,
          transactions: [],
        };
      }

      const amount = Math.abs(tx.amount || 0);
      categories[category].total += amount;
      categories[category].count += 1;
      categories[category].average =
        categories[category].total / categories[category].count;
      categories[category].transactions.push(tx);
    });

    // Calculate percentages of total expenses
    const totalExpenses = Object.values(categories).reduce(
      (sum, cat) => sum + (cat?.total || 0),
      0
    );
    Object.keys(categories).forEach((category) => {
      if (categories[category] && totalExpenses > 0) {
        categories[category].percentage =
          (categories[category].total / totalExpenses) * 100;
      }
    });

    return categories;
  }

  /**
   * Analyze trends over time with monthly granularity
   * @param {Array} transactions - Transaction data
   * @param {string} timeRange - Time range for analysis
   * @returns {Object} Trend analysis
   */
  static analyzeTrends(transactions, timeRange) {
    const trends = {};
    const now = new Date();

    // Analyze trends for the past 6 months
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${month.getFullYear()}-${String(
        month.getMonth() + 1
      ).padStart(2, "0")}`;

      const monthTransactions = (transactions || []).filter((t) => {
        if (!t || !t.date) return false;
        const txDate = new Date(t.date);
        return (
          txDate.getFullYear() === month.getFullYear() &&
          txDate.getMonth() === month.getMonth()
        );
      });

      trends[monthKey] = {
        income: monthTransactions
          .filter((t) => t?.type === "income")
          .reduce((sum, t) => sum + (t?.amount || 0), 0),
        expenses: Math.abs(
          monthTransactions
            .filter((t) => t?.type === "expense")
            .reduce((sum, t) => sum + (t?.amount || 0), 0)
        ),
        net: monthTransactions.reduce((sum, t) => sum + (t?.amount || 0), 0),
        count: monthTransactions.length,
      };
    }

    return trends;
  }

  /**
   * Detect statistical anomalies using z-score analysis
   * @param {Array} transactions - Transaction data
   * @returns {Array} Detected anomalies
   */
  static detectAnomalies(transactions) {
    const anomalies = [];
    const expenseTransactions = (transactions || []).filter(
      (t) => t?.type === "expense"
    );

    if (expenseTransactions.length === 0) return anomalies;

    // Calculate statistical metrics for anomaly detection
    const amounts = expenseTransactions.map((t) => Math.abs(t?.amount || 0));
    const average = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.map((x) => Math.pow(x - average, 2)).reduce((a, b) => a + b, 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);

    expenseTransactions.forEach((tx) => {
      if (!tx) return;

      const amount = Math.abs(tx.amount || 0);
      if (stdDev === 0) return;

      // Calculate z-score for statistical anomaly detection
      const zScore = (amount - average) / stdDev;

      // Flag transactions with z-score > 2 as anomalies (95% confidence interval)
      if (Math.abs(zScore) > 2) {
        const deviation =
          average > 0
            ? `${(((amount - average) / average) * 100).toFixed(1)}%`
            : "N/A";
        const severity = Math.abs(zScore) > 3 ? "high" : "medium";

        anomalies.push({
          transaction: tx,
          zScore: zScore.toFixed(2),
          deviation,
          severity,
        });
      }
    });

    return anomalies;
  }

  /**
   * Generate predictions based on historical trends
   * @param {Object} trends - Trend analysis data
   * @param {Object} categories - Category analysis data
   * @returns {Object} Predictions for next period
   */
  static generatePredictions(trends, categories) {
    const last6Months = Object.values(trends || {}).slice(-6);

    if (last6Months.length < 3) return {};

    // Calculate averages for prediction
    const avgIncome =
      last6Months.reduce((sum, m) => sum + (m?.income || 0), 0) /
      last6Months.length;
    const avgExpenses =
      last6Months.reduce((sum, m) => sum + (m?.expenses || 0), 0) /
      last6Months.length;

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Identify high-spending categories for recommendations
    const highSpendCategories = Object.entries(categories || {})
      .filter(([_, data]) => data?.percentage > 15) // Categories with >15% of total spending
      .map(([category, data]) => ({
        category,
        percentage: data?.percentage || 0,
        recommendation: `Consider setting a budget for ${category}`,
      }));

    return {
      nextMonth: {
        predictedIncome: avgIncome || 0,
        predictedExpenses: avgExpenses || 0,
        predictedNet: (avgIncome || 0) - (avgExpenses || 0),
        confidence: last6Months.length >= 6 ? "high" : "medium",
      },
      highSpendCategories,
    };
  }

  /**
   * Filter transactions by time range
   * @param {Array} transactions - Transaction data
   * @param {string} timeRange - Time range filter
   * @returns {Array} Filtered transactions
   */
  static filterByTimeRange(transactions, timeRange) {
    const now = new Date();
    const cutoff = new Date();

    // Set cutoff date based on time range
    switch (timeRange) {
      case "weekly":
        cutoff.setDate(now.getDate() - 7);
        break;
      case "monthly":
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case "yearly":
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
      default:
        cutoff.setMonth(now.getMonth() - 1); // Default to monthly
    }

    return (transactions || []).filter((t) => {
      if (!t || !t.date) return false;
      return new Date(t.date) >= cutoff;
    });
  }

  /**
   * CASH FLOW ANALYSIS MODULE
   */

  /**
   * Analyze cash flow with different time granularities
   * @param {Array} transactions - Transaction data
   * @param {string} granularity - Time granularity (daily/weekly)
   * @param {string|number} userId - User identifier
   * @returns {Object} Cash flow analysis
   */
  static analyzeCashFlow(transactions, granularity, userId) {
    try {
      const analysis = {
        granularity,
        periods: [],
        trends: {},
        insights: [],
      };

      const now = new Date();
      let periodData = [];

      // Group transactions by specified granularity
      switch (granularity) {
        case "daily":
          // Last 30 days of daily data
          for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            const dateKey = date.toISOString().split("T")[0];

            const dayTransactions = (transactions || []).filter((tx) => {
              if (!tx || !tx.date) return false;
              const txDate = new Date(tx.date).toISOString().split("T")[0];
              return txDate === dateKey;
            });

            const income = dayTransactions
              .filter((t) => t?.type === "income")
              .reduce((sum, t) => sum + (t?.amount || 0), 0);
            const expenses = dayTransactions
              .filter((t) => t?.type === "expense")
              .reduce((sum, t) => sum + Math.abs(t?.amount || 0), 0);
            const net = income - expenses;

            periodData.push({
              date: dateKey,
              income: income || 0,
              expenses: expenses || 0,
              net: net || 0,
              transactionCount: dayTransactions.length,
            });
          }
          break;

        case "weekly":
          // Last 12 weeks of data
          for (let i = 11; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - i * 7);
            const weekKey = `Week ${i + 1}`;

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            const weekTransactions = (transactions || []).filter((tx) => {
              if (!tx || !tx.date) return false;
              const txDate = new Date(tx.date);
              return txDate >= weekStart && txDate <= weekEnd;
            });

            const income = weekTransactions
              .filter((t) => t?.type === "income")
              .reduce((sum, t) => sum + (t?.amount || 0), 0);
            const expenses = weekTransactions
              .filter((t) => t?.type === "expense")
              .reduce((sum, t) => sum + Math.abs(t?.amount || 0), 0);
            const net = income - expenses;

            periodData.push({
              period: weekKey,
              startDate: weekStart.toISOString().split("T")[0],
              endDate: weekEnd.toISOString().split("T")[0],
              income: income || 0,
              expenses: expenses || 0,
              net: net || 0,
              transactionCount: weekTransactions.length,
            });
          }
          break;
      }

      analysis.periods = periodData;

      // Calculate growth trends between first and last period
      if (periodData.length > 1) {
        const firstPeriod = periodData[0];
        const lastPeriod = periodData[periodData.length - 1];

        // Calculate percentage growth (handle division by zero)
        const incomeGrowth =
          firstPeriod.income !== 0
            ? ((lastPeriod.income - firstPeriod.income) / firstPeriod.income) *
              100
            : 0;
        const expenseGrowth =
          firstPeriod.expenses !== 0
            ? ((lastPeriod.expenses - firstPeriod.expenses) /
                firstPeriod.expenses) *
              100
            : 0;
        const netGrowth =
          firstPeriod.net !== 0
            ? ((lastPeriod.net - firstPeriod.net) / Math.abs(firstPeriod.net)) *
              100
            : 0;

        analysis.trends = {
          incomeGrowth: incomeGrowth || 0,
          expenseGrowth: expenseGrowth || 0,
          netGrowth: netGrowth || 0,
          volatility: this.calculateVolatility(
            periodData.map((p) => p?.net || 0)
          ),
        };
      } else {
        analysis.trends = {
          incomeGrowth: 0,
          expenseGrowth: 0,
          netGrowth: 0,
          volatility: 0,
        };
      }

      // Generate actionable insights
      analysis.insights = this.generateCashFlowInsights(periodData);

      logger.debug("Cash flow analysis completed", {
        userId,
        granularity,
        periodCount: periodData.length,
        insightCount: analysis.insights.length,
      });

      return analysis;
    } catch (error) {
      logger.error("Cash flow analysis failed", {
        granularity,
        userId,
        error: error.message,
      });

      return {
        granularity,
        periods: [],
        trends: {},
        insights: [],
      };
    }
  }

  /**
   * INCOME ANALYSIS MODULE
   */

  /**
   * Analyze income streams with categorization
   * @param {Array} incomeTransactions - Income transaction data
   * @returns {Object} Income stream analysis
   */
  static analyzeIncomeStreams(incomeTransactions) {
    try {
      const streams = {};

      // Filter income transactions with comprehensive null checks
      const actualIncomeTransactions = (incomeTransactions || []).filter(
        (tx) =>
          tx &&
          tx.type === "income" &&
          tx.amount !== undefined &&
          tx.amount !== null
      );

      actualIncomeTransactions.forEach((tx) => {
        if (!tx) return;

        // Categorize income by description patterns
        let streamType = "Other";
        const desc = tx.description?.toLowerCase() || "";

        // Pattern matching for common income types
        if (desc.includes("salary") || desc.includes("payroll"))
          streamType = "Salary";
        else if (desc.includes("freelance") || desc.includes("contract"))
          streamType = "Freelance";
        else if (desc.includes("investment") || desc.includes("dividend"))
          streamType = "Investment";
        else if (desc.includes("bonus")) streamType = "Bonus";
        else if (desc.includes("side") || desc.includes("gig"))
          streamType = "Side Hustle";

        if (!streams[streamType]) {
          streams[streamType] = { total: 0, transactions: [], percentage: 0 };
        }

        streams[streamType].total += tx.amount || 0;
        streams[streamType].transactions.push(tx);
      });

      // Calculate total income and percentages
      const totalIncome = Object.values(streams).reduce(
        (sum, stream) => sum + (stream?.total || 0),
        0
      );

      Object.keys(streams).forEach((stream) => {
        if (streams[stream]) {
          streams[stream].percentage =
            totalIncome > 0 ? (streams[stream].total / totalIncome) * 100 : 0;
        }
      });

      // Determine primary income stream
      const streamEntries = Object.entries(streams);
      const primaryStream =
        streamEntries.length > 0
          ? streamEntries.reduce(
              (a, b) =>
                (streams[a[0]]?.total || 0) > (streams[b[0]]?.total || 0)
                  ? a[0]
                  : b[0],
              "None"
            )
          : "None";

      const result = {
        streams,
        totalIncome: totalIncome || 0,
        streamCount: streamEntries.length,
        primaryStream,
        diversityScore: this.calculateIncomeDiversity(streams),
      };

      logger.debug("Income stream analysis completed", {
        streamCount: streamEntries.length,
        totalIncome,
        primaryStream,
      });

      return result;
    } catch (error) {
      logger.error("Income stream analysis failed", { error: error.message });

      return {
        streams: {},
        totalIncome: 0,
        streamCount: 0,
        primaryStream: "None",
        diversityScore: 0,
      };
    }
  }

  /**
   * FORECASTING MODULE
   */

  /**
   * Generate spending forecast based on historical patterns
   * @param {Array} transactions - Transaction data
   * @param {number} [days=30] - Forecast period in days
   * @returns {Object} Spending forecast
   */
  static generateSpendingForecast(transactions, days = 30) {
    try {
      const forecast = {
        period: days,
        dailyProjections: [],
        confidence: "medium",
        riskFactors: [],
        recommendations: [],
      };

      const expenseTransactions = (transactions || []).filter(
        (t) => t?.type === "expense"
      );
      if (expenseTransactions.length === 0) {
        forecast.confidence = "low";
        forecast.riskFactors.push(
          "Insufficient expense data for accurate forecasting"
        );
        logger.warn("Insufficient data for spending forecast", {
          expenseTransactionCount: 0,
        });
        return forecast;
      }

      // Simple forecasting based on historical averages with some randomness
      const totalExpenses = expenseTransactions.reduce(
        (sum, tx) => sum + Math.abs(tx?.amount || 0),
        0
      );
      const avgDailyExpense =
        totalExpenses / Math.max(30, expenseTransactions.length);

      const now = new Date();
      for (let i = 1; i <= days; i++) {
        const projectionDate = new Date(now);
        projectionDate.setDate(now.getDate() + i);

        // Project with randomness (0.8 to 1.2x average) for realistic variation
        const projectedAmount = avgDailyExpense * (0.8 + Math.random() * 0.4);

        forecast.dailyProjections.push({
          date: projectionDate.toISOString().split("T")[0],
          projectedAmount: Math.max(0, projectedAmount),
          confidence: i > 7 ? "low" : "medium", // Lower confidence for further dates
        });
      }

      logger.debug("Spending forecast generated", {
        period: days,
        projectionCount: forecast.dailyProjections.length,
        confidence: forecast.confidence,
      });

      return forecast;
    } catch (error) {
      logger.error("Spending forecast generation failed", {
        days,
        error: error.message,
      });

      return {
        period: days,
        dailyProjections: [],
        confidence: "low",
        riskFactors: ["forecast_error"],
        recommendations: [],
      };
    }
  }

  /**
   * CONTEXTUAL ANALYSIS MODULE
   */

  /**
   * Generate contextual insights from transaction patterns
   * @param {Array} transactions - Transaction data
   * @returns {Object} Contextual insights
   */
  static generateContextualInsights(transactions) {
    try {
      const insights = {
        timeBased: {},
        categoryPatterns: {},
        behavioralInsights: [],
        optimizationOpportunities: [],
      };

      // Time-based analysis with null checks
      (transactions || []).forEach((tx) => {
        if (!tx || !tx.date) return;

        const txDate = new Date(tx.date);
        const hour = txDate.getHours();

        // Categorize by time of day
        let timeSlot = "Morning"; // 0-11
        if (hour >= 12 && hour < 17) timeSlot = "Afternoon"; // 12-16
        else if (hour >= 17) timeSlot = "Evening"; // 17-23

        if (!insights.timeBased[timeSlot]) {
          insights.timeBased[timeSlot] = { total: 0, count: 0, average: 0 };
        }
        insights.timeBased[timeSlot].total += Math.abs(tx.amount || 0);
        insights.timeBased[timeSlot].count += 1;
      });

      // Calculate averages for time slots
      Object.keys(insights.timeBased).forEach((slot) => {
        const data = insights.timeBased[slot];
        data.average = data.count > 0 ? data.total / data.count : 0;
      });

      logger.debug("Contextual insights generated", {
        timeSlotCount: Object.keys(insights.timeBased).length,
      });

      return insights;
    } catch (error) {
      logger.error("Contextual insights generation failed", {
        error: error.message,
      });

      return {
        timeBased: {},
        categoryPatterns: {},
        behavioralInsights: [],
        optimizationOpportunities: [],
      };
    }
  }

  /**
   * SECURITY ANALYSIS MODULE
   */

  /**
   * Generate security insights from transaction patterns
   * @param {Array} transactions - Transaction data
   * @returns {Object} Security insights (placeholder implementation)
   */
  static generateSecurityInsights(transactions) {
    try {
      // Placeholder implementation - would integrate with security service
      logger.debug("Security insights generated (placeholder)", {
        transactionCount: transactions?.length || 0,
      });

      return {
        riskScore: 85,
        anomalies: [],
        behavioralPatterns: {},
        recommendations: [],
      };
    } catch (error) {
      logger.error("Security insights generation failed", {
        error: error.message,
      });

      return {
        riskScore: 85,
        anomalies: [],
        behavioralPatterns: {},
        recommendations: [],
      };
    }
  }

  /**
   * HELPER METHODS
   */

  /**
   * Calculate volatility (standard deviation) of a data series
   * @param {Array} data - Numeric data series
   * @returns {number} Volatility (standard deviation)
   */
  static calculateVolatility(data) {
    if (!data || data.length < 2) return 0;
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance =
      data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate income diversity score (0-100)
   * @param {Object} streams - Income streams data
   * @returns {number} Diversity score
   */
  static calculateIncomeDiversity(streams) {
    const streamEntries = Object.entries(streams || {});
    if (streamEntries.length === 0) return 0;

    const percentages = streamEntries.map(
      ([_, stream]) => stream?.percentage || 0
    );
    const maxPercentage = Math.max(...percentages);
    // Higher score = more diverse (less concentrated in single stream)
    return Math.max(0, 100 - maxPercentage);
  }

  /**
   * Generate cash flow insights from period data
   * @param {Array} periodData - Cash flow period data
   * @returns {Array} Cash flow insights
   */
  static generateCashFlowInsights(periodData) {
    const insights = [];
    const negativeDays = (periodData || []).filter(
      (day) => day?.net < 0
    ).length;
    const totalPeriods = periodData?.length || 0;

    // Alert if more than 30% of periods have negative cash flow
    if (negativeDays > totalPeriods * 0.3) {
      insights.push({
        type: "negative_cash_flow",
        severity: "high",
        message: `${negativeDays} periods with negative cash flow detected`,
        recommendation:
          "Focus on reducing expenses or increasing income sources",
      });
    }

    return insights;
  }

  /**
   * Generate enhanced summary from multiple analysis results
   * @param {Object} patterns - Spending patterns
   * @param {Object} budgets - Budget recommendations
   * @param {Object} goals - Goal optimization results
   * @param {Object} cashFlow - Cash flow analysis
   * @param {Object} forecast - Spending forecast
   * @returns {Object} Enhanced summary
   */
  static generateEnhancedSummary(patterns, budgets, goals, cashFlow, forecast) {
    const summary = {
      totalPatterns:
        (patterns?.recurringPayments?.length || 0) +
        (patterns?.anomalyDetections?.length || 0),
      budgetOpportunities: budgets?.length || 0,
      goalOptimizations: goals?.allocations?.length || 0,
      cashFlowHealth:
        (cashFlow?.insights?.length || 0) === 0 ? "healthy" : "needs_attention",
      forecastConfidence: forecast?.confidence || "low",
      overallHealth: this.calculateEnhancedFinancialHealth(
        patterns,
        budgets,
        goals,
        cashFlow,
        forecast
      ),
    };

    logger.debug("Enhanced summary generated", {
      totalPatterns: summary.totalPatterns,
      overallHealth: summary.overallHealth,
    });

    return summary;
  }

  /**
   * Generate unified summary from comprehensive analysis
   * @param {Object} patterns - Spending patterns
   * @param {Object} budgets - Budget recommendations
   * @param {Object} goals - Goal optimization results
   * @param {Object} transactionAnalysis - Transaction analysis
   * @param {Object} cashFlow - Cash flow analysis
   * @param {Object} forecast - Spending forecast
   * @returns {Object} Unified summary
   */
  static generateUnifiedSummary(
    patterns,
    budgets,
    goals,
    transactionAnalysis,
    cashFlow,
    forecast
  ) {
    const summary = {
      totalPatterns:
        (patterns?.recurringPayments?.length || 0) +
        (patterns?.anomalyDetections?.length || 0),
      budgetOpportunities: budgets?.length || 0,
      goalOptimizations: goals?.allocations?.length || 0,
      transactionInsights: transactionAnalysis?.anomalies?.length || 0,
      cashFlowHealth:
        (cashFlow?.insights?.length || 0) === 0 ? "healthy" : "needs_attention",
      forecastConfidence: forecast?.confidence || "low",
      overallHealth: this.calculateUnifiedFinancialHealth(
        patterns,
        budgets,
        goals,
        transactionAnalysis,
        cashFlow,
        forecast
      ),
    };

    return summary;
  }

  /**
   * Calculate enhanced financial health score (0-100)
   * @param {Object} patterns - Spending patterns
   * @param {Object} budgets - Budget recommendations
   * @param {Object} goals - Goal optimization results
   * @param {Object} cashFlow - Cash flow analysis
   * @param {Object} forecast - Spending forecast
   * @returns {number} Health score
   */
  static calculateEnhancedFinancialHealth(
    patterns,
    budgets,
    goals,
    cashFlow,
    forecast
  ) {
    let score = 100;

    // Basic scoring logic - deduct for issues
    score -=
      (
        cashFlow?.insights?.filter((insight) => insight.severity === "high") ||
        []
      ).length * 10;
    score -= (forecast?.riskFactors?.length || 0) * 5;

    // Ensure score stays within bounds
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate unified financial health score (0-100)
   * @param {Object} patterns - Spending patterns
   * @param {Object} budgets - Budget recommendations
   * @param {Object} goals - Goal optimization results
   * @param {Object} transactionAnalysis - Transaction analysis
   * @param {Object} cashFlow - Cash flow analysis
   * @param {Object} forecast - Spending forecast
   * @returns {number} Health score
   */
  static calculateUnifiedFinancialHealth(
    patterns,
    budgets,
    goals,
    transactionAnalysis,
    cashFlow,
    forecast
  ) {
    let score = 100;

    // Deduct for cash flow issues
    score -=
      (
        cashFlow?.insights?.filter((insight) => insight?.severity === "high") ||
        []
      ).length * 10;

    // Deduct for transaction anomalies
    score -=
      (
        transactionAnalysis?.anomalies?.filter((a) => a?.severity === "high") ||
        []
      ).length * 15;

    // Deduct for forecast risks
    score -= (forecast?.riskFactors?.length || 0) * 5;

    // Ensure score stays within 0-100 range
    return Math.max(0, Math.min(100, score));
  }
}
