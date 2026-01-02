// accounts.js - Account management routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { AccountService } from "../services/accountService.js";

const router = express.Router();
const accountService = new AccountService();

// Validation rules for account creation/updates
const accountValidation = [
  body("name")
    .trim()
    .escape()
    .isLength({ min: 1, max: 100 })
    .withMessage("Account name must be between 1-100 characters"),
  body("balance")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Balance must be positive"),
];

/**
 * GET /accounts - Get all accounts for authenticated user
 * @route GET /accounts
 * @param {boolean} includeTransactions - Query param to include recent transactions
 * @returns {Array} List of user accounts
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Convert string query to boolean, default to true if not specified
    const includeRecent = req.query.includeTransactions !== "false";
    const accounts = await accountService.getUserAccounts(
      req.user.userId,
      includeRecent
    );

    logger.info(
      `Fetched ${accounts.length} accounts for user ${req.user.userId}`
    );
    res.json(accounts);
  } catch (error) {
    logger.error("Failed to fetch user accounts", {
      userId: req.user.userId,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

/**
 * GET /accounts/summary - Get aggregated summary of all user accounts
 * @route GET /accounts/summary
 * @returns {Object} Summary data including totals and counts
 */
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const summary = await accountService.getAllAccountsSummary(req.user.userId);

    logger.info(`Generated accounts summary for user ${req.user.userId}`, {
      totalAccounts: summary.totalAccounts,
      totalBalance: summary.totalBalance,
    });
    res.json(summary);
  } catch (error) {
    logger.error("Accounts summary generation failed", {
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch accounts summary" });
  }
});

/**
 * GET /accounts/:id - Get detailed information for a specific account
 * @route GET /accounts/:id
 * @param {string} id - Account ID
 * @returns {Object} Account details
 */
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const account = await accountService.getAccount(id, req.user.userId);

    if (!account) {
      logger.warn(`Account not found: ${id} for user ${req.user.userId}`);
      return res.status(404).json({ error: "Account not found" });
    }

    logger.info(`Fetched account ${id} for user ${req.user.userId}`);
    res.json(account);
  } catch (error) {
    logger.error("Account fetch failed", {
      accountId: id,
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch account" });
  }
});

/**
 * GET /accounts/:id/analytics - Get analytics data for an account
 * @route GET /accounts/:id/analytics
 * @param {string} id - Account ID
 * @param {string} timeframe - Query param: 'daily', 'weekly', 'monthly', 'yearly'
 * @returns {Object} Analytics data
 */
router.get("/:id/analytics", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { timeframe = "monthly" } = req.query;

  try {
    const analytics = await accountService.getAccountAnalytics(
      id,
      req.user.userId,
      timeframe
    );

    logger.info(`Generated analytics for account ${id}`, {
      userId: req.user.userId,
      timeframe: timeframe,
      dataPoints: analytics.data?.length || 0,
    });
    res.json(analytics);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn(`Account not found for analytics: ${id}`, {
        userId: req.user.userId,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Account analytics generation failed", {
        accountId: id,
        userId: req.user.userId,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch account analytics" });
    }
  }
});

/**
 * POST /accounts - Create a new account
 * @route POST /accounts
 * @param {Object} accountData - Account name and optional initial balance
 * @returns {Object} Created account
 */
router.post("/", authenticateToken, accountValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Account creation validation failed", {
      userId: req.user.userId,
      errors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const account = await accountService.createAccount(
      req.body,
      req.user.userId
    );

    logger.info("Account created successfully", {
      accountId: account.id,
      accountName: account.name,
      userId: req.user.userId,
    });
    res.status(201).json(account);
  } catch (error) {
    logger.error("Account creation failed", {
      userId: req.user.userId,
      error: error.message,
      accountData: { name: req.body.name }, // Log name only for privacy
    });
    res.status(500).json({ error: "Failed to create account" });
  }
});

/**
 * PUT /accounts/:id/balance - Update account balance
 * @route PUT /accounts/:id/balance
 * @param {string} id - Account ID
 * @param {number} balance - New balance amount
 * @returns {Object} Updated account
 */
router.put("/:id/balance", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { balance } = req.body;

  // Explicit check for 0 as valid balance update
  if (!balance && balance !== 0) {
    logger.warn("Balance update validation failed", {
      accountId: id,
      userId: req.user.userId,
    });
    return res.status(400).json({ error: "Balance is required" });
  }

  try {
    const account = await accountService.updateAccountBalance(
      id,
      balance,
      req.user.userId
    );

    logger.info("Account balance updated", {
      accountId: id,
      newBalance: balance,
      userId: req.user.userId,
    });
    res.json(account);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn(`Account not found for balance update: ${id}`, {
        userId: req.user.userId,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Account balance update failed", {
        accountId: id,
        userId: req.user.userId,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update account balance" });
    }
  }
});

