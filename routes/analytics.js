// analytics.js - Analytics and reporting routes
import express from "express";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { AnalyticsService } from "../services/analyticsService.js";

const router = express.Router();
const analyticsService = new AnalyticsService();

/**
 * GET /analytics/overview - Get comprehensive dashboard analytics
 * @route GET /analytics/overview
 * @returns {Object} Comprehensive financial analysis and overview
 */
router.get("/overview", authenticateToken, async (req, res) => {
  try {
    const analysis = await analyticsService.getComprehensiveAnalysis(
      req.user.userId
    );

    logger.info("Generated comprehensive analytics overview", {
      userId: req.user.userId,
      analysisType: "dashboard-overview",
    });
    res.json(analysis);
  } catch (error) {
    logger.error("Comprehensive analytics generation failed", {
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to generate analytics" });
  }
});

/**
 * GET /analytics/enhanced - Enhanced analytics with customizable timeframe
 * @route GET /analytics/enhanced
 * @param {string} timeframe - Query param: 'daily', 'weekly', 'monthly', 'yearly'
 * @returns {Object} Enhanced comprehensive analysis with timeframe filtering
 */
router.get("/enhanced", authenticateToken, async (req, res) => {
  try {
    // Default to monthly if not specified, validate against known timeframes
    const { timeframe = "monthly" } = req.query;

    const comprehensiveAnalysis =
      await analyticsService.getEnhancedComprehensiveAnalysis(
        req.user.userId,
        timeframe
      );

    logger.info("Generated enhanced analytics", {
      userId: req.user.userId,
      timeframe: timeframe,
      analysisType: "enhanced-comprehensive",
    });
    res.json(comprehensiveAnalysis);
  } catch (error) {
    logger.error("Enhanced analytics generation failed", {
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to generate enhanced analytics" });
  }
});

/**
 * GET /analytics/cash-flow - Analyze cash flow patterns
 * @route GET /analytics/cash-flow
 * @param {string} granularity - Query param: 'daily', 'weekly', 'monthly'
 * @returns {Object} Cash flow analysis with income/expense patterns
 */
router.get("/cash-flow", authenticateToken, async (req, res) => {
  try {
    const { granularity = "daily" } = req.query;

    // Direct database access for raw transaction data
    const transactions = await analyticsService.prisma.transaction.findMany({
      where: { account: { userId: req.user.userId } },
      include: { account: true },
    });

    const cashFlowAnalysis = analyticsService.analyzeCashFlow(
      transactions,
      granularity,
      req.user.userId
    );

    logger.info("Generated cash flow analysis", {
      userId: req.user.userId,
      granularity: granularity,
      transactionCount: transactions.length,
    });
    res.json(cashFlowAnalysis);
  } catch (error) {
    logger.error("Cash flow analysis failed", {
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to analyze cash flow" });
  }
});

/**
 * GET /analytics/income-breakdown - Analyze income sources and patterns
 * @route GET /analytics/income-breakdown
 * @returns {Object} Detailed breakdown of income streams
 * @description Analyzes only income-type transactions for revenue sources
 */
router.get("/income-breakdown", authenticateToken, async (req, res) => {
  try {
    // Filter to only income transactions for revenue analysis
    const transactions = await analyticsService.prisma.transaction.findMany({
      where: {
        account: { userId: req.user.userId },
        type: "income", // Special filter for income analysis only
      },
      include: { account: true },
    });

    const incomeBreakdown = analyticsService.analyzeIncomeStreams(transactions);

    logger.info("Generated income breakdown", {
      userId: req.user.userId,
      incomeTransactionCount: transactions.length,
    });
    res.json(incomeBreakdown);
  } catch (error) {
    logger.error("Income breakdown analysis failed", {
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to analyze income streams" });
  }
});

/**
 * GET /analytics/forecast - Generate predictive spending forecast
 * @route GET /analytics/forecast
 * @param {number} days - Query param: number of days to forecast (default: 30)
 * @returns {Object} Predictive spending forecast based on historical data
 */
router.get("/forecast", authenticateToken, async (req, res) => {
  try {
    // Parse days parameter, ensure it's a positive integer
    const { days = 30 } = req.query;
    const forecastDays = parseInt(days);

    if (isNaN(forecastDays) || forecastDays <= 0) {
      logger.warn("Invalid forecast days parameter", {
        userId: req.user.userId,
        providedDays: days,
      });
      return res.status(400).json({ error: "Days must be a positive number" });
    }

    const transactions = await analyticsService.prisma.transaction.findMany({
      where: { account: { userId: req.user.userId } },
      include: { account: true },
    });

    const forecast = analyticsService.generateSpendingForecast(
      transactions,
      forecastDays
    );

    logger.info("Generated spending forecast", {
      userId: req.user.userId,
      forecastDays: forecastDays,
      historicalTransactionCount: transactions.length,
    });
    res.json(forecast);
  } catch (error) {
    logger.error("Forecast generation failed", {
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to generate forecast" });
  }
});

/**
 * GET /analytics/contextual-insights - Generate contextual spending insights
 * @route GET /analytics/contextual-insights
 * @returns {Object} Contextual insights and anomalies detection
 * @description Provides smart insights based on spending patterns and anomalies
 */
router.get("/contextual-insights", authenticateToken, async (req, res) => {
  try {
    const transactions = await analyticsService.prisma.transaction.findMany({
      where: { account: { userId: req.user.userId } },
      include: { account: true },
    });

    const insights = analyticsService.generateContextualInsights(transactions);

    logger.info("Generated contextual insights", {
      userId: req.user.userId,
      transactionCount: transactions.length,
      insightCount: insights.length || 0,
    });
    res.json(insights);
  } catch (error) {
    logger.error("Contextual insights generation failed", {
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to generate contextual insights" });
  }
});

export default router;
