// goals.js - Financial goals and savings tracking routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { GoalService } from "../services/goalService.js";

const router = express.Router();
const goalService = new GoalService();

// Validation rules for goal creation/updates
const goalValidation = [
  body("name")
    .trim()
    .escape()
    .isLength({ min: 1, max: 100 })
    .withMessage("Name must be between 1-100 characters"),
  body("targetAmount")
    .isFloat({ min: 0.01 })
    .withMessage("Target amount must be positive"),
  body("currentAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Current amount must be positive"),
  body("deadline").isISO8601().withMessage("Valid deadline date required"),
  body("category")
    .optional()
    .trim()
    .escape()
    .isLength({ max: 50 })
    .withMessage("Category too long"),
  body("allocationPercentage")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Allocation percentage must be 0-100"),
];

/**
 * GET /goals - Get all financial goals for authenticated user
 * @route GET /goals
 * @returns {Array} List of user goals with progress tracking
 * @description Retrieves all goals with calculated progress percentages and time remaining
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const goals = await goalService.getUserGoals(req.user.userId);

    logger.info("Fetched user goals", {
      context: "goal",
      userId: req.user.userId,
      goalCount: goals.length,
      totalTarget: goals.reduce((sum, goal) => sum + goal.targetAmount, 0),
      totalCurrent: goals.reduce((sum, goal) => sum + goal.currentAmount, 0),
    });

    res.json(goals);
  } catch (error) {
    logger.error("Failed to fetch goals", {
      context: "goal",
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

/**
 * GET /goals/analytics - Get goal analytics and progress insights
 * @route GET /goals/analytics
 * @returns {Object} Goal analytics with progress trends and recommendations
 * @description Provides analytics on goal achievement rates and progress patterns
 */
router.get("/analytics", authenticateToken, async (req, res) => {
  try {
    const analytics = await goalService.getGoalAnalytics(req.user.userId);

    logger.info("Generated goal analytics", {
      context: "goal",
      userId: req.user.userId,
      totalGoals: analytics.totalGoals,
      averageProgress: analytics.averageProgress,
      onTrackGoals: analytics.onTrackGoals,
    });

    res.json(analytics);
  } catch (error) {
    logger.error("Goal analytics generation failed", {
      context: "goal",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch goal analytics" });
  }
});

/**
 * GET /goals/suggestions - Get suggested allocations for available funds
 * @route GET /goals/suggestions
 * @param {number} availableAmount - Available amount to allocate (default: 1000)
 * @returns {Object} Suggested allocation percentages and amounts per goal
 * @description Suggests optimal allocation based on goal priorities and deadlines
 */
router.get("/suggestions", authenticateToken, async (req, res) => {
  try {
    // Parse available amount with default fallback
    const { availableAmount = 1000 } = req.query;
    const availableAmountNumber = parseFloat(availableAmount);

    if (isNaN(availableAmountNumber) || availableAmountNumber < 0) {
      logger.warn("Invalid available amount for suggestions", {
        context: "goal",
        userId: req.user.userId,
        availableAmount: availableAmount,
      });
      return res
        .status(400)
        .json({ error: "Available amount must be a positive number" });
    }

    const suggestions = await goalService.suggestAllocations(
      req.user.userId,
      availableAmountNumber
    );

    logger.info("Generated goal allocation suggestions", {
      context: "goal",
      userId: req.user.userId,
      availableAmount: availableAmountNumber,
      suggestedGoals: suggestions.length,
      totalAllocated: suggestions.reduce(
        (sum, s) => sum + s.suggestedAmount,
        0
      ),
    });

    res.json(suggestions);
  } catch (error) {
    logger.error("Goal suggestions generation failed", {
      context: "goal",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

/**
 * POST /goals - Create a new financial goal
 * @route POST /goals
 * @param {string} name - Goal name
 * @param {number} targetAmount - Target amount to save
 * @param {number} [currentAmount] - Current saved amount (defaults to 0)
 * @param {string} deadline - Goal deadline date (ISO 8601)
 * @param {string} [category] - Goal category
 * @param {number} [allocationPercentage] - Percentage of income to allocate (0-100)
 * @returns {Object} Created goal
 * @description Creates a new savings goal with progress tracking
 */
router.post("/", authenticateToken, goalValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Goal creation validation failed", {
      context: "goal",
      userId: req.user.userId,
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const goal = await goalService.createGoal(req.body, req.user.userId);

    logger.info("Goal created successfully", {
      context: "goal",
      userId: req.user.userId,
      goalId: goal.id,
      goalName: goal.name,
      targetAmount: goal.targetAmount,
      deadline: goal.deadline,
    });

    res.status(201).json(goal);
  } catch (error) {
    logger.error("Goal creation failed", {
      context: "goal",
      userId: req.user.userId,
      error: error.message,
      goalData: { name: req.body.name, targetAmount: req.body.targetAmount },
    });
    res.status(500).json({ error: "Failed to create goal" });
  }
});

/**
 * PUT /goals/:id - Update an existing goal
 * @route PUT /goals/:id
 * @param {string} id - Goal ID
 * @param {Object} goalData - Goal fields to update
 * @returns {Object} Updated goal
 */
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const goal = await goalService.updateGoal(id, req.body, req.user.userId);

    logger.info("Goal updated successfully", {
      context: "goal",
      userId: req.user.userId,
      goalId: id,
      updatedFields: Object.keys(req.body),
    });

    res.json(goal);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Goal not found for update", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Goal update failed", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update goal" });
    }
  }
});

/**
 * DELETE /goals/:id - Delete a goal
 * @route DELETE /goals/:id
 * @param {string} id - Goal ID
 * @returns {Object} Deletion confirmation
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await goalService.deleteGoal(id, req.user.userId);

    logger.info("Goal deleted successfully", {
      context: "goal",
      userId: req.user.userId,
      goalId: id,
    });

    res.json({ message: "Goal deleted successfully" });
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Goal not found for deletion", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Goal deletion failed", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to delete goal" });
    }
  }
});

/**
 * POST /goals/:id/contribute - Make a manual contribution to a goal
 * @route POST /goals/:id/contribute
 * @param {string} id - Goal ID
 * @param {number} amount - Contribution amount
 * @param {string} [description] - Contribution description
 * @returns {Object} Contribution result with updated goal progress
 * @description Adds funds to goal and updates progress percentage
 */
router.post("/:id/contribute", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { amount, description = "Manual contribution" } = req.body;

  if (!amount || amount <= 0) {
    logger.warn("Invalid contribution amount", {
      context: "goal",
      userId: req.user.userId,
      goalId: id,
      amount: amount,
    });
    return res
      .status(400)
      .json({ error: "Valid contribution amount required" });
  }

  try {
    // Parse and validate amount
    const contributionAmount = parseFloat(amount);
    if (isNaN(contributionAmount)) {
      logger.warn("Non-numeric contribution amount", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
        amount: amount,
      });
      return res
        .status(400)
        .json({ error: "Contribution amount must be a number" });
    }

    const result = await goalService.contributeToGoal(
      id,
      contributionAmount,
      req.user.userId,
      description
    );

    logger.info("Goal contribution processed successfully", {
      context: "goal",
      userId: req.user.userId,
      goalId: id,
      contributionAmount: contributionAmount,
      newCurrentAmount: result.currentAmount,
      progressPercentage: result.progress,
    });

    res.json(result);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Goal not found for contribution", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Goal contribution failed", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
        amount: amount,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to contribute to goal" });
    }
  }
});

