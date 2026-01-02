// transactions.js - Transaction management and financial tracking routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { TransactionService } from "../services/transactionService.js";

const router = express.Router();
const transactionService = new TransactionService();

// Input validation rules for transaction creation/updates
const transactionValidation = [
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be a positive number"),
  body("type")
    .isIn(["income", "expense"])
    .withMessage("Type must be income or expense"),
  body("category")
    .trim()
    .escape()
    .isLength({ min: 1, max: 50 })
    .withMessage("Category must be between 1-50 characters"),
  body("description")
    .optional()
    .trim()
    .escape()
    .isLength({ max: 255 })
    .withMessage("Description too long"),
  body("date")
    .isISO8601()
    .withMessage("Valid date required")
    .custom((value) => {
      const transactionDate = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today for inclusive comparison

      // Disallow future dates to prevent data integrity issues
      if (transactionDate > today) {
        throw new Error("Future dates are not allowed");
      }
      return true;
    }),
];

/**
 * GET /transactions - Get all transactions for authenticated user
 * @route GET /transactions
 * @returns {Array} List of user transactions with account and mood information
 * @description Retrieves complete transaction history with related data
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const transactions = await transactionService.getUserTransactions(
      req.user.userId
    );

    logger.info("Fetched user transactions", {
      context: "transaction",
      userId: req.user.userId,
      transactionCount: transactions.length,
      totalIncome: transactions.filter((t) => t.type === "income").length,
      totalExpenses: transactions.filter((t) => t.type === "expense").length,
    });

    res.json(transactions);
  } catch (error) {
    logger.error("Failed to fetch transactions", {
      context: "transaction",
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

/**
 * GET /transactions/summary - Get transaction summary by timeframe
 * @route GET /transactions/summary
 * @param {string} [timeframe] - Timeframe: 'daily', 'weekly', 'monthly', 'yearly' (default: 'monthly')
 * @returns {Object} Summary statistics for the specified timeframe
 * @description Provides aggregated financial data for budgeting and analysis
 */
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const { timeframe = "monthly" } = req.query;

    const summary = await transactionService.getTransactionSummary(
      req.user.userId,
      timeframe
    );

    logger.info("Generated transaction summary", {
      context: "transaction",
      userId: req.user.userId,
      timeframe: timeframe,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      netFlow: summary.netFlow,
    });

    res.json(summary);
  } catch (error) {
    logger.error("Transaction summary generation failed", {
      context: "transaction",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to get transaction summary" });
  }
});

/**
 * GET /transactions/flagged - Get flagged/suspicious transactions
 * @route GET /transactions/flagged
 * @returns {Array} Flagged transactions requiring review
 * @description Retrieves transactions flagged by fraud detection system
 */