/**
 * PUT /accounts/:id/name - Update account name
 * @route PUT /accounts/:id/name
 * @param {string} id - Account ID
 * @param {string} name - New account name
 * @returns {Object} Updated account
 */
router.put("/:id/name", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    logger.warn("Account name update validation failed", {
      accountId: id,
      userId: req.user.userId,
    });
    return res.status(400).json({ error: "Account name is required" });
  }

  try {
    const account = await accountService.updateAccountName(
      id,
      name,
      req.user.userId
    );

    logger.info("Account name updated", {
      accountId: id,
      newName: name,
      userId: req.user.userId,
    });
    res.json(account);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn(`Account not found for name update: ${id}`, {
        userId: req.user.userId,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Account name update failed", {
        accountId: id,
        userId: req.user.userId,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update account name" });
    }
  }
});

/**
 * DELETE /accounts/:id - Delete an account
 * @route DELETE /accounts/:id
 * @param {string} id - Account ID
 * @returns {Object} Success message
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await accountService.deleteAccount(id, req.user.userId);

    logger.info("Account deleted successfully", {
      accountId: id,
      userId: req.user.userId,
    });
    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn(`Account not found for deletion: ${id}`, {
        userId: req.user.userId,
      });
      res.status(404).json({ error: error.message });
    } else if (error.message.includes("existing transactions")) {
      logger.warn(
        `Account deletion blocked due to existing transactions: ${id}`,
        {
          userId: req.user.userId,
        }
      );
      res.status(400).json({ error: error.message });
    } else {
      logger.error("Account deletion failed", {
        accountId: id,
        userId: req.user.userId,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to delete account" });
    }
  }
});

/**
 * POST /accounts/transfer - Transfer funds between accounts
 * @route POST /accounts/transfer
 * @param {string} fromAccountId - Source account ID
 * @param {string} toAccountId - Destination account ID
 * @param {number} amount - Transfer amount
 * @param {string} description - Optional transfer description
 * @returns {Object} Transfer result
 */
router.post("/transfer", authenticateToken, async (req, res) => {
  const { fromAccountId, toAccountId, amount, description } = req.body;

  if (!fromAccountId || !toAccountId || !amount) {
    logger.warn("Transfer validation failed", {
      userId: req.user.userId,
      providedFields: { fromAccountId, toAccountId, amount },
    });
    return res.status(400).json({
      error: "fromAccountId, toAccountId, and amount are required",
    });
  }

  try {
    const result = await accountService.transferBetweenAccounts(
      fromAccountId,
      toAccountId,
      amount,
      req.user.userId,
      description || "Account Transfer"
    );

    logger.info("Transfer completed successfully", {
      fromAccountId,
      toAccountId,
      amount,
      userId: req.user.userId,
      transferId: result.transferId,
    });
    res.json(result);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn("Transfer failed - account not found", {
        fromAccountId,
        toAccountId,
        userId: req.user.userId,
      });
      res.status(404).json({ error: error.message });
    } else if (error.message.includes("Insufficient funds")) {
      logger.warn("Transfer failed - insufficient funds", {
        fromAccountId,
        amount,
        userId: req.user.userId,
      });
      res.status(400).json({ error: error.message });
    } else if (error.message.includes("same account")) {
      logger.warn("Transfer failed - same account", {
        accountId: fromAccountId,
        userId: req.user.userId,
      });
      res.status(400).json({ error: error.message });
    } else {
      logger.error("Transfer processing failed", {
        fromAccountId,
        toAccountId,
        amount,
        userId: req.user.userId,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to process transfer" });
    }
  }
});

/**
 * GET /accounts/:id/summary - Get detailed summary for a specific account
 * @route GET /accounts/:id/summary
 * @param {string} id - Account ID
 * @returns {Object} Account summary with transaction statistics
 */
router.get("/:id/summary", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const summary = await accountService.getAccountSummary(id, req.user.userId);

    logger.info(`Generated summary for account ${id}`, {
      userId: req.user.userId,
      transactionCount: summary.transactionCount,
      balance: summary.currentBalance,
    });
    res.json(summary);
  } catch (error) {
    if (error.message.includes("not found")) {
      logger.warn(`Account not found for summary: ${id}`, {
        userId: req.user.userId,
      });
      res.status(404).json({ error: error.message });
    } else {
      logger.error("Account summary generation failed", {
        accountId: id,
        userId: req.user.userId,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch account summary" });
    }
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down account service - cleaning up connections");
  try {
    await accountService.cleanup();
    logger.info("Account service cleanup completed");
  } catch (error) {
    logger.error("Error during account service cleanup", {
      error: error.message,
    });
  }
  process.exit();
});

export { router as default };
