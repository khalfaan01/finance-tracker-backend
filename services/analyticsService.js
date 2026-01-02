// analyticsService.js
// Main analytics service that orchestrates different modules for comprehensive financial analysis

import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";
import { BudgetService } from "./budgetService.js";
import { GoalService } from "./goalService.js";
import { RecurringService } from "./recurringService.js";
import { SecurityService } from "./securityService.js";
import { TransactionMoodService } from "./transactionMoodService.js";

/**
 * Service class for comprehensive financial analytics and insights
 * Orchestrates multiple specialized services to provide holistic financial analysis
 */
export class AnalyticsService {
  constructor() {
    this.prisma = new PrismaClient();
    this.securityService = new SecurityService();
    this.moodService = new TransactionMoodService();
    this.budgetService = new BudgetService();
    this.goalService = new GoalService();
    this.recurringService = new RecurringService();
  }

  /**
   * Comprehensive analysis combining all analytics features with robust error handling
   * @param {string|number} userId - User identifier
   * @param {string} [timeframe='monthly'] - Analysis timeframe
   * @returns {Promise<Object>} Comprehensive analytics report
   */
  async getComprehensiveAnalysis(userId, timeframe = "monthly") {
    try {
      logger.info("Starting comprehensive analysis", { userId, timeframe });

      // Fetch all data in parallel with error handling
      const [transactions, budgets, goals, accounts, recurring] =
        await Promise.allSettled([
          this.prisma.transaction.findMany({
            where: { account: { userId } },
            include: { mood: true, account: true },
          }),
          this.prisma.budget.findMany({ where: { userId } }),
          this.prisma.financialGoal.findMany({ where: { userId } }),
          this.prisma.account.findMany({ where: { userId } }),
          this.recurringService.getActiveRecurringTransactions(userId),
        ]);

      // Extract successful results or use empty defaults
      const transactionsData =
        transactions.status === "fulfilled" ? transactions.value : [];
      const budgetsData = budgets.status === "fulfilled" ? budgets.value : [];
      const goalsData = goals.status === "fulfilled" ? goals.value : [];
      const accountsData =
        accounts.status === "fulfilled" ? accounts.value : [];
      const recurringData =
        recurring.status === "fulfilled" ? recurring.value : [];

      // Handle failed promises
      [transactions, budgets, goals, accounts, recurring].forEach(
        (result, index) => {
          if (result.status === "rejected") {
            logger.warn(`Failed to fetch analytics data component ${index}`, {
              userId,
              error: result.reason.message,
            });
          }
        }
      );

      // Initialize results with safe defaults
      const defaultStructure = this.getSafeDefaultStructure();
      let patterns = {};
      let budgetRecommendations = { recommendations: [] };
      let goalOptimization = { allocations: [], remaining: 0 };
      let moodAnalysis = defaultStructure.moodAnalysis;
      let transactionAnalysis = defaultStructure.transactionAnalysis;
      let cashFlowAnalysis = defaultStructure.cashFlowAnalysis;
      let incomeBreakdown = defaultStructure.incomeBreakdown;
      let spendingForecast = defaultStructure.spendingForecast;
      let contextualInsights = defaultStructure.contextualInsights;
      let securityInsights = defaultStructure.securityInsights;
      let subscriptionAnalysis = defaultStructure.subscriptionAnalysis;
      let goalAnalytics = defaultStructure.goalAnalytics;
      let goalRecommendations = defaultStructure.goalRecommendations;

      // Execute each service call with individual error handling to ensure partial results
      const serviceCalls = [
        {
          name: "pattern detection",
          fn: () =>
            this.securityService.detectSpendingPatterns(transactionsData),
        },
        {
          name: "budget recommendations",
          fn: () => this.budgetService.getSmartBudgetRecommendations(userId),
        },
        {
          name: "goal optimization",
          fn: () =>
            this.goalService.optimizeGoalAllocation(
              goalsData,
              1000,
              "balanced"
            ),
        },
        {
          name: "mood analytics",
          fn: () => this.moodService.getUserMoodAnalytics(userId, timeframe),
        },
        {
          name: "transaction analysis",
          fn: () => this.analyzeSpendingPatterns(transactionsData, timeframe),
        },
        {
          name: "cash flow analysis",
          fn: () => this.analyzeCashFlow(transactionsData, "daily"),
        },
        {
          name: "income breakdown",
          fn: () => this.analyzeIncomeStreams(transactionsData),
        },
        {
          name: "spending forecast",
          fn: () => this.generateSpendingForecast(transactionsData, 30),
        },
        {
          name: "contextual insights",
          fn: () => this.generateContextualInsights(transactionsData),
        },
        {
          name: "security insights",
          fn: () => this.securityService.getUserSecuritySummary(userId),
        },
        {
          name: "subscription analysis",
          fn: () => this.recurringService.analyzeSubscriptionImpact(userId),
        },
        {
          name: "goal analytics",
          fn: () => this.goalService.getGoalAnalytics(userId),
        },
        {
          name: "goal recommendations",
          fn: () => this.goalService.getOptimizationRecommendations(userId),
        },
      ];

      // Process all service calls with individual error handling
      for (const service of serviceCalls) {
        try {
          const result = await service.fn();

          // Assign results to corresponding variables using a map
          switch (service.name) {
            case "pattern detection":
              patterns = result || {};
              break;
            case "budget recommendations":
              budgetRecommendations = result || { recommendations: [] };
              break;
            case "goal optimization":
              goalOptimization = result || { allocations: [], remaining: 0 };
              break;
            case "mood analytics":
              // Ensure moodAnalysis has required structure
              moodAnalysis =
                result && typeof result === "object"
                  ? result
                  : defaultStructure.moodAnalysis;
              break;
            case "transaction analysis":
              transactionAnalysis =
                result || defaultStructure.transactionAnalysis;
              break;
            case "cash flow analysis":
              cashFlowAnalysis = result || defaultStructure.cashFlowAnalysis;
              break;
            case "income breakdown":
              incomeBreakdown = result || defaultStructure.incomeBreakdown;
              break;
            case "spending forecast":
              spendingForecast = result || defaultStructure.spendingForecast;
              break;
            case "contextual insights":
              contextualInsights =
                result || defaultStructure.contextualInsights;
              break;
            case "security insights":
              securityInsights = result || defaultStructure.securityInsights;
              break;
            case "subscription analysis":
              subscriptionAnalysis =
                result || defaultStructure.subscriptionAnalysis;
              break;
            case "goal analytics":
              goalAnalytics = result || defaultStructure.goalAnalytics;
              break;
            case "goal recommendations":
              goalRecommendations =
                result || defaultStructure.goalRecommendations;
              break;
          }
        } catch (error) {
          logger.warn(`Service call failed: ${service.name}`, {
            userId,
            error: error.message,
            service: service.name,
          });
        }
      }

      const analysisResult = {
        // Core analytics
        patterns: patterns || {},
        budgetRecommendations: budgetRecommendations || { recommendations: [] },
        goalOptimization: goalOptimization || { allocations: [], remaining: 0 },

        // Mood analysis
        moodAnalysis: moodAnalysis || defaultStructure.moodAnalysis,
        transactionAnalysis:
          transactionAnalysis || defaultStructure.transactionAnalysis,

        // Enhanced analytics
        cashFlowAnalysis: cashFlowAnalysis || defaultStructure.cashFlowAnalysis,
        incomeBreakdown: incomeBreakdown || defaultStructure.incomeBreakdown,
        spendingForecast: spendingForecast || defaultStructure.spendingForecast,
        contextualInsights:
          contextualInsights || defaultStructure.contextualInsights,
        securityInsights: securityInsights || defaultStructure.securityInsights,

        // Subscription analytics
        subscriptionAnalysis:
          subscriptionAnalysis || defaultStructure.subscriptionAnalysis,

        // Goal analytics
        goalAnalytics: goalAnalytics || defaultStructure.goalAnalytics,
        goalRecommendations:
          goalRecommendations || defaultStructure.goalRecommendations,

        // Accounts summary - Map accounts to include only essential fields
        accounts: accountsData.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          balance: account.balance,
          currency: account.currency,
        })),