router.get("/flagged", authenticateToken, async (req, res) => {
  try {
    const flaggedTransactions = await transactionService.getFlaggedTransactions(
      req.user.userId
    );

    logger.info("Fetched flagged transactions", {
      context: "transaction",
      userId: req.user.userId,
      flaggedCount: flaggedTransactions.length,
      highRiskCount: flaggedTransactions.filter((t) => t.fraudRisk === "high")
        .length,
    });

    res.json(flaggedTransactions);
  } catch (error) {
    logger.error("Failed to fetch flagged transactions", {
      context: "transaction",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch flagged transactions" });
  }
});

/**
 * POST /transactions - Create a new transaction with validation
 * @route POST /transactions
 * @param {number} amount - Transaction amount (must be positive)
 * @param {string} type - 'income' or 'expense'
 * @param {string} category - Transaction category
 * @param {string} date - Transaction date (ISO 8601, no future dates)
 * @param {string} [description] - Transaction description
 * @returns {Object} Created transaction or transaction with fraud warning
 * @description Creates transaction with fraud detection and budget checking
 */
router.post("/", authenticateToken, transactionValidation, async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Transaction creation validation failed", {
      context: "transaction",
      userId: req.user.userId,
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const data = {
      amount: parseFloat(req.body.amount),
      type: req.body.type,
      category: req.body.category,
      date: req.body.date,
      description: req.body.description,
    };

    // Additional server-side date validation as backup
    const transactionDate = new Date(data.date);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of day for inclusive comparison

    if (transactionDate > today) {
      logger.warn("Future date attempted in transaction creation", {
        context: "transaction",
        userId: req.user.userId,
        date: data.date,
      });
      return res.status(400).json({
        error:
          "Future dates are not allowed. Please select today or a past date.",
      });
    }

    const result = await transactionService.createTransaction(
      data,
      req.user.userId,
      req.ip
    );

    if (result.warning) {
      logger.warn("Transaction created with fraud warning", {
        context: "transaction",
        userId: req.user.userId,
        transactionId: result.transaction.id,
        warning: result.warning,
        fraudReason: result.fraudReason,
        amount: result.transaction.amount,
      });

      return res.status(201).json({
        transaction: result.transaction,
        warning: result.warning,
        fraudReason: result.fraudReason,
      });
    }

    logger.info("Transaction created successfully", {
      context: "transaction",
      userId: req.user.userId,
      transactionId: result.transaction.id,
      type: result.transaction.type,
      amount: result.transaction.amount,
      category: result.transaction.category,
    });

    res.status(201).json(result.transaction);
  } catch (error) {
    if (error.message.includes("No account found")) {
      logger.warn("Transaction creation failed - no account found", {
        context: "transaction",
        userId: req.user.userId,
        error: error.message,
      });
      res.status(404).json({ error: error.message });
    } else if (error.message.includes("exceed")) {
      logger.warn("Transaction creation failed - budget exceeded", {
        context: "transaction",
        userId: req.user.userId,
        error: error.message,
      });
      res.status(400).json({ error: error.message });
    } else {
      logger.error("Transaction creation failed", {
        context: "transaction",
        userId: req.user.userId,
        error: error.message,
        transactionData: { type: req.body.type, category: req.body.category },
      });
      res.status(500).json({ error: "Failed to create transaction" });
    }
  }
});

/**
 * PUT /transactions/:id - Update an existing transaction
 * @route PUT /transactions/:id
 * @param {string} id - Transaction ID
 * @param {Object} transactionData - Updated transaction fields
 * @returns {Object} Updated transaction
 * @description Updates transaction with full validation and audit trail
 */
router.put(
  "/:id",
  authenticateToken,
  transactionValidation,
  async (req, res) => {
    const { id } = req.params;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      logger.warn("Transaction update validation failed", {
        context: "transaction",
        userId: req.user.userId,
        transactionId: id,
        validationErrors: errors.array(),
      });
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const data = {
        amount: parseFloat(req.body.amount),
        type: req.body.type,
        category: req.body.category,
        date: req.body.date,
        description: req.body.description,
      };

      // Server-side date validation for updates
      const transactionDate = new Date(data.date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (transactionDate > today) {
        logger.warn("Future date attempted in transaction update", {
          context: "transaction",
          userId: req.user.userId,
          transactionId: id,
          date: data.date,
        });
        return res.status(400).json({
          error:
            "Future dates are not allowed. Please select today or a past date.",
        });
      }

      const transaction = await transactionService.updateTransaction(
        id,
        data,
        req.user.userId
      );

      logger.info("Transaction updated successfully", {
        context: "transaction",
        userId: req.user.userId,
        transactionId: id,
        updatedFields: Object.keys(data),
      });

      res.json(transaction);
    } catch (error) {
      if (error.code === "P2025") {
        logger.warn("Transaction not found for update", {
          context: "transaction",
          userId: req.user.userId,
          transactionId: id,
        });
        res.status(404).json({ error: "Transaction not found" });
      } else {
        logger.error("Transaction update failed", {
          context: "transaction",
          userId: req.user.userId,
          transactionId: id,
          error: error.message,
        });
        res.status(500).json({ error: "Failed to update transaction" });
      }
    }
  }
);

