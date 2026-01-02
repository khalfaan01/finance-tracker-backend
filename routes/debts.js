// routes/debts.js - Debt management and tracking routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { DebtService } from "../services/debtService.js";

const router = express.Router();
const debtService = new DebtService();

// Validation rules for debt creation/updates
const debtValidation = [
  body("name")
    .trim()
    .escape()
    .isLength({ min: 1, max: 100 })
    .withMessage("Name must be between 1-100 characters"),
  body("type")
    .isIn(["loan", "credit_card", "mortgage", "personal", "auto", "student"])
    .withMessage("Invalid debt type"),
  body("principal")
    .isFloat({ min: 0.01 })
    .withMessage("Principal must be positive"),
  body("balance").isFloat({ min: 0 }).withMessage("Balance must be positive"),
  body("interestRate")
    .isFloat({ min: 0, max: 100 })
    .withMessage("Interest rate must be 0-100"),
  body("minimumPayment")
    .isFloat({ min: 0.01 })
    .withMessage("Minimum payment must be positive"),
  body("startDate").isISO8601().withMessage("Valid start date required"),
  body("dueDate").optional().isISO8601().withMessage("Valid due date required"),
  body("termMonths")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Term must be positive"),
  body("lender")
    .optional()
    .trim()
    .escape()
    .isLength({ max: 100 })
    .withMessage("Lender name too long"),
];

/**
 * GET /debts - Get all debts for authenticated user
 * @route GET /debts
 * @returns {Array} List of user debts with current balances and status
 * @description Retrieves all active debts with calculated metrics
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const debts = await debtService.getUserDebts(req.user.userId);

    logger.info("Fetched user debts", {
      context: "debt",
      userId: req.user.userId,
      debtCount: debts.length,
      totalBalance: debts.reduce((sum, debt) => sum + debt.balance, 0),
    });

    res.json(debts);
  } catch (error) {
    logger.error("Failed to fetch debts", {
      context: "debt",
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch debts" });
  }
});

/**
 * GET /debts/:id - Get specific debt details
 * @route GET /debts/:id
 * @param {string} id - Debt ID
 * @returns {Object} Detailed debt information
 */
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const debt = await debtService.getDebt(id, req.user.userId);

    logger.info("Fetched debt details", {
      context: "debt",
      userId: req.user.userId,
      debtId: id,
      debtName: debt.name,
      debtType: debt.type,
    });

    res.json(debt);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Debt not found", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Failed to fetch debt", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch debt" });
    }
  }
});

/**
 * POST /debts - Create a new debt entry
 * @route POST /debts
 * @param {Object} debtData - Debt information including type, amounts, dates
 * @returns {Object} Created debt
 * @description Creates new debt with comprehensive validation including interest rate bounds
 */
router.post("/", authenticateToken, debtValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Debt creation validation failed", {
      context: "debt",
      userId: req.user.userId,
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const debt = await debtService.createDebt(req.body, req.user.userId);

    logger.info("Debt created successfully", {
      context: "debt",
      userId: req.user.userId,
      debtId: debt.id,
      debtName: debt.name,
      debtType: debt.type,
      principal: debt.principal,
      balance: debt.balance,
    });

    res.status(201).json(debt);
  } catch (error) {
    logger.error("Debt creation failed", {
      context: "debt",
      userId: req.user.userId,
      error: error.message,
      debtData: { name: req.body.name, type: req.body.type },
    });
    res.status(500).json({ error: "Failed to create debt" });
  }
});

/**
 * PUT /debts/:id - Update an existing debt
 * @route PUT /debts/:id
 * @param {string} id - Debt ID
 * @param {Object} debtData - Debt fields to update
 * @returns {Object} Updated debt
 */
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const debt = await debtService.updateDebt(id, req.body, req.user.userId);

    logger.info("Debt updated successfully", {
      context: "debt",
      userId: req.user.userId,
      debtId: id,
      updatedFields: Object.keys(req.body),
    });

    res.json(debt);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Debt not found for update", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Debt update failed", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update debt" });
    }
  }
});

/**
 * DELETE /debts/:id - Delete a debt
 * @route DELETE /debts/:id
 * @param {string} id - Debt ID
 * @returns {Object} Deletion confirmation
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await debtService.deleteDebt(id, req.user.userId);

    logger.info("Debt deleted successfully", {
      context: "debt",
      userId: req.user.userId,
      debtId: id,
    });

    res.json({ message: "Debt deleted successfully" });
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Debt not found for deletion", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Debt deletion failed", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to delete debt" });
    }
  }
});

/**
 * POST /debts/:id/payment - Make a payment on a debt
 * @route POST /debts/:id/payment
 * @param {string} id - Debt ID
 * @param {number} amount - Payment amount
 * @param {string} accountId - Source account ID for payment
 * @param {string} [paymentDate] - Payment date (defaults to current date)
 * @param {string} [description] - Payment description
 * @returns {Object} Payment result with updated debt balance
 * @description Processes debt payment, updates balance, and creates transaction record
 */
router.post("/:id/payment", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { amount, paymentDate, accountId, description } = req.body;

  if (!amount || amount <= 0) {
    logger.warn("Invalid payment amount", {
      context: "debt",
      userId: req.user.userId,
      debtId: id,
      amount: amount,
    });
    return res.status(400).json({ error: "Valid payment amount required" });
  }

  if (!accountId) {
    logger.warn("Missing account ID for payment", {
      context: "debt",
      userId: req.user.userId,
      debtId: id,
    });
    return res.status(400).json({ error: "Account ID required" });
  }

  try {
    // Parse amount and ensure it's numeric
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount)) {
      logger.warn("Non-numeric payment amount", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
        amount: amount,
      });
      return res.status(400).json({ error: "Payment amount must be a number" });
    }

    // Use current date if none provided
    const paymentDateObj = paymentDate ? new Date(paymentDate) : new Date();

    const result = await debtService.makePayment(
      id,
      paymentAmount,
      paymentDateObj,
      accountId,
      req.user.userId,
      description
    );

    logger.info("Debt payment processed successfully", {
      context: "debt",
      userId: req.user.userId,
      debtId: id,
      paymentAmount: paymentAmount,
      newBalance: result.newBalance,
      accountId: accountId,
    });

    res.json(result);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Debt or account not found for payment", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
        accountId: accountId,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Debt payment processing failed", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
        amount: amount,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to process payment" });
    }
  }
});

