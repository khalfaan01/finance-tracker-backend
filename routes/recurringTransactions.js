// recurringTransactions.js - Recurring transaction management routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { RecurringService } from "../services/recurringService.js";

const router = express.Router();
const recurringService = new RecurringService();

// Validation rules for recurring transaction creation/updates
const recurringValidation = [
  body("accountId").isInt({ min: 1 }).withMessage("Valid account ID required"),
  body("amount").isFloat({ min: 0.01 }).withMessage("Amount must be positive"),
  body("type")
    .isIn(["income", "expense"])
    .withMessage("Type must be income or expense"),
  body("category").trim().escape().isLength({ min: 1, max: 50 }),
  body("description").optional().trim().escape().isLength({ max: 255 }),
  body("frequency").isIn(["daily", "weekly", "monthly", "yearly"]),
  body("interval").optional().isInt({ min: 1, max: 365 }),
  body("startDate").isISO8601(),
  body("endDate").optional().isISO8601(),
  body("autoApprove").optional().isBoolean(),
];

/**
 * GET /recurring - Get all active recurring transactions for user
 * @route GET /recurring
 * @returns {Array} List of active recurring transactions
 * @description Retrieves all active recurring transactions with next run dates
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const recurringTransactions =
      await recurringService.getActiveRecurringTransactions(req.user.userId);

    logger.info("Fetched recurring transactions", {
      context: "recurring",
      userId: req.user.userId,
      transactionCount: recurringTransactions.length,
      activeCount: recurringTransactions.filter((t) => t.isActive).length,
    });

    res.json(recurringTransactions);
  } catch (error) {
    logger.error("Failed to fetch recurring transactions", {
      context: "recurring",
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch recurring transactions" });
  }
});

/**
 * GET /recurring/:id - Get specific recurring transaction details
 * @route GET /recurring/:id
 * @param {string} id - Recurring transaction ID
 * @returns {Object} Recurring transaction details with account information
 */
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const transaction =
      await recurringService.prisma.recurringTransaction.findFirst({
        where: {
          id: parseInt(id),
          userId: req.user.userId,
        },
        include: {
          account: true,
        },
      });

    if (!transaction) {
      logger.warn("Recurring transaction not found", {
        context: "recurring",
        userId: req.user.userId,
        transactionId: id,
      });
      return res.status(404).json({ error: "Recurring transaction not found" });
    }

    logger.info("Fetched recurring transaction details", {
      context: "recurring",
      userId: req.user.userId,
      transactionId: id,
      type: transaction.type,
      amount: transaction.amount,
    });

    res.json(transaction);
  } catch (error) {
    logger.error("Failed to fetch recurring transaction", {
      context: "recurring",
      userId: req.user.userId,
      transactionId: id,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch recurring transaction" });
  }
});

/**
 * POST /recurring - Create new recurring transaction
 * @route POST /recurring
 * @param {number} accountId - Account ID for transaction
 * @param {number} amount - Transaction amount
 * @param {string} type - 'income' or 'expense'
 * @param {string} category - Transaction category
 * @param {string} [description] - Transaction description
 * @param {string} frequency - 'daily', 'weekly', 'monthly', 'yearly'
 * @param {number} [interval] - Frequency interval (1-365)
 * @param {string} startDate - Start date (ISO 8601)
 * @param {string} [endDate] - Optional end date (ISO 8601)
 * @param {boolean} [autoApprove] - Auto-approve transactions (default: false)
 * @returns {Object} Created recurring transaction
 * @description Creates a scheduled recurring transaction with validation
 */
