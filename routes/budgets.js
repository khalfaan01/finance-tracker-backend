// budgets.js - Budget management routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { BudgetService } from "../services/budgetService.js";

const router = express.Router();
const budgetService = new BudgetService();

// Validation rules for budget creation/updates
const budgetValidation = [
  body("category")
    .trim()
    .escape()
    .isLength({ min: 1, max: 50 })
    .withMessage("Category must be between 1-50 characters"),
  body("limit")
    .isFloat({ min: 0.01 })
    .withMessage("Limit must be a positive number"),
  body("period")
    .optional()
    .isIn(["daily", "weekly", "monthly", "yearly"])
    .withMessage("Invalid period"),
  body("rolloverType")
    .optional()
    .isIn(["none", "full", "partial", "capped"])
    .withMessage("Invalid rollover type"),
  body("rolloverAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Rollover amount must be positive"),
  body("allowExceed")
    .optional()
    .isBoolean()
    .withMessage("Allow exceed must be boolean"),
];

/**
 * GET /budgets - Get all budgets for authenticated user
 * @route GET /budgets
 * @returns {Array} List of user budgets
 * @description Retrieves all budgets with current spending and status
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const budgets = await budgetService.getUserBudgets(req.user.userId);

    logger.info("Fetched user budgets", {
      context: "budget",
      userId: req.user.userId,
      budgetCount: budgets.length,
    });

    res.json(budgets);
  } catch (error) {
    logger.error("Failed to fetch budgets", {
      context: "budget",
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch budgets" });
  }
});

/**
 * GET /budgets/summary - Get aggregated budget summary
 * @route GET /budgets/summary
 * @returns {Object} Budget summary with totals and status breakdown
 * @description Provides overview of budget utilization across all categories
 */
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const summary = await budgetService.getBudgetSummary(req.user.userId);

    logger.info("Generated budget summary", {
      context: "budget",
      userId: req.user.userId,
      totalBudgets: summary.totalBudgets,
      totalLimit: summary.totalLimit,
      totalSpent: summary.totalSpent,
    });

    res.json(summary);
  } catch (error) {
    logger.error("Budget summary generation failed", {
      context: "budget",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch budget summary" });
  }
});

/**
 * POST /budgets - Create a new budget
 * @route POST /budgets
 * @param {string} category - Budget category name
 * @param {number} limit - Budget spending limit
 * @param {string} [period] - Budget period: 'daily', 'weekly', 'monthly', 'yearly'
 * @param {string} [rolloverType] - Rollover behavior: 'none', 'full', 'partial', 'capped'
 * @param {number} [rolloverAmount] - Amount to rollover (for partial/capped types)
 * @param {boolean} [allowExceed] - Whether budget can be exceeded
 * @returns {Object} Created budget
 * @description Creates budget with enhanced features like rollover and period tracking
 */
router.post("/", authenticateToken, budgetValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Budget creation validation failed", {
      context: "budget",
      userId: req.user.userId,
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const budget = await budgetService.createBudget(req.body, req.user.userId);

    logger.info("Budget created successfully", {
      context: "budget",
      userId: req.user.userId,
      budgetId: budget.id,
      category: budget.category,
      limit: budget.limit,
      period: budget.period,
    });

    res.status(201).json(budget);
  } catch (error) {
    logger.error("Budget creation failed", {
      context: "budget",
      userId: req.user.userId,
      error: error.message,
      budgetData: { category: req.body.category, limit: req.body.limit },
    });
    res.status(500).json({ error: "Failed to create budget" });
  }
});

/**
 * PUT /budgets/:id - Update an existing budget
 * @route PUT /budgets/:id
 * @param {string} id - Budget ID
 * @param {Object} budgetData - Budget fields to update
 * @returns {Object} Updated budget
 */
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const budget = await budgetService.updateBudget(
      id,
      req.body,
      req.user.userId
    );

    logger.info("Budget updated successfully", {
      context: "budget",
      userId: req.user.userId,
      budgetId: id,
      updatedFields: Object.keys(req.body),
    });

    res.json(budget);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Budget not found for update", {
        context: "budget",
        userId: req.user.userId,
        budgetId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Budget update failed", {
        context: "budget",
        userId: req.user.userId,
        budgetId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update budget" });
    }
  }
});

