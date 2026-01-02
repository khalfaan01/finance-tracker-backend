// accountService.js
// Service for managing user accounts, balances, transactions, and financial analytics

import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * @typedef {Object} AccountData
 * @property {string} name - Account name
 * @property {number|string} [balance] - Initial balance
 */

/**
 * @typedef {Object} TransferData
 * @property {string|number} fromAccountId - Source account ID
 * @property {string|number} toAccountId - Destination account ID
 * @property {number|string} amount - Transfer amount
 * @property {string} [description] - Transfer description
 */

/**
 * Service class for account management operations
 */
export class AccountService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all accounts for a user
   * @param {string|number} userId - User ID
   * @param {boolean} [includeRecentTransactions=true] - Include recent transactions
   * @returns {Promise<Array>} Array of account objects
   */
  async getUserAccounts(userId, includeRecentTransactions = true) {
    try {
      const includeOptions = {};

      if (includeRecentTransactions) {
        includeOptions.transactions = {
          orderBy: { date: "desc" },
          take: 10,
        };
      }

      const accounts = await this.prisma.account.findMany({
        where: { userId },
        include: includeOptions,
      });

      logger.info("Retrieved user accounts", {
        userId,
        count: accounts.length,
      });
      return accounts;
    } catch (error) {
      logger.error("Failed to get user accounts", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get a single account with recent transactions
   * @param {string|number} accountId - Account ID
   * @param {string|number} userId - User ID for authorization
   * @returns {Promise<Object|null>} Account object or null if not found
   */
  async getAccount(accountId, userId) {
    try {
      const id = parseInt(accountId);
      if (isNaN(id)) {
        logger.warn("Invalid account ID format", { accountId });
        throw new Error("Invalid account ID");
      }

      const account = await this.prisma.account.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          transactions: {
            orderBy: { date: "desc" },
            take: 20,
          },
        },
      });

      if (!account) {
        logger.warn("Account not found or unauthorized", { accountId, userId });
        return null;
      }

      logger.debug("Retrieved account", { accountId, userId });
      return account;
    } catch (error) {
      logger.error("Failed to get account", {
        accountId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a new account
   * @param {AccountData} data - Account data
   * @param {string|number} userId - User ID
   * @returns {Promise<Object>} Created account object
   */
  async createAccount(data, userId) {
    try {
      const balance = parseFloat(data.balance || 0);
      if (isNaN(balance)) {
        throw new Error("Invalid balance value");
      }

      const account = await this.prisma.account.create({
        data: {
          userId,
          name: data.name.trim(),
          balance,
        },
      });

      logger.info("Account created successfully", {
        accountId: account.id,
        userId,
        name: account.name,
      });
      return account;
    } catch (error) {
      logger.error("Failed to create account", {
        userId,
        name: data.name,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update account balance
   * @param {string|number} accountId - Account ID
   * @param {number|string} balance - New balance
   * @param {string|number} userId - User ID for authorization
   * @returns {Promise<Object>} Updated account object
   */
  async updateAccountBalance(accountId, balance, userId) {
    try {
      const id = parseInt(accountId);
      const newBalance = parseFloat(balance);

      if (isNaN(id) || isNaN(newBalance)) {
        throw new Error("Invalid account ID or balance");
      }

      const account = await this.prisma.account.update({
        where: {
          id,
          userId,
        },
        data: { balance: newBalance },
      });

      logger.info("Account balance updated", {
        accountId: id,
        userId,
        newBalance,
      });
      return account;
    } catch (error) {
      logger.error("Failed to update account balance", {
        accountId,
        userId,
        balance,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update account name
   * @param {string|number} accountId - Account ID
   * @param {string} name - New account name
   * @param {string|number} userId - User ID for authorization
   * @returns {Promise<Object>} Updated account object
   */
  async updateAccountName(accountId, name, userId) {
    try {
      const id = parseInt(accountId);
      if (isNaN(id)) {
        throw new Error("Invalid account ID");
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Account name cannot be empty");
      }

      const account = await this.prisma.account.update({
        where: {
          id,
          userId,
        },
        data: { name: trimmedName },
      });

      logger.info("Account name updated", {
        accountId: id,
        userId,
        newName: trimmedName,
      });
      return account;
    } catch (error) {
      logger.error("Failed to update account name", {
        accountId,
        userId,
        name,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete an account (hard delete)
   * @param {string|number} accountId - Account ID
   * @param {string|number} userId - User ID for authorization
   * @returns {Promise<Object>} Deleted account object
   */
  async deleteAccount(accountId, userId) {
    try {
      const id = parseInt(accountId);
      if (isNaN(id)) {
        throw new Error("Invalid account ID");
      }

      // Check if account exists and belongs to user
      const account = await this.getAccount(accountId, userId);

      if (!account) {
        logger.warn("Account not found for deletion", { accountId, userId });
        throw new Error("Account not found");
      }

      // Prevent deletion if account has transactions to maintain data integrity
      if (account.transactions && account.transactions.length > 0) {
        logger.warn("Attempted to delete account with transactions", {
          accountId: id,
          transactionCount: account.transactions.length,
        });
        throw new Error("Cannot delete account with existing transactions");
      }

      const deletedAccount = await this.prisma.account.delete({
        where: {
          id,
          userId,
        },
      });

      logger.info("Account deleted successfully", { accountId: id, userId });
      return deletedAccount;
    } catch (error) {
      logger.error("Failed to delete account", {
        accountId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get account summary including recent transactions and monthly stats
   * @param {string|number} accountId - Account ID
   * @param {string|number} userId - User ID for authorization
   * @returns {Promise<Object>} Account summary object
   */
  async getAccountSummary(accountId, userId) {
    try {
      const account = await this.getAccount(accountId, userId);

      if (!account) {
        throw new Error("Account not found");
      }

      const transactions = account.transactions || [];
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      // Filter transactions from last 30 days
      const recentTransactions = transactions.filter(
        (tx) => new Date(tx.date) >= thirtyDaysAgo
      );

      // Calculate income from recent transactions
      const income = recentTransactions
        .filter((tx) => tx.type === "income")
        .reduce((sum, tx) => sum + tx.amount, 0);

      // Calculate expenses (using absolute value for consistency)
      const expenses = recentTransactions
        .filter((tx) => tx.type === "expense")
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const netFlow = income - expenses;

      // Calculate average transaction amount (excluding sign for meaningful average)
      const averageTransaction =
        transactions.length > 0
          ? transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) /
            transactions.length
          : 0;

      const summary = {
        account: {
          id: account.id,
          name: account.name,
          balance: account.balance,
          createdAt: account.createdAt,
        },
        summary: {
          totalTransactions: transactions.length,
          recentTransactionCount: recentTransactions.length,
          monthlyIncome: income,
          monthlyExpenses: expenses,
          netFlow,
          averageTransaction,
        },
        recentTransactions: recentTransactions.slice(0, 5),
      };

      logger.debug("Generated account summary", { accountId, userId });
      return summary;
    } catch (error) {
      logger.error("Failed to get account summary", {
        accountId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get summary for all user accounts
   * @param {string|number} userId - User ID
   * @returns {Promise<Object>} Consolidated accounts summary
   */
  async getAllAccountsSummary(userId) {
    try {
      const accounts = await this.getUserAccounts(userId, false);

      const summaries = await Promise.all(
        accounts.map(async (account) => {
          const summary = await this.getAccountSummary(account.id, userId);
          return {
            accountId: account.id,
            accountName: account.name,
            balance: account.balance,
            ...summary.summary,
          };
        })
      );

      const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
      const totalIncome = summaries.reduce(
        (sum, s) => sum + s.monthlyIncome,
        0
      );
      const totalExpenses = summaries.reduce(
        (sum, s) => sum + s.monthlyExpenses,
        0
      );

      const consolidatedSummary = {
        totalAccounts: accounts.length,
        totalBalance,
        totalMonthlyIncome: totalIncome,
        totalMonthlyExpenses: totalExpenses,
        netMonthlyFlow: totalIncome - totalExpenses,
        accounts: summaries,
      };

      logger.info("Generated all accounts summary", {
        userId,
        accountCount: accounts.length,
      });
      return consolidatedSummary;
    } catch (error) {
      logger.error("Failed to get all accounts summary", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Transfer funds between accounts belonging to the same user
   * @param {string|number} fromAccountId - Source account ID
   * @param {string|number} toAccountId - Destination account ID
   * @param {number|string} amount - Transfer amount
   * @param {string|number} userId - User ID for authorization
   * @param {string} [description="Account Transfer"] - Transfer description
   * @returns {Promise<Object>} Transfer result with updated accounts and transactions
   */
  async transferBetweenAccounts(
    fromAccountId,
    toAccountId,
    amount,
    userId,
    description = "Account Transfer"
  ) {
    try {
      const fromId = parseInt(fromAccountId);
      const toId = parseInt(toAccountId);
      const amountNum = parseFloat(amount);

      // Input validation
      if (isNaN(fromId) || isNaN(toId) || isNaN(amountNum)) {
        throw new Error("Invalid account IDs or amount");
      }

      if (fromId === toId) {
        throw new Error("Cannot transfer to the same account");
      }

      if (amountNum <= 0) {
        throw new Error("Transfer amount must be positive");
      }

      logger.info("Initiating account transfer", {
        fromId,
        toId,
        amount: amountNum,
        userId,
      });

      // Use Prisma transaction to ensure data consistency
      const result = await this.prisma.$transaction(async (prisma) => {
        // Verify both accounts exist and belong to the user
        const [fromAccount, toAccount] = await Promise.all([
          prisma.account.findFirst({
            where: { id: fromId, userId },
          }),
          prisma.account.findFirst({
            where: { id: toId, userId },
          }),
        ]);

        if (!fromAccount || !toAccount) {
          logger.warn("Account not found for transfer", {
            fromId,
            toId,
            userId,
          });
          throw new Error("One or both accounts not found");
        }

        if (fromAccount.balance < amountNum) {
          logger.warn("Insufficient funds for transfer", {
            fromId,
            currentBalance: fromAccount.balance,
            transferAmount: amountNum,
          });
          throw new Error("Insufficient funds in source account");
        }

        // Update source account (decrease balance)
        const updatedFromAccount = await prisma.account.update({
          where: { id: fromId },
          data: { balance: fromAccount.balance - amountNum },
        });

        // Update destination account (increase balance)
        const updatedToAccount = await prisma.account.update({
          where: { id: toId },
          data: { balance: toAccount.balance + amountNum },
        });

        // Create transaction records for audit trail
        const [fromTransaction, toTransaction] = await Promise.all([
          prisma.transaction.create({
            data: {
              accountId: fromId,
              amount: -amountNum,
              type: "expense",
              category: "Transfer",
              date: new Date(),
              description: `${description} → ${toAccount.name}`,
              flagged: false,
              riskScore: 0,
            },
          }),
          prisma.transaction.create({
            data: {
              accountId: toId,
              amount: amountNum,
              type: "income",
              category: "Transfer",
              date: new Date(),
              description: `${description} ← ${fromAccount.name}`,
              flagged: false,
              riskScore: 0,
            },
          }),
        ]);

        return {
          fromAccount: updatedFromAccount,
          toAccount: updatedToAccount,
          fromTransaction,
          toTransaction,
          amount: amountNum,
        };
      });

      logger.info("Account transfer completed successfully", {
        fromId,
        toId,
        amount: amountNum,
        newFromBalance: result.fromAccount.balance,
        newToBalance: result.toAccount.balance,
      });

      return result;
    } catch (error) {
      logger.error("Account transfer failed", {
        fromAccountId,
        toAccountId,
        amount,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get account analytics for a specific timeframe
   * @param {string|number} accountId - Account ID
   * @param {string|number} userId - User ID for authorization
   * @param {string} [timeframe='monthly'] - Timeframe for analytics
   * @returns {Promise<Object>} Account analytics object
   */
  async getAccountAnalytics(accountId, userId, timeframe = "monthly") {
    try {
      const id = parseInt(accountId);
      if (isNaN(id)) {
        throw new Error("Invalid account ID");
      }

      const account = await this.getAccount(accountId, userId);

      if (!account) {
        throw new Error("Account not found");
      }

      const now = new Date();
      let startDate = new Date();

      // Calculate start date based on timeframe
      switch (timeframe) {
        case "daily":
          startDate.setDate(now.getDate() - 1);
          break;
        case "weekly":
          startDate.setDate(now.getDate() - 7);
          break;
        case "monthly":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "yearly":
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(now.getMonth() - 1); // Default to monthly
      }

      // Fetch transactions within the timeframe
      const transactions = await this.prisma.transaction.findMany({
        where: {
          accountId: id,
          date: {
            gte: startDate,
            lte: now,
          },
        },
        orderBy: { date: "asc" },
      });

      const analysis = {
        timeframe,
        startDate,
        endDate: now,
        transactionCount: transactions.length,
        byCategory: {},
        byType: { income: 0, expense: 0 },
        dailyBalances: [],
        trends: {},
      };

      // Group transactions by date for daily analysis
      const dailyData = {};
      transactions.forEach((tx) => {
        const dateStr = tx.date.toISOString().split("T")[0];

        // Initialize daily data object if not exists
        if (!dailyData[dateStr]) {
          dailyData[dateStr] = { income: 0, expense: 0 };
        }

        // Aggregate by type
        if (tx.type === "income") {
          dailyData[dateStr].income += tx.amount;
          analysis.byType.income++;
        } else {
          dailyData[dateStr].expense += Math.abs(tx.amount);
          analysis.byType.expense++;
        }

        // Aggregate by category
        if (!analysis.byCategory[tx.category]) {
          analysis.byCategory[tx.category] = {
            total: 0,
            count: 0,
            type: tx.type,
          };
        }
        analysis.byCategory[tx.category].total += Math.abs(tx.amount);
        analysis.byCategory[tx.category].count++;
      });

      // Convert daily data to sorted array
      analysis.dailyBalances = Object.entries(dailyData)
        .map(([date, data]) => ({
          date,
          income: data.income,
          expense: data.expense,
          net: data.income - data.expense,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate trends if sufficient data exists
      if (analysis.dailyBalances.length > 1) {
        const first = analysis.dailyBalances[0];
        const last = analysis.dailyBalances[analysis.dailyBalances.length - 1];

        analysis.trends = {
          incomeTrend:
            last.income > first.income
              ? "up"
              : last.income < first.income
              ? "down"
              : "stable",
          expenseTrend:
            last.expense > first.expense
              ? "up"
              : last.expense < first.expense
              ? "down"
              : "stable",
          netTrend:
            last.net > first.net
              ? "up"
              : last.net < first.net
              ? "down"
              : "stable",
        };
      }

      logger.debug("Generated account analytics", {
        accountId: id,
        userId,
        timeframe,
      });
      return analysis;
    } catch (error) {
      logger.error("Failed to get account analytics", {
        accountId,
        userId,
        timeframe,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cleanup Prisma client connection
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      logger.debug("Prisma client disconnected");
    } catch (error) {
      logger.error("Failed to cleanup Prisma client", { error: error.message });
      throw error;
    }
  }
}