router.post("/", authenticateToken, recurringValidation, async (req, res) => {
  console.log("Received recurring transaction data:", req.body); // Debug

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log("Validation errors:", errors.array()); // Debug

    logger.warn("Recurring transaction creation validation failed", {
      context: "recurring",
      userId: req.user.userId,
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Parse and prepare data with type conversions
    const data = {
      ...req.body,
      userId: req.user.userId,
      accountId: parseInt(req.body.accountId),
      amount: parseFloat(req.body.amount),
      interval: req.body.interval ? parseInt(req.body.interval) : 1,
      startDate: new Date(req.body.startDate),
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      autoApprove: req.body.autoApprove || false,
    };

    const recurringTransaction =
      await recurringService.createRecurringTransaction(data);

    logger.info("Recurring transaction created successfully", {
      context: "recurring",
      userId: req.user.userId,
      transactionId: recurringTransaction.id,
      type: recurringTransaction.type,
      amount: recurringTransaction.amount,
      frequency: recurringTransaction.frequency,
      nextRunDate: recurringTransaction.nextRunDate,
    });

    res.status(201).json(recurringTransaction);
  } catch (error) {
    logger.error("Recurring transaction creation failed", {
      context: "recurring",
      userId: req.user.userId,
      error: error.message,
      transactionData: { type: req.body.type, category: req.body.category },
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /recurring/:id - Update recurring transaction
 * @route PUT /recurring/:id
 * @param {string} id - Recurring transaction ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated recurring transaction
 * @description Updates specific allowed fields with security checks for ownership
 */
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const updates = req.body;

    // Security: Only allow updating specific fields to prevent unauthorized changes
    const allowedUpdates = [
      "isActive",
      "amount",
      "category",
      "description",
      "frequency",
      "endDate",
    ];
    const filteredUpdates = {};

    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    // Verify ownership and update
    const updatedTransaction =
      await recurringService.prisma.recurringTransaction.update({
        where: {
          id: parseInt(id),
          userId: req.user.userId, // Security: Ensures user owns this record
        },
        data: {
          ...filteredUpdates,
          updatedAt: new Date(),
        },
      });

    logger.info("Recurring transaction updated successfully", {
      context: "recurring",
      userId: req.user.userId,
      transactionId: id,
      updatedFields: Object.keys(filteredUpdates),
    });

    res.json(updatedTransaction);
  } catch (error) {
    if (error.code === "P2025") {
      logger.warn("Recurring transaction not found for update", {
        context: "recurring",
        userId: req.user.userId,
        transactionId: id,
      });
      res.status(404).json({ error: "Recurring transaction not found" });
    } else {
      logger.error("Recurring transaction update failed", {
        context: "recurring",
        userId: req.user.userId,
        transactionId: id,
        error: error.message,
      });
      res.status(400).json({ error: "Failed to update recurring transaction" });
    }
  }
});

/**
 * DELETE /recurring/:id - Delete recurring transaction
 * @route DELETE /recurring/:id
 * @param {string} id - Recurring transaction ID
 * @returns {Object} Deletion confirmation
 * @description Deletes recurring transaction with ownership verification
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await recurringService.prisma.recurringTransaction.delete({
      where: {
        id: parseInt(id),
        userId: req.user.userId, // Security: Ensures user owns this record
      },
    });

    logger.info("Recurring transaction deleted successfully", {
      context: "recurring",
      userId: req.user.userId,
      transactionId: id,
    });

    res.json({ message: "Recurring transaction deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      logger.warn("Recurring transaction not found for deletion", {
        context: "recurring",
        userId: req.user.userId,
        transactionId: id,
      });
      res.status(404).json({ error: "Recurring transaction not found" });
    } else {
      logger.error("Recurring transaction deletion failed", {
        context: "recurring",
        userId: req.user.userId,
        transactionId: id,
        error: error.message,
      });
      res.status(400).json({ error: "Failed to delete recurring transaction" });
    }
  }
});

/**
 * POST /recurring/process-due - Process due recurring transactions (background task)
 * @route POST /recurring/process-due
 * @returns {Object} Processing results
 * @description Background task endpoint for processing due transactions. Should be restricted in production.
 */
router.post("/process-due", authenticateToken, async (req, res) => {
  // Security: In production, this should be a scheduled job, not user-accessible
  if (process.env.NODE_ENV === "production" && !req.user.isAdmin) {
    logger.warn("Unauthorized attempt to process due transactions", {
      context: "recurring",
      userId: req.user.userId,
      ip: req.ip,
    });
    return res
      .status(403)
      .json({ error: "Admin access required for this operation" });
  }

  try {
    const processedCount =
      await recurringService.processDueRecurringTransactions();

    logger.info("Processed due recurring transactions", {
      context: "recurring",
      processedCount: processedCount,
      initiatedByUser: req.user.userId,
    });

    res.json({
      message: `Successfully processed ${processedCount} recurring transactions`,
      processed: processedCount,
    });
  } catch (error) {
    logger.error("Failed to process due transactions", {
      context: "recurring",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to process recurring transactions" });
  }
});

/**
 * POST /recurring/simulate-process - Simulate processing due transactions
 * @route POST /recurring/simulate-process
 * @param {string} [date] - Optional simulation date (ISO 8601)
 * @returns {Object} Simulation results
 * @description Development/testing endpoint to simulate processing without actual execution
 */
router.post("/simulate-process", authenticateToken, async (req, res) => {
  try {
    const { date } = req.body;

    // Create simulated date for testing
    const simulatedDate = date ? new Date(date) : new Date();

    const dueTransactions =
      await recurringService.prisma.recurringTransaction.findMany({
        where: {
          userId: req.user.userId,
          isActive: true,
          nextRunDate: {
            lte: simulatedDate,
          },
          OR: [{ endDate: null }, { endDate: { gte: simulatedDate } }],
        },
        include: {
          account: true,
        },
      });

    const simulationResults = [];

    // Simulate processing each transaction
    for (const recurring of dueTransactions) {
      try {
        // Note: This is simulation only - doesn't execute actual transaction
        const transaction = await recurringService.executeRecurringTransaction(
          recurring
        );

        simulationResults.push({
          recurringId: recurring.id,
          transactionId: transaction.id,
          status: "success",
          amount: transaction.amount,
          description: transaction.description,
        });
      } catch (error) {
        simulationResults.push({
          recurringId: recurring.id,
          status: "error",
          error: error.message,
        });
      }
    }

    logger.info("Simulated recurring transaction processing", {
      context: "recurring",
      userId: req.user.userId,
      simulationDate: simulatedDate.toISOString(),
      processedCount: simulationResults.length,
      successCount: simulationResults.filter((r) => r.status === "success")
        .length,
    });

    res.json({
      simulationDate: simulatedDate.toISOString(),
      processed: simulationResults.length,
      results: simulationResults,
    });
  } catch (error) {
    logger.error("Recurring transaction simulation failed", {
      context: "recurring",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Simulation failed" });
  }
});

/**
 * GET /recurring/stats/overview - Get recurring transaction statistics
 * @route GET /recurring/stats/overview
 * @returns {Object} Statistics and projections for recurring transactions
 * @description Provides aggregated stats, active counts, and monthly projections
 */
router.get("/stats/overview", authenticateToken, async (req, res) => {
  try {
    const stats = await recurringService.prisma.recurringTransaction.groupBy({
      by: ["type", "frequency", "isActive"],
      where: {
        userId: req.user.userId,
      },
      _count: {
        id: true,
      },
      _sum: {
        amount: true,
      },
    });

    const activeTransactions =
      await recurringService.prisma.recurringTransaction.count({
        where: {
          userId: req.user.userId,
          isActive: true,
        },
      });

    const nextDue =
      await recurringService.prisma.recurringTransaction.findFirst({
        where: {
          userId: req.user.userId,
          isActive: true,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
        orderBy: {
          nextRunDate: "asc",
        },
        select: {
          id: true,
          description: true,
          amount: true,
          type: true,
          nextRunDate: true,
        },
      });

    const monthlyProjection = await calculateMonthlyProjection(
      req.user.userId,
      recurringService.prisma
    );

    logger.info("Generated recurring transaction statistics", {
      context: "recurring",
      userId: req.user.userId,
      activeCount: activeTransactions,
      nextDueDate: nextDue?.nextRunDate,
      monthlyProjection: monthlyProjection.netMonthly,
    });

    res.json({
      stats,
      summary: {
        totalActive: activeTransactions,
        nextDueTransaction: nextDue,
        monthlyProjection: monthlyProjection,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch recurring transaction statistics", {
      context: "recurring",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/**
 * Helper function to calculate monthly projection from recurring transactions
 * @param {number} userId - User ID
 * @param {Object} prisma - Prisma client instance
 * @returns {Object} Monthly income, expenses, and net projection
 * @private
 */
async function calculateMonthlyProjection(userId, prisma) {
  const recurringTransactions = await prisma.recurringTransaction.findMany({
    where: {
      userId,
      isActive: true,
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    },
  });

  let monthlyIncome = 0;
  let monthlyExpenses = 0;

  // Convert different frequencies to monthly equivalents
  recurringTransactions.forEach((transaction) => {
    const amount = transaction.amount;

    switch (transaction.frequency) {
      case "daily":
        if (transaction.type === "income")
          monthlyIncome += amount * 30; // Approx 30 days/month
        else monthlyExpenses += amount * 30;
        break;
      case "weekly":
        if (transaction.type === "income")
          monthlyIncome += amount * 4.33; // Average weeks/month
        else monthlyExpenses += amount * 4.33;
        break;
      case "monthly":
        if (transaction.type === "income") monthlyIncome += amount;
        else monthlyExpenses += amount;
        break;
      case "yearly":
        if (transaction.type === "income") monthlyIncome += amount / 12;
        else monthlyExpenses += amount / 12;
        break;
    }
  });

  return {
    monthlyIncome,
    monthlyExpenses,
    netMonthly: monthlyIncome - monthlyExpenses,
  };
}

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down recurring service - cleaning up connections", {
    context: "recurring",
  });
  try {
    await recurringService.cleanup();
    logger.info("Recurring service cleanup completed", {
      context: "recurring",
    });
  } catch (error) {
    logger.error("Error during recurring service cleanup", {
      context: "recurring",
      error: error.message,
    });
  }
  process.exit();
});

export default router;