/**
 * DELETE /budgets/:id - Delete a budget
 * @route DELETE /budgets/:id
 * @param {string} id - Budget ID
 * @returns {Object} Deletion confirmation
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await budgetService.deleteBudget(id, req.user.userId);

    logger.info("Budget deleted successfully", {
      context: "budget",
      userId: req.user.userId,
      budgetId: id,
    });

    res.json({ message: "Budget deleted successfully" });
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Budget not found for deletion", {
        context: "budget",
        userId: req.user.userId,
        budgetId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Budget deletion failed", {
        context: "budget",
        userId: req.user.userId,
        budgetId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to delete budget" });
    }
  }
});

/**
 * POST /budgets/:id/calculate-rollover - Calculate rollover amount for budget
 * @route POST /budgets/:id/calculate-rollover
 * @param {string} id - Budget ID
 * @returns {Object} Rollover calculation result
 * @description Calculates unused budget amount to rollover to next period
 */
router.post("/:id/calculate-rollover", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const rollover = await budgetService.calculateRollover(id, req.user.userId);

    logger.info("Rollover calculated", {
      context: "budget",
      userId: req.user.userId,
      budgetId: id,
      rolloverAmount: rollover.amount,
      rolloverType: rollover.type,
    });

    res.json(rollover);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Budget not found for rollover calculation", {
        context: "budget",
        userId: req.user.userId,
        budgetId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Rollover calculation failed", {
        context: "budget",
        userId: req.user.userId,
        budgetId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to calculate rollover" });
    }
  }
});

/**
 * POST /budgets/check-limit - Check if transaction exceeds budget limit
 * @route POST /budgets/check-limit
 * @param {string} category - Transaction category
 * @param {number} amount - Transaction amount
 * @returns {Object} Budget limit check result
 * @description Checks if transaction would exceed budget, returns warnings if close to limit
 */
router.post("/check-limit", authenticateToken, async (req, res) => {
  const { category, amount } = req.body;

  if (!category || !amount) {
    logger.warn("Budget check missing required fields", {
      context: "budget",
      userId: req.user.userId,
    });
    return res.status(400).json({ error: "Category and amount are required" });
  }

  try {
    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      logger.warn("Invalid amount for budget check", {
        context: "budget",
        userId: req.user.userId,
        amount: amount,
      });
      return res
        .status(400)
        .json({ error: "Amount must be a positive number" });
    }

    const check = await budgetService.checkBudgetLimit(
      req.user.userId,
      category,
      amountNumber
    );

    logger.info("Budget limit check completed", {
      context: "budget",
      userId: req.user.userId,
      category: category,
      amount: amountNumber,
      isWithinLimit: check.isWithinLimit,
      remainingBudget: check.remainingBudget,
    });

    res.json(check);
  } catch (error) {
    logger.error("Budget limit check failed", {
      context: "budget",
      userId: req.user.userId,
      category: category,
      amount: amount,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to check budget limit" });
  }
});

/**
 * POST /budgets/reset-spent - Reset monthly spent amounts (admin/background)
 * @route POST /budgets/reset-spent
 * @returns {Object} Reset operation result
 * @description Resets spent amounts for monthly budgets. In production, should be restricted to admin/background jobs.
 */
router.post("/reset-spent", authenticateToken, async (req, res) => {
  try {
    // Production safety check - comment explains this should be enhanced
    if (process.env.NODE_ENV === "production" && !req.user.isAdmin) {
      logger.warn("Unauthorized attempt to reset budget spent amounts", {
        context: "budget",
        userId: req.user.userId,
        ip: req.ip,
      });
      return res
        .status(403)
        .json({ error: "Admin access required for this operation" });
    }

    const resetCount = await budgetService.resetMonthlySpent();

    logger.info("Monthly budget spent amounts reset", {
      context: "budget",
      userId: req.user.userId,
      resetCount: resetCount,
      // Note: In production, this should be a background job, not user-initiated
      initiatedByUser: true,
    });

    res.json({
      message: `Reset ${resetCount} monthly budgets`,
      resetCount,
    });
  } catch (error) {
    logger.error("Budget reset spent operation failed", {
      context: "budget",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to reset spent amounts" });
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down budget service - cleaning up connections", {
    context: "budget",
  });
  try {
    await budgetService.cleanup();
    logger.info("Budget service cleanup completed", { context: "budget" });
  } catch (error) {
    logger.error("Error during budget service cleanup", {
      context: "budget",
      error: error.message,
    });
  }
  process.exit();
});

export { router as default };