/**
 * DELETE /transactions/:id - Delete a transaction
 * @route DELETE /transactions/:id
 * @param {string} id - Transaction ID
 * @returns {Object} Deletion confirmation
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await transactionService.deleteTransaction(id, req.user.userId);

    logger.info("Transaction deleted successfully", {
      context: "transaction",
      userId: req.user.userId,
      transactionId: id,
    });

    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      logger.warn("Transaction not found for deletion", {
        context: "transaction",
        userId: req.user.userId,
        transactionId: id,
      });
      res.status(404).json({ error: "Transaction not found" });
    } else {
      logger.error("Transaction deletion failed", {
        context: "transaction",
        userId: req.user.userId,
        transactionId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  }
});

/**
 * PATCH /transactions/:id/review - Mark transaction as reviewed
 * @route PATCH /transactions/:id/review
 * @param {string} id - Transaction ID
 * @returns {Object} Review confirmation with updated transaction
 * @description Marks flagged transaction as reviewed by user
 */
router.patch("/:id/review", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const transaction = await transactionService.markAsReviewed(
      parseInt(id),
      req.user.userId
    );

    logger.info("Transaction marked as reviewed", {
      context: "transaction",
      userId: req.user.userId,
      transactionId: id,
      previousFlagStatus: transaction.wasFlagged,
    });

    res.json({
      message: "Transaction marked as reviewed",
      transaction,
    });
  } catch (error) {
    if (error.code === "P2025") {
      logger.warn("Transaction not found for review marking", {
        context: "transaction",
        userId: req.user.userId,
        transactionId: id,
      });
      res.status(404).json({ error: "Transaction not found" });
    } else {
      logger.error("Failed to mark transaction as reviewed", {
        context: "transaction",
        userId: req.user.userId,
        transactionId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to mark transaction as reviewed" });
    }
  }
});

/**
 * GET /transactions/category/:category - Get transactions by category
 * @route GET /transactions/category/:category
 * @param {string} category - Transaction category
 * @param {string} [timeframe] - Timeframe filter: 'daily', 'weekly', 'monthly', 'yearly'
 * @returns {Object} Category transactions with summary statistics
 * @description Retrieves all transactions in a specific category with financial summary
 */
router.get("/category/:category", authenticateToken, async (req, res) => {
  const { category } = req.params;
  const { timeframe = "monthly" } = req.query;

  try {
    const decodedCategory = decodeURIComponent(category);
    const dateFilter = transactionService.getDateFilter(timeframe);

    const transactions = await transactionService.prisma.transaction.findMany({
      where: {
        account: { userId: req.user.userId },
        category: decodedCategory,
        date: dateFilter,
      },
      include: {
        account: true,
        mood: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    // Calculate summary statistics
    const summary = transactions.reduce(
      (acc, tx) => {
        const amount = Math.abs(tx.amount);
        if (tx.type === "income") {
          acc.totalIncome += amount;
        } else {
          acc.totalExpenses += amount;
        }
        acc.count++;
        return acc;
      },
      { totalIncome: 0, totalExpenses: 0, count: 0 }
    );

    const result = {
      category: decodedCategory,
      transactions,
      summary: {
        ...summary,
        netFlow: summary.totalIncome - summary.totalExpenses,
      },
    };

    logger.info("Fetched category transactions", {
      context: "transaction",
      userId: req.user.userId,
      category: decodedCategory,
      timeframe: timeframe,
      transactionCount: transactions.length,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
    });

    res.json(result);
  } catch (error) {
    logger.error("Failed to fetch category transactions", {
      context: "transaction",
      userId: req.user.userId,
      category: category,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch category transactions" });
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down transaction service - cleaning up connections", {
    context: "transaction",
  });
  try {
    await transactionService.cleanup();
    logger.info("Transaction service cleanup completed", {
      context: "transaction",
    });
  } catch (error) {
    logger.error("Error during transaction service cleanup", {
      context: "transaction",
      error: error.message,
    });
  }
  process.exit();
});

export { router as default };