/**
 * GET /debts/analytics/summary - Get debt analytics and summary
 * @route GET /debts/analytics/summary
 * @returns {Object} Debt summary with totals, strategies, and recommendations
 * @description Provides comprehensive debt overview with payoff strategy analysis
 */
router.get("/analytics/summary", authenticateToken, async (req, res) => {
  try {
    const summary = await debtService.getDebtSummary(req.user.userId);

    logger.info("Generated debt analytics summary", {
      context: "debt",
      userId: req.user.userId,
      totalDebts: summary.totalDebts,
      totalBalance: summary.totalBalance,
      totalMonthlyPayment: summary.totalMonthlyPayment,
    });

    res.json(summary);
  } catch (error) {
    logger.error("Debt analytics generation failed", {
      context: "debt",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to generate debt analytics" });
  }
});

/**
 * GET /debts/:id/schedule - Generate payment schedule for a debt
 * @route GET /debts/:id/schedule
 * @param {string} id - Debt ID
 * @param {number} [extraPayment] - Optional extra monthly payment amount
 * @returns {Object} Amortization schedule with payment breakdown
 * @description Generates detailed payment schedule showing principal/interest breakdown
 */
router.get("/:id/schedule", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { extraPayment = 0 } = req.query;

  try {
    // Parse extra payment, default to 0 if not provided or invalid
    const extraPaymentAmount = parseFloat(extraPayment) || 0;

    const schedule = await debtService.getPaymentSchedule(
      id,
      req.user.userId,
      extraPaymentAmount
    );

    logger.info("Generated payment schedule", {
      context: "debt",
      userId: req.user.userId,
      debtId: id,
      scheduleMonths: schedule.length,
      extraPayment: extraPaymentAmount,
    });

    res.json(schedule);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Debt not found for schedule generation", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Payment schedule generation failed", {
        context: "debt",
        userId: req.user.userId,
        debtId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to generate payment schedule" });
    }
  }
});

/**
 * GET /debts/analytics/strategies - Compare debt payoff strategies
 * @route GET /debts/analytics/strategies
 * @returns {Object} Comparison of snowball vs avalanche payoff methods
 * @description Analyzes and compares different debt repayment strategies
 */
router.get("/analytics/strategies", authenticateToken, async (req, res) => {
  try {
    const summary = await debtService.getDebtSummary(req.user.userId);

    // Extract strategy comparison data from summary
    const strategies = {
      snowball: {
        name: "Snowball Method",
        description: "Pay smallest debts first for quick wins",
        order: summary.snowballOrder,
        timeline: summary.snowballTimeline,
      },
      avalanche: {
        name: "Avalanche Method",
        description: "Pay highest interest debts first to save money",
        order: summary.avalancheOrder,
        timeline: summary.avalancheTimeline,
      },
      recommended: summary.suggestedStrategy,
    };

    logger.info("Generated debt payoff strategy comparison", {
      context: "debt",
      userId: req.user.userId,
      recommendedStrategy: summary.suggestedStrategy,
      debtCount: summary.totalDebts,
    });

    res.json(strategies);
  } catch (error) {
    logger.error("Debt strategy comparison failed", {
      context: "debt",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to compare strategies" });
  }
});

/**
 * GET /debts/upcoming/due - Get debts due within next 30 days
 * @route GET /debts/upcoming/due
 * @returns {Object} List of upcoming due debts with days until due
 * @description Filters active debts with due dates in the next month
 */
router.get("/upcoming/due", authenticateToken, async (req, res) => {
  try {
    const debts = await debtService.getUserDebts(req.user.userId, false);

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // Filter for active debts due within the next 30 days
    const dueSoon = debts
      .filter((debt) => {
        if (!debt.dueDate || !debt.isActive) return false;
        const dueDate = new Date(debt.dueDate);
        return dueDate >= now && dueDate <= thirtyDaysFromNow;
      })
      .map((debt) => ({
        ...debt,
        ...debtService.calculateDebtMetrics(debt),
        daysUntilDue: Math.ceil(
          (new Date(debt.dueDate) - now) / (1000 * 60 * 60 * 24)
        ),
      }));

    const totalMinimumDue = dueSoon.reduce(
      (sum, debt) => sum + debt.minimumPayment,
      0
    );

    logger.info("Fetched upcoming due debts", {
      context: "debt",
      userId: req.user.userId,
      dueSoonCount: dueSoon.length,
      totalMinimumDue: totalMinimumDue,
    });

    res.json({
      dueSoon,
      count: dueSoon.length,
      totalMinimumDue: totalMinimumDue,
    });
  } catch (error) {
    logger.error("Failed to fetch upcoming due debts", {
      context: "debt",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch upcoming due debts" });
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down debt service - cleaning up connections", {
    context: "debt",
  });
  try {
    await debtService.cleanup();
    logger.info("Debt service cleanup completed", { context: "debt" });
  } catch (error) {
    logger.error("Error during debt service cleanup", {
      context: "debt",
      error: error.message,
    });
  }
  process.exit();
});

export default router;