        // Recurring transactions
        recurringTransactions: recurringData || [],

        // Unified summary
        summary: this.generateUnifiedSummary(
          patterns,
          budgetRecommendations,
          goalOptimization,
          moodAnalysis,
          transactionAnalysis,
          cashFlowAnalysis,
          spendingForecast,
          subscriptionAnalysis,
          goalAnalytics
        ),

        // Metadata
        generatedAt: new Date().toISOString(),
        timeframe: timeframe,
        userId: userId,
      };

      logger.info("Comprehensive analysis completed", {
        userId,
        timeframe,
        transactionCount: transactionsData.length,
        accountCount: accountsData.length,
      });

      return analysisResult;
    } catch (error) {
      logger.error("Comprehensive analysis failed", {
        userId,
        timeframe,
        error: error.message,
        stack: error.stack,
      });

      // Return safe default structure instead of failing completely
      return this.getSafeDefaultStructure();
    }
  }

  /**
   * Enhanced comprehensive analysis (alias for backward compatibility)
   * @param {string|number} userId - User identifier
   * @param {string} [timeframe='monthly'] - Analysis timeframe
   * @returns {Promise<Object>} Enhanced analytics report
   */
  async getEnhancedComprehensiveAnalysis(userId, timeframe = "monthly") {
    logger.debug("Enhanced comprehensive analysis requested", {
      userId,
      timeframe,
    });
    return this.getComprehensiveAnalysis(userId, timeframe);
  }

  /**
   * Provides a safe default structure for analytics response
   * @returns {Object} Default analytics structure with safe values
   */
  getSafeDefaultStructure() {
    return {
      patterns: {},
      budgetRecommendations: { recommendations: [] },
      goalOptimization: { allocations: [], remaining: 0 },
      moodAnalysis: {
        summary: {},
        byMood: {},
        byCategory: {},
        emotionalSpending: 0,
        plannedSpending: 0,
        insights: [],
      },
      transactionAnalysis: {
        summary: {},
        trends: {},
        categories: {},
        anomalies: [],
        predictions: {},
      },
      cashFlowAnalysis: {
        periods: [],
        trends: {},
        insights: [],
        granularity: "daily",
      },
      incomeBreakdown: {
        streams: {},
        totalIncome: 0,
        streamCount: 0,
        primaryStream: "None",
        diversityScore: 0,
      },
      spendingForecast: {
        period: 30,
        dailyProjections: [],
        confidence: "low",
        riskFactors: [],
        recommendations: [],
      },
      contextualInsights: {
        timeBased: {},
        categoryPatterns: {},
        behavioralInsights: [],
        optimizationOpportunities: [],
      },
      securityInsights: {
        riskScore: 85,
        anomalies: [],
        behavioralPatterns: {},
        recommendations: [],
      },
      subscriptionAnalysis: {
        activeSubscriptions: 0,
        monthlyCost: 0,
        recommendations: [],
      },
      goalAnalytics: {
        totalGoals: 0,
        completedGoals: 0,
        totalProgressPercentage: 0,
        goalsAtRisk: [],
      },
      goalRecommendations: {
        recommendations: [],
        topStrategy: "balanced",
      },
      accounts: [],
      recurringTransactions: [],
      summary: {
        totalPatterns: 0,
        budgetOpportunities: 0,
        goalOptimizations: 0,
        transactionInsights: 0,
        cashFlowHealth: "healthy",
        forecastConfidence: "low",
        overallHealth: 50,
        subscriptionSavings: 0,
        goalCompletion: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // CASH FLOW ANALYSIS

  /**
   * Analyzes cash flow patterns from transactions
   * @param {Array} transactions - List of transaction objects
   * @param {string} [granularity='daily'] - Time granularity for analysis
   * @returns {Object} Cash flow analysis results
   */
  analyzeCashFlow(transactions, granularity = "daily") {
    try {
      // Early return for empty data with appropriate structure
      if (!transactions || transactions.length === 0) {
        logger.debug("No transactions for cash flow analysis");
        return {
          periods: [],
          trends: {},
          insights: [],
          granularity,
        };
      }

      const periods = this.groupByPeriod(transactions, granularity);
      const trends = this.calculateCashFlowTrends(periods);
      const insights = this.generateCashFlowInsights(periods, trends);

      logger.debug("Cash flow analysis completed", {
        periodCount: periods.length,
        granularity,
        insightCount: insights.length,
      });

      return {
        periods,
        trends,
        insights,
        granularity,
      };
    } catch (error) {
      logger.error("Cash flow analysis failed", {
        granularity,
        transactionCount: transactions?.length || 0,
        error: error.message,
      });

      return {
        periods: [],
        trends: {},
        insights: [],
        granularity,
      };
    }
  }

  /**
   * Groups transactions by time period for cash flow analysis
   * @param {Array} transactions - List of transactions
   * @param {string} granularity - Time granularity (hourly/daily/weekly/monthly)
   * @returns {Array} Grouped periods with calculated metrics
   */
  groupByPeriod(transactions, granularity) {
    const periods = {};

    transactions.forEach((transaction) => {
      const date = new Date(transaction.date);
      let periodKey;

      // Generate period key based on granularity - using slice for efficiency
      switch (granularity) {
        case "hourly":
          periodKey = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
          break;
        case "daily":
          periodKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
          break;
        case "weekly":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().slice(0, 10);
          break;
        case "monthly":
          periodKey = date.toISOString().slice(0, 7); // YYYY-MM
          break;
        default:
          periodKey = date.toISOString().slice(0, 10);
      }

      if (!periods[periodKey]) {
        periods[periodKey] = {
          income: 0,
          expenses: 0,
          net: 0,
          transactionCount: 0,
        };
      }

      const amount = transaction.amount;

      // Income vs expense categorization - positive amount indicates income
      if (amount > 0) {
        periods[periodKey].income += amount;
      } else {
        periods[periodKey].expenses += Math.abs(amount);
      }

      periods[periodKey].net =
        periods[periodKey].income - periods[periodKey].expenses;
      periods[periodKey].transactionCount++;
    });

    // Convert to sorted array and calculate savings rate
    return Object.keys(periods)
      .sort()
      .map((key) => ({
        period: key,
        ...periods[key],
        // Calculate savings rate, handling division by zero
        savingsRate:
          periods[key].income > 0
            ? ((periods[key].income - periods[key].expenses) /
                periods[key].income) *
              100
            : 0,
      }));
  }

  /**
   * Calculates cash flow trends from period data
   * @param {Array} periods - Grouped period data
   * @returns {Object} Trend analysis results
   */
  calculateCashFlowTrends(periods) {
    // Handle insufficient data cases
    if (periods.length < 2) {
      return {
        incomeTrend: "stable",
        expenseTrend: "stable",
        netTrend: "stable",
        volatility: 0,
        consistency: "unknown",
      };
    }

    // Use recent vs older periods for trend comparison
    const recentPeriods = periods.slice(-3);
    const olderPeriods = periods.slice(-6, -3);

    const recentAvg = {
      income:
        recentPeriods.reduce((sum, p) => sum + p.income, 0) /
        recentPeriods.length,
      expenses:
        recentPeriods.reduce((sum, p) => sum + p.expenses, 0) /
        recentPeriods.length,
      net:
        recentPeriods.reduce((sum, p) => sum + p.net, 0) / recentPeriods.length,
    };

    const olderAvg =
      olderPeriods.length > 0
        ? {
            income:
              olderPeriods.reduce((sum, p) => sum + p.income, 0) /
              olderPeriods.length,
            expenses:
              olderPeriods.reduce((sum, p) => sum + p.expenses, 0) /
              olderPeriods.length,
            net:
              olderPeriods.reduce((sum, p) => sum + p.net, 0) /
              olderPeriods.length,
          }
        : recentAvg;

    /**
     * Calculate trend direction based on percentage change
     * @param {number} recent - Recent average value
     * @param {number} older - Older average value
     * @returns {string} Trend direction
     */
    const calculateTrend = (recent, older) => {
      if (older === 0) return "stable";
      const change = ((recent - older) / Math.abs(older)) * 100;
      if (change > 15) return "increasing";
      if (change < -15) return "decreasing";
      return "stable";
    };

    return {
      incomeTrend: calculateTrend(recentAvg.income, olderAvg.income),
      expenseTrend: calculateTrend(recentAvg.expenses, olderAvg.expenses),
      netTrend: calculateTrend(recentAvg.net, olderAvg.net),
      volatility: this.calculateVolatility(periods.map((p) => p.net)),
      consistency: this.assessConsistency(periods.map((p) => p.net)),
    };
  }

  /**
   * Generates actionable insights from cash flow analysis
   * @param {Array} periods - Period data
   * @param {Object} trends - Trend analysis
   * @returns {Array} Insight objects
   */
  generateCashFlowInsights(periods, trends) {
    const insights = [];

    // Only generate insights with sufficient data
    if (periods.length >= 3) {
      const recentNet = periods.slice(-1)[0]?.net || 0;

      // Negative cash flow detection
      if (recentNet < 0) {
        insights.push({
          type: "negative_flow",
          message: "Recent cash flow is negative. Expenses exceed income.",
          severity: "high",
          suggestion:
            "Review recent expenses and consider increasing income sources",
        });
      }

      // Expense growth outpacing income
      if (
        trends.expenseTrend === "increasing" &&
        trends.incomeTrend !== "increasing"
      ) {
        insights.push({
          type: "expense_growth",
          message: "Expenses are growing faster than income.",
          severity: "medium",
          suggestion: "Monitor expense categories and consider budgeting",
        });
      }

      // High volatility detection
      if (trends.volatility > 50) {
        insights.push({
          type: "high_volatility",
          message: "Cash flow shows high volatility.",
          severity: "medium",
          suggestion:
            "Consider establishing an emergency fund for irregular cash flow",
        });
      }

      // Positive consistency analysis
      const positivePeriods = periods.filter((p) => p.net > 0).length;
      const positivePercentage = (positivePeriods / periods.length) * 100;

      if (positivePercentage > 80) {
        insights.push({
          type: "positive_trend",
          message: "Strong positive cash flow consistency.",
          severity: "low",
          suggestion: "Consider investing surplus funds",
        });
      }
    }

    return insights;
  }

  // INCOME ANALYSIS

  /**
   * Analyzes income streams from transactions
   * @param {Array} transactions - List of transaction objects
   * @returns {Object} Income stream analysis
   */
  analyzeIncomeStreams(transactions) {
    try {
      const incomeTransactions = transactions.filter((t) => t.amount > 0);

      if (incomeTransactions.length === 0) {
        logger.debug("No income transactions for analysis");
        return {
          streams: {},
          totalIncome: 0,
          streamCount: 0,
          primaryStream: "None",
          diversityScore: 0,
        };
      }

      const streams = {};
      let totalIncome = 0;

      incomeTransactions.forEach((transaction) => {
        // Use description, category, or fallback for stream identification
        const streamKey =
          transaction.description || transaction.category || "Other";
        const amount = transaction.amount;

        if (!streams[streamKey]) {
          streams[streamKey] = {
            total: 0,
            count: 0,
            frequency: "irregular",
            lastTransaction: transaction.date,
          };
        }

        streams[streamKey].total += amount;
        streams[streamKey].count++;
        totalIncome += amount;
      });

      // Calculate additional metrics for each stream
      Object.keys(streams).forEach((key) => {
        const stream = streams[key];
        stream.average = stream.total / stream.count;
        stream.percentage = (stream.total / totalIncome) * 100;

        // Determine frequency based on transaction intervals
        if (stream.count >= 3) {
          const transactions = incomeTransactions
            .filter((t) => (t.description || t.category || "Other") === key)
            .map((t) => new Date(t.date))
            .sort((a, b) => a - b);

          const intervals = [];
          for (let i = 1; i < transactions.length; i++) {
            intervals.push(transactions[i] - transactions[i - 1]);
          }

          if (intervals.length > 0) {
            const avgInterval =
              intervals.reduce((a, b) => a + b) / intervals.length;
            // Convert milliseconds to frequency categories
            if (avgInterval <= 30 * 24 * 60 * 60 * 1000) {
              stream.frequency = "monthly";
            } else if (avgInterval <= 7 * 24 * 60 * 60 * 1000) {
              stream.frequency = "weekly";
            } else if (avgInterval <= 24 * 60 * 60 * 1000) {
              stream.frequency = "daily";
            }
          }
        }
      });

      // Find primary income stream
      let primaryStream = "None";
      let maxPercentage = 0;
      Object.entries(streams).forEach(([key, stream]) => {
        if (stream.percentage > maxPercentage) {
          maxPercentage = stream.percentage;
          primaryStream = key;
        }
      });

      const diversityScore = this.calculateDiversityScore(streams, totalIncome);

      logger.debug("Income stream analysis completed", {
        streamCount: Object.keys(streams).length,
        totalIncome,
        primaryStream,
        diversityScore,
      });

      return {
        streams,
        totalIncome,
        streamCount: Object.keys(streams).length,
        primaryStream,
        primaryStreamPercentage: maxPercentage,
        diversityScore,
        insights: this.generateIncomeInsights(
          streams,
          totalIncome,
          diversityScore
        ),
      };
    } catch (error) {
      logger.error("Income stream analysis failed", {
        transactionCount: transactions?.length || 0,
        error: error.message,
      });

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
   * Calculates income diversity score using entropy-based measure
   * @param {Object} streams - Income streams data
   * @param {number} totalIncome - Total income amount
   * @returns {number} Diversity score (0-100)
   */
  calculateDiversityScore(streams, totalIncome) {
    if (Object.keys(streams).length <= 1) return 0;

    let score = 0;
    Object.values(streams).forEach((stream) => {
      const proportion = stream.percentage / 100;
      if (proportion > 0) {
        score += proportion * Math.log(1 / proportion); // Entropy calculation
      }
    });

    // Normalize to 0-100 scale using maximum possible entropy
    const maxScore = Math.log(Object.keys(streams).length);
    return maxScore > 0 ? (score / maxScore) * 100 : 0;
  }

  /**
   * Generates insights from income analysis
   * @param {Object} streams - Income streams
   * @param {number} totalIncome - Total income
   * @param {number} diversityScore - Diversity score
   * @returns {Array} Insight objects
   */
  generateIncomeInsights(streams, totalIncome, diversityScore) {
    const insights = [];

    // Single source risk
    if (Object.keys(streams).length === 1) {
      insights.push({
        type: "single_source",
        message: "All income comes from a single source.",
        severity: "high",
        suggestion:
          "Consider diversifying income streams for financial stability",
      });
    } else if (diversityScore < 30) {
      insights.push({
        type: "low_diversity",
        message: "Income is heavily concentrated in few sources.",
        severity: "medium",
        suggestion: "Explore additional income opportunities",
      });
    }

    // Irregular income analysis
    const irregularStreams = Object.entries(streams).filter(
      ([_, stream]) => stream.frequency === "irregular"
    ).length;

    if (irregularStreams > 0) {
      insights.push({
        type: "irregular_income",
        message: `${irregularStreams} income source${
          irregularStreams > 1 ? "s are" : " is"
        } irregular.`,
        severity: "medium",
        suggestion: "Plan for irregular income cycles in your budget",
      });
    }

    return insights;
  }

  // SPENDING FORECAST

  /**
   * Generates spending forecast based on historical patterns
   * @param {Array} transactions - Historical transactions
   * @param {number} [days=30] - Forecast period in days
   * @returns {Object} Spending forecast with projections
   */
  generateSpendingForecast(transactions, days = 30) {
    try {
      const expenseTransactions = transactions.filter((t) => t.amount < 0);

      if (expenseTransactions.length === 0) {
        logger.debug("No expense transactions for forecast");
        return {
          period: days,
          dailyProjections: [],
          confidence: "low",
          riskFactors: ["insufficient_data"],
          recommendations: [],
        };
      }

      // Analyze historical patterns at different time scales
      const dailyAverages = this.calculateDailyAverages(expenseTransactions);
      const weeklyPatterns = this.analyzeWeeklyPatterns(expenseTransactions);
      const monthlyTrends = this.analyzeMonthlyTrends(expenseTransactions);

      // Generate future projections
      const dailyProjections = this.generateDailyProjections(
        dailyAverages,
        weeklyPatterns,
        days
      );
      const confidence = this.assessForecastConfidence(
        expenseTransactions.length,
        days
      );
      const riskFactors = this.identifyRiskFactors(
        expenseTransactions,
        dailyProjections
      );
      const recommendations = this.generateForecastRecommendations(
        dailyProjections,
        riskFactors
      );

      logger.debug("Spending forecast generated", {
        period: days,
        transactionCount: expenseTransactions.length,
        confidence,
        riskFactorCount: riskFactors.length,
      });

      return {
        period: days,
        dailyProjections,
        confidence,
        riskFactors,
        recommendations,
        historicalPatterns: {
          dailyAverages,
          weeklyPatterns,
          monthlyTrends,
        },
      };
    } catch (error) {
      logger.error("Spending forecast generation failed", {
        transactionCount: transactions?.length || 0,
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

  // CONTEXTUAL INSIGHTS

  /**
   * Generates contextual insights from transaction patterns
   * @param {Array} transactions - Transaction data
   * @returns {Object} Contextual insights analysis
   */
  generateContextualInsights(transactions) {
    try {
      const insights = {
        timeBased: this.analyzeTimeBasedPatterns(transactions),
        categoryPatterns: this.analyzeCategoryPatterns(transactions),
        behavioralInsights: this.generateBehavioralInsights(transactions),
        optimizationOpportunities:
          this.identifyOptimizationOpportunities(transactions),
      };

      logger.debug("Contextual insights generated", {
        timePatterns: Object.keys(insights.timeBased).length,
        categoryCount: Object.keys(insights.categoryPatterns).length,
      });

      return insights;
    } catch (error) {
      logger.error("Contextual insights generation failed", {
        transactionCount: transactions?.length || 0,
        error: error.message,
      });

      return this.getSafeDefaultStructure().contextualInsights;
    }
  }

  // UTILITY METHODS

  /**
   * Calculates volatility of a series of values
   * @param {Array} values - Numeric values
   * @returns {number} Volatility percentage
   */
  calculateVolatility(values) {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    // Return coefficient of variation (normalized standard deviation)
    return mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0;
  }

  /**
   * Assesses consistency of a series of values
   * @param {Array} values - Numeric values
   * @returns {string} Consistency rating
   */
  assessConsistency(values) {
    if (values.length < 3) return "unknown";

    const volatility = this.calculateVolatility(values);
    if (volatility < 20) return "high";
    if (volatility < 50) return "medium";
    return "low";
  }

  /**
   * Delegates spending pattern analysis to security service
   * @param {Array} transactions - Transaction data
   * @param {string} timeframe - Analysis timeframe
   * @returns {Object} Spending pattern analysis
   */
  analyzeSpendingPatterns(transactions, timeframe) {
    try {
      return this.securityService.detectSpendingPatterns(transactions);
    } catch (error) {
      logger.error("Spending pattern analysis failed", {
        timeframe,
        error: error.message,
      });
      return this.getSafeDefaultStructure().transactionAnalysis;
    }
  }

  /**
   * Calculates daily spending averages from transactions
   * @param {Array} expenseTransactions - Expense transactions
   * @returns {Object} Daily averages by date
   */
  calculateDailyAverages(expenseTransactions) {
    const dailyTotals = {};

    expenseTransactions.forEach((transaction) => {
      const date = new Date(transaction.date).toISOString().split("T")[0];
      if (!dailyTotals[date]) {
        dailyTotals[date] = {
          total: 0,
          count: 0,
        };
      }
      dailyTotals[date].total += Math.abs(transaction.amount);
      dailyTotals[date].count++;
    });

    const averages = {};
    Object.entries(dailyTotals).forEach(([date, data]) => {
      averages[date] = {
        average: data.count > 0 ? data.total / data.count : 0,
        total: data.total,
        count: data.count,
      };
    });

    return averages;
  }

  /**
   * Analyzes weekly spending patterns
   * @param {Array} expenseTransactions - Expense transactions
   * @returns {Array} Weekly pattern analysis
   */
  analyzeWeeklyPatterns(expenseTransactions) {
    const dayOfWeekTotals = Array(7)
      .fill(0)
      .map(() => ({ total: 0, count: 0 }));
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    expenseTransactions.forEach((transaction) => {
      const date = new Date(transaction.date);
      const day = date.getDay();
      dayOfWeekTotals[day].total += Math.abs(transaction.amount);
      dayOfWeekTotals[day].count++;
    });

    return dayOfWeekTotals.map((data, index) => ({
      day: dayNames[index],
      average: data.count > 0 ? data.total / data.count : 0,
      total: data.total,
      count: data.count,
    }));
  }

  /**
   * Analyzes monthly spending trends
   * @param {Array} expenseTransactions - Expense transactions
   * @returns {Object} Monthly trend analysis
   */
  analyzeMonthlyTrends(expenseTransactions) {
    const monthlyTotals = {};

    expenseTransactions.forEach((transaction) => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      if (!monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] = {
          total: 0,
          count: 0,
          average: 0,
        };
      }

      monthlyTotals[monthKey].total += Math.abs(transaction.amount);
      monthlyTotals[monthKey].count++;
    });

    // Calculate averages
    Object.keys(monthlyTotals).forEach((month) => {
      monthlyTotals[month].average =
        monthlyTotals[month].total / monthlyTotals[month].count;
    });

    return monthlyTotals;
  }

  /**
   * Generates daily spending projections
   * @param {Object} dailyAverages - Historical daily averages
   * @param {Array} weeklyPatterns - Weekly spending patterns
   * @param {number} days - Number of days to project
   * @returns {Array} Daily projections
   */
  generateDailyProjections(dailyAverages, weeklyPatterns, days) {
    const projections = [];
    const today = new Date();

    // Calculate overall average from historical data
    const allAverages = Object.values(dailyAverages).map((d) => d.average);
    const overallAverage =
      allAverages.length > 0
        ? allAverages.reduce((a, b) => a + b, 0) / allAverages.length
        : 0;

    for (let i = 0; i < days; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dayOfWeek = futureDate.getDay();

      // Prefer weekly pattern if available, otherwise use overall average
      const weeklyAverage = weeklyPatterns[dayOfWeek]?.average || 0;
      const projectedAmount =
        weeklyAverage > 0 ? weeklyAverage : overallAverage;

      projections.push({
        date: futureDate.toISOString().split("T")[0],
        dayOfWeek: [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ][dayOfWeek],
        projectedAmount: Math.round(projectedAmount * 100) / 100,
        confidence: weeklyAverage > 0 ? "medium" : "low",
      });
    }

    return projections;
  }

  /**
   * Assesses forecast confidence based on data quality
   * @param {number} transactionCount - Number of historical transactions
   * @param {number} forecastDays - Forecast horizon
   * @returns {string} Confidence rating
   */
  assessForecastConfidence(transactionCount, forecastDays) {
    if (transactionCount < 10) return "very low";
    if (transactionCount < 30) return "low";
    if (transactionCount < 90) return "medium";
    if (transactionCount < 180) return "high";
    return "very high";
  }

  /**
   * Identifies risk factors in spending forecast
   * @param {Array} transactions - Historical transactions
   * @param {Array} projections - Future projections
   * @returns {Array} Risk factor descriptions
   */
  identifyRiskFactors(transactions, projections) {
    const riskFactors = [];

    if (transactions.length < 30) {
      riskFactors.push("Limited historical data for accurate forecasting");
    }

    const recentTransactions = transactions
      .filter((t) => {
        const transactionDate = new Date(t.date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return transactionDate >= thirtyDaysAgo;
      })
      .filter((t) => t.amount < 0);

    if (recentTransactions.length === 0) {
      riskFactors.push("No recent expense data available");
    }

    const projectionTotal = projections.reduce(
      (sum, p) => sum + p.projectedAmount,
      0
    );
    const averageProjection = projectionTotal / projections.length;

    if (averageProjection === 0) {
      riskFactors.push("Unable to generate meaningful projections");
    }

    return riskFactors;
  }

  /**
   * Generates recommendations based on spending forecast
   * @param {Array} projections - Daily projections
   * @param {Array} riskFactors - Identified risk factors
   * @returns {Array} Recommendation objects
   */
  generateForecastRecommendations(projections, riskFactors) {
    const recommendations = [];

    if (
      riskFactors.includes("Limited historical data for accurate forecasting")
    ) {
      recommendations.push({
        type: "data_collection",
        message: "Continue tracking expenses for more accurate forecasts",
        priority: "medium",
      });
    }

    const totalProjected = projections.reduce(
      (sum, p) => sum + p.projectedAmount,
      0
    );

    if (totalProjected > 0) {
      recommendations.push({
        type: "budget_planning",
        message: `Plan for approximately $${totalProjected.toFixed(
          2
        )} in expenses over the next ${projections.length} days`,
        priority: "high",
      });
    }

    const highExpenseDays = projections.filter(
      (p) =>
        p.projectedAmount >
        (projections.reduce((sum, proj) => sum + proj.projectedAmount, 0) /
          projections.length) *
          1.5
    );

    if (highExpenseDays.length > 0) {
      recommendations.push({
        type: "peak_days",
        message: `Higher expenses expected on ${highExpenseDays
          .map((d) => d.dayOfWeek)
          .join(", ")}`,
        priority: "medium",
      });
    }

    return recommendations;
  }

  /**
   * Analyzes time-based spending patterns
   * @param {Array} transactions - Transaction data
   * @returns {Object} Time-based pattern analysis
   */
  analyzeTimeBasedPatterns(transactions) {
    const patterns = {
      hourlySpending: Array(24).fill(0),
      weekdayWeekend: { weekday: 0, weekend: 0 },
      morningAfternoonEvening: {
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0,
      },
    };

    transactions.forEach((transaction) => {
      if (transaction.amount < 0) {
        const date = new Date(transaction.date);
        const hour = date.getHours();
        const dayOfWeek = date.getDay();
        const amount = Math.abs(transaction.amount);

        // Hourly spending accumulation
        patterns.hourlySpending[hour] += amount;

        // Weekday vs Weekend categorization
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          patterns.weekdayWeekend.weekend += amount;
        } else {
          patterns.weekdayWeekend.weekday += amount;
        }

        // Time of day categorization
        if (hour >= 6 && hour < 12) {
          patterns.morningAfternoonEvening.morning += amount;
        } else if (hour >= 12 && hour < 17) {
          patterns.morningAfternoonEvening.afternoon += amount;
        } else if (hour >= 17 && hour < 22) {
          patterns.morningAfternoonEvening.evening += amount;
        } else {
          patterns.morningAfternoonEvening.night += amount;
        }
      }
    });

    return patterns;
  }

  /**
   * Analyzes spending patterns by category
   * @param {Array} transactions - Transaction data
   * @returns {Object} Category-based pattern analysis
   */
  analyzeCategoryPatterns(transactions) {
    const categoryPatterns = {};

    transactions.forEach((transaction) => {
      if (transaction.amount < 0) {
        const category = transaction.category || "Uncategorized";
        if (!categoryPatterns[category]) {
          categoryPatterns[category] = {
            total: 0,
            count: 0,
            average: 0,
            transactions: [],
          };
        }

        const amount = Math.abs(transaction.amount);
        categoryPatterns[category].total += amount;
        categoryPatterns[category].count++;
        categoryPatterns[category].transactions.push({
          date: transaction.date,
          amount: amount,
          description: transaction.description,
        });
      }
    });

    // Calculate averages for each category
    Object.keys(categoryPatterns).forEach((category) => {
      categoryPatterns[category].average =
        categoryPatterns[category].total / categoryPatterns[category].count;
    });

    return categoryPatterns;
  }

  /**
   * Generates behavioral insights from spending patterns
   * @param {Array} transactions - Transaction data
   * @returns {Array} Behavioral insight objects
   */
  generateBehavioralInsights(transactions) {
    const insights = [];
    const expenseTransactions = transactions.filter((t) => t.amount < 0);

    if (expenseTransactions.length === 0) {
      return insights;
    }

    // Analyze spending frequency
    const dailySpending = {};
    expenseTransactions.forEach((transaction) => {
      const date = new Date(transaction.date).toISOString().split("T")[0];
      dailySpending[date] =
        (dailySpending[date] || 0) + Math.abs(transaction.amount);
    });

    const spendingDays = Object.keys(dailySpending).length;
    const totalDays = 30; // 30-day analysis window
    const spendingFrequency = (spendingDays / totalDays) * 100;

    if (spendingFrequency > 80) {
      insights.push({
        type: "high_frequency",
        message: "Frequent daily spending detected",
        severity: "low",
        suggestion: "Consider batch purchasing to reduce transaction frequency",
      });
    }

    // Analyze impulse spending (transactions under $50)
    const impulseSpending = expenseTransactions
      .filter((t) => Math.abs(t.amount) < 50)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalSpending = expenseTransactions.reduce(
      (sum, t) => sum + Math.abs(t.amount),
      0
    );
    const impulsePercentage = (impulseSpending / totalSpending) * 100;

    if (impulsePercentage > 30) {
      insights.push({
        type: "impulse_spending",
        message: `High percentage (${impulsePercentage.toFixed(
          1
        )}%) of spending is on small items`,
        severity: "medium",
        suggestion: "Implement a waiting period for small purchases",
      });
    }

    return insights;
  }

  /**
   * Identifies optimization opportunities in spending
   * @param {Array} transactions - Transaction data
   * @returns {Array} Optimization opportunity objects
   */
  identifyOptimizationOpportunities(transactions) {
    const opportunities = [];
    const expenseTransactions = transactions.filter((t) => t.amount < 0);

    if (expenseTransactions.length < 5) {
      return opportunities;
    }

    // Group by merchant/description to find recurring expenses
    const merchantSpending = {};
    expenseTransactions.forEach((transaction) => {
      const key = transaction.description?.toLowerCase() || "unknown";
      if (!merchantSpending[key]) {
        merchantSpending[key] = {
          total: 0,
          count: 0,
          lastDate: new Date(transaction.date),
        };
      }
      merchantSpending[key].total += Math.abs(transaction.amount);
      merchantSpending[key].count++;
    });

    // Identify potential subscription services (regular, significant expenses)
    const potentialSubscriptions = Object.entries(merchantSpending)
      .filter(([_, data]) => data.count >= 3 && data.total > 20)
      .map(([merchant, data]) => ({
        merchant,
        monthlyAverage: data.total / (data.count / 3), // Extrapolate to monthly average
        frequency: data.count,
        suggestion: "Consider if this is a necessary recurring expense",
      }));

    if (potentialSubscriptions.length > 0) {
      opportunities.push({
        type: "recurring_expenses",
        message: `${potentialSubscriptions.length} potential recurring expenses identified`,
        details: potentialSubscriptions.slice(0, 3),
        suggestion:
          "Review these expenses and consider canceling unused subscriptions",
      });
    }

    // Find high-cost categories
    const categorySpending = {};
    expenseTransactions.forEach((transaction) => {
      const category = transaction.category || "Uncategorized";
      categorySpending[category] =
        (categorySpending[category] || 0) + Math.abs(transaction.amount);
    });

    const highCostCategories = Object.entries(categorySpending)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, amount]) => ({ category, amount }));

    if (highCostCategories.length > 0) {
      opportunities.push({
        type: "high_cost_categories",
        message: "Highest spending categories identified",
        details: highCostCategories,
        suggestion:
          "Consider budgeting or reducing expenses in these categories",
      });
    }

    return opportunities;
  }

  /**
   * Generates unified summary from all analytics components
   * @param {Object} patterns - Spending patterns
   * @param {Object} budgetRecommendations - Budget recommendations
   * @param {Object} goalOptimization - Goal optimization results
   * @param {Object} moodAnalysis - Mood analysis results
   * @param {Object} transactionAnalysis - Transaction analysis
   * @param {Object} cashFlowAnalysis - Cash flow analysis
   * @param {Object} spendingForecast - Spending forecast
   * @param {Object} subscriptionAnalysis - Subscription analysis
   * @param {Object} goalAnalytics - Goal analytics
   * @returns {Object} Unified summary
   */
  generateUnifiedSummary(
    patterns,
    budgetRecommendations,
    goalOptimization,
    moodAnalysis,
    transactionAnalysis,
    cashFlowAnalysis,
    spendingForecast,
    subscriptionAnalysis,
    goalAnalytics
  ) {
    const summary = {
      // Patterns analysis
      totalPatterns: Object.keys(patterns).length,
      recurringPayments: patterns.recurringPayments?.length || 0,
      anomaliesDetected: patterns.anomalyDetections?.length || 0,

      // Budget analysis
      budgetOpportunities: budgetRecommendations.recommendations?.length || 0,
      potentialSavings: budgetRecommendations.potentialSavings?.monthly || 0,

      // Goals analysis
      goalOptimizations: goalOptimization.allocations?.length || 0,
      goalCompletion: goalAnalytics.totalProgressPercentage || 0,
      goalsAtRisk: goalAnalytics.goalsAtRisk?.length || 0,

      // Mood analysis
      moodInsights: moodAnalysis.insights?.length || 0,
      emotionalSpending: moodAnalysis.emotionalSpending || 0,

      // Transaction analysis
      transactionInsights: transactionAnalysis.anomalies?.length || 0,
      spendingTrend: transactionAnalysis.trends?.spendingTrend || "stable",

      // Cash flow health assessment
      cashFlowHealth: this.assessCashFlowHealth(cashFlowAnalysis),
      averageDailyNet: this.calculateAverageNet(cashFlowAnalysis),

      // Forecast metrics
      forecastConfidence: spendingForecast.confidence || "low",
      projectedSpending:
        spendingForecast.dailyProjections?.reduce(
          (sum, p) => sum + p.projectedAmount,
          0
        ) || 0,

      // Subscription analysis
      activeSubscriptions: subscriptionAnalysis.activeSubscriptions || 0,
      subscriptionSavings:
        subscriptionAnalysis.recommendations
          ?.filter((r) => r.type === "cost_reduction")
          .reduce((sum, r) => sum + (r.potentialSavings || 0), 0) || 0,

      // Overall health score
      overallHealth: this.calculateOverallHealth(
        cashFlowAnalysis,
        goalAnalytics,
        spendingForecast,
        subscriptionAnalysis
      ),

      // Metadata
      lastUpdated: new Date().toISOString(),
      dataPoints: {
        transactions: transactionAnalysis.summary?.totalTransactions || 0,
        patterns: Object.keys(patterns).length,
        recommendations:
          (budgetRecommendations.recommendations?.length || 0) +
          (goalOptimization.allocations?.length || 0),
      },
    };

    return summary;
  }

  /**
   * Assesses cash flow health based on analysis results
   * @param {Object} cashFlowAnalysis - Cash flow analysis results
   * @returns {string} Health rating
   */
  assessCashFlowHealth(cashFlowAnalysis) {
    if (!cashFlowAnalysis.periods || cashFlowAnalysis.periods.length === 0) {
      return "unknown";
    }

    const recentPeriods = cashFlowAnalysis.periods.slice(-3);
    const negativePeriods = recentPeriods.filter((p) => p.net < 0).length;

    // Health classification based on negative periods
    if (negativePeriods >= 2) return "critical";
    if (negativePeriods === 1) return "warning";

    // Assess savings rate for positive cash flow
    const savingsRates = recentPeriods.map((p) => p.savingsRate);
    const avgSavingsRate =
      savingsRates.reduce((a, b) => a + b, 0) / savingsRates.length;

    if (avgSavingsRate >= 20) return "excellent";
    if (avgSavingsRate >= 10) return "good";
    if (avgSavingsRate >= 0) return "stable";

    return "concerning";
  }

  /**
   * Calculates average daily net cash flow
   * @param {Object} cashFlowAnalysis - Cash flow analysis results
   * @returns {number} Average daily net
   */
  calculateAverageNet(cashFlowAnalysis) {
    if (!cashFlowAnalysis.periods || cashFlowAnalysis.periods.length === 0) {
      return 0;
    }

    const recentPeriods = cashFlowAnalysis.periods.slice(-7);
    const totalNet = recentPeriods.reduce((sum, p) => sum + p.net, 0);
    return recentPeriods.length > 0 ? totalNet / recentPeriods.length : 0;
  }

  /**
   * Calculates overall financial health score
   * @param {Object} cashFlowAnalysis - Cash flow analysis
   * @param {Object} goalAnalytics - Goal analytics
   * @param {Object} spendingForecast - Spending forecast
   * @param {Object} subscriptionAnalysis - Subscription analysis
   * @returns {number} Health score (0-100)
   */
  calculateOverallHealth(
    cashFlowAnalysis,
    goalAnalytics,
    spendingForecast,
    subscriptionAnalysis
  ) {
    let score = 50; // Base score

    // Cash flow health contribution (0-30 points)
    const cashFlowHealth = this.assessCashFlowHealth(cashFlowAnalysis);
    switch (cashFlowHealth) {
      case "excellent":
        score += 30;
        break;
      case "good":
        score += 20;
        break;
      case "stable":
        score += 10;
        break;
      case "concerning":
        score -= 10;
        break;
      case "warning":
        score -= 20;
        break;
      case "critical":
        score -= 30;
        break;
    }

    // Goal progress contribution (0-20 points)
    const goalProgress = goalAnalytics.totalProgressPercentage || 0;
    score += Math.min(20, goalProgress / 5); // 100% progress = 20 points

    // Forecast confidence contribution (0-15 points)
    const confidenceScore = {
      "very high": 15,
      high: 12,
      medium: 8,
      low: 4,
      "very low": 0,
    };
    score += confidenceScore[spendingForecast.confidence] || 0;

    // Subscription optimization contribution (0-10 points)
    const subscriptionScore = Math.min(
      10,
      subscriptionAnalysis.recommendations?.length || 0 * 2
    );
    score += subscriptionScore;

    // Normalize to 0-100 range
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Cleans up resources and connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      await this.securityService.cleanup();
      await this.moodService.cleanup();
      await this.budgetService.cleanup();
      await this.goalService.cleanup();
      await this.recurringService.cleanup();

      logger.info("Analytics service cleanup completed");
    } catch (error) {
      logger.error("Analytics service cleanup failed", {
        error: error.message,
      });
      throw error;
    }
  }
}

// Re-export all methods for backward compatibility
export const analyzeCashFlow = AnalyticsService.prototype.analyzeCashFlow;
export const analyzeIncomeStreams =
  AnalyticsService.prototype.analyzeIncomeStreams;
export const generateSpendingForecast =
  AnalyticsService.prototype.generateSpendingForecast;
export const generateContextualInsights =
  AnalyticsService.prototype.generateContextualInsights;