/**
 * POST /goals/auto-allocate - Automatically allocate income to goals
 * @route POST /goals/auto-allocate
 * @param {number} incomeAmount - Total income amount to allocate
 * @param {string} [incomeDescription] - Income description
 * @returns {Object} Allocation results per goal
 * @description Distributes income across goals based on allocation percentages
 */
router.post("/auto-allocate", authenticateToken, async (req, res) => {
  const { incomeAmount, incomeDescription = "Income allocation" } = req.body;

  if (!incomeAmount || incomeAmount <= 0) {
    logger.warn("Invalid income amount for auto-allocation", {
      context: "goal",
      userId: req.user.userId,
      incomeAmount: incomeAmount,
    });
    return res.status(400).json({ error: "Valid income amount required" });
  }

  try {
    // Parse and validate income amount
    const incomeAmountNumber = parseFloat(incomeAmount);
    if (isNaN(incomeAmountNumber)) {
      logger.warn("Non-numeric income amount for auto-allocation", {
        context: "goal",
        userId: req.user.userId,
        incomeAmount: incomeAmount,
      });
      return res.status(400).json({ error: "Income amount must be a number" });
    }

    const result = await goalService.autoAllocateIncome(
      incomeAmountNumber,
      req.user.userId,
      incomeDescription
    );

    const totalAllocated = result.allocations.reduce(
      (sum, alloc) => sum + alloc.amount,
      0
    );

    logger.info("Income auto-allocation completed", {
      context: "goal",
      userId: req.user.userId,
      incomeAmount: incomeAmountNumber,
      totalAllocated: totalAllocated,
      allocatedGoals: result.allocations.length,
      remainingIncome: result.remainingIncome,
    });

    res.json(result);
  } catch (error) {
    if (error.message.includes("exceeds 100%")) {
      logger.warn("Auto-allocation failed - total allocation exceeds 100%", {
        context: "goal",
        userId: req.user.userId,
        error: error.message,
      });
      res.status(400).json({ error: error.message });
    } else if (error.message.includes("No account")) {
      logger.warn("Auto-allocation failed - no default account found", {
        context: "goal",
        userId: req.user.userId,
        error: error.message,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Auto-allocation failed", {
        context: "goal",
        userId: req.user.userId,
        incomeAmount: incomeAmount,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to auto-allocate income" });
    }
  }
});

/**
 * GET /goals/:id - Get detailed information for a specific goal
 * @route GET /goals/:id
 * @param {string} id - Goal ID
 * @returns {Object} Detailed goal information with progress history
 */
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const goal = await goalService.getGoal(id, req.user.userId);

    if (!goal) {
      logger.warn("Goal not found", {
        context: "goal",
        userId: req.user.userId,
        goalId: id,
      });
      return res.status(404).json({ error: "Goal not found" });
    }

    logger.info("Fetched goal details", {
      context: "goal",
      userId: req.user.userId,
      goalId: id,
      goalName: goal.name,
      progress: goal.progress,
    });

    res.json(goal);
  } catch (error) {
    logger.error("Failed to fetch goal", {
      context: "goal",
      userId: req.user.userId,
      goalId: id,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch goal" });
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down goal service - cleaning up connections", {
    context: "goal",
  });
  try {
    await goalService.cleanup();
    logger.info("Goal service cleanup completed", { context: "goal" });
  } catch (error) {
    logger.error("Error during goal service cleanup", {
      context: "goal",
      error: error.message,
    });
  }
  process.exit();
});

export { router as default };
