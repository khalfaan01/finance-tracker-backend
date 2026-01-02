// debtService.js
// Service for debt management, payment scheduling, and payoff strategy analysis

import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * Service class for debt management including payment processing, payoff strategies, and analytics
 * Handles debt tracking, payment scheduling, and optimization strategies
 */
export class DebtService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all debts for a user with optional metrics calculation
   * @param {string|number} userId - User identifier
   * @param {boolean} [includeMetrics=true] - Include calculated metrics
   * @returns {Promise<Array>} List of debts with metrics
   */
  async getUserDebts(userId, includeMetrics = true) {
    try {
      const debts = await this.prisma.debt.findMany({
        where: { userId },
        orderBy: { dueDate: "asc" },
      });

      if (includeMetrics) {
        const debtsWithMetrics = debts.map((debt) => ({
          ...debt,
          ...this.calculateDebtMetrics(debt),
        }));

        logger.debug("User debts retrieved with metrics", {
          userId,
          debtCount: debts.length,
          includeMetrics,
        });
        return debtsWithMetrics;
      }

      logger.debug("User debts retrieved without metrics", {
        userId,
        debtCount: debts.length,
      });
      return debts;
    } catch (error) {
      logger.error("Failed to get user debts", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get single debt with calculated metrics
   * @param {string|number} id - Debt ID
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Debt with metrics
   */
  async getDebt(id, userId) {
    try {
      const debtId = parseInt(id);
      if (isNaN(debtId)) {
        throw new Error("Invalid debt ID");
      }

      const debt = await this.prisma.debt.findFirst({
        where: {
          id: debtId,
          userId,
        },
      });

      if (!debt) {
        logger.warn("Debt not found", { debtId, userId });
        throw new Error("Debt not found");
      }

      const debtWithMetrics = {
        ...debt,
        ...this.calculateDebtMetrics(debt),
      };

      logger.debug("Debt retrieved with metrics", { debtId, userId });
      return debtWithMetrics;
    } catch (error) {
      logger.error("Failed to get debt", {
        debtId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create new debt entry
   * @param {Object} data - Debt data
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Created debt with metrics
   */
  async createDebt(data, userId) {
    try {
      // Validate required numeric fields
      const principal = parseFloat(data.principal);
      const balance = parseFloat(data.balance);
      const interestRate = parseFloat(data.interestRate);
      const minimumPayment = parseFloat(data.minimumPayment);

      if (
        isNaN(principal) ||
        isNaN(balance) ||
        isNaN(interestRate) ||
        isNaN(minimumPayment)
      ) {
        logger.warn("Invalid numeric values in debt creation", {
          userId,
          principal: data.principal,
          balance: data.balance,
          interestRate: data.interestRate,
          minimumPayment: data.minimumPayment,
        });
        throw new Error(
          "Invalid debt data: numeric fields must be valid numbers"
        );
      }

      const debt = await this.prisma.debt.create({
        data: {
          userId,
          name: data.name,
          type: data.type,
          principal,
          balance,
          interestRate,
          minimumPayment,
          startDate: new Date(data.startDate),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          termMonths: data.termMonths ? parseInt(data.termMonths) : null,
          lender: data.lender,
          accountNumber: data.accountNumber,
          notes: data.notes,
        },
      });

      const debtWithMetrics = {
        ...debt,
        ...this.calculateDebtMetrics(debt),
      };

      logger.info("Debt created successfully", {
        userId,
        debtId: debt.id,
        name: debt.name,
        balance: debt.balance,
      });

      return debtWithMetrics;
    } catch (error) {
      logger.error("Failed to create debt", { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update existing debt
   * @param {string|number} id - Debt ID
   * @param {Object} data - Update data
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Updated debt with metrics
   */
  async updateDebt(id, data, userId) {
    try {
      const debtId = parseInt(id);
      if (isNaN(debtId)) {
        throw new Error("Invalid debt ID");
      }

      // Verify debt belongs to user before updating
      const existingDebt = await this.prisma.debt.findFirst({
        where: {
          id: debtId,
          userId,
        },
      });

      if (!existingDebt) {
        logger.warn("Debt not found for update", { debtId, userId });
        throw new Error("Debt not found");
      }

      const updateData = {};

      // Build update object with only provided fields
      if (data.name !== undefined) updateData.name = data.name;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.principal !== undefined) {
        const principal = parseFloat(data.principal);
        if (isNaN(principal)) throw new Error("Invalid principal amount");
        updateData.principal = principal;
      }
      if (data.balance !== undefined) {
        const balance = parseFloat(data.balance);
        if (isNaN(balance)) throw new Error("Invalid balance amount");
        updateData.balance = balance;
      }
      if (data.interestRate !== undefined) {
        const interestRate = parseFloat(data.interestRate);
        if (isNaN(interestRate)) throw new Error("Invalid interest rate");
        updateData.interestRate = interestRate;
      }
      if (data.minimumPayment !== undefined) {
        const minimumPayment = parseFloat(data.minimumPayment);
        if (isNaN(minimumPayment)) throw new Error("Invalid minimum payment");
        updateData.minimumPayment = minimumPayment;
      }
      if (data.dueDate !== undefined)
        updateData.dueDate = new Date(data.dueDate);
      if (data.termMonths !== undefined)
        updateData.termMonths = parseInt(data.termMonths);
      if (data.lender !== undefined) updateData.lender = data.lender;
      if (data.accountNumber !== undefined)
        updateData.accountNumber = data.accountNumber;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const debt = await this.prisma.debt.update({
        where: { id: debtId },
        data: updateData,
      });

      const debtWithMetrics = {
        ...debt,
        ...this.calculateDebtMetrics(debt),
      };

      logger.info("Debt updated successfully", {
        userId,
        debtId,
        updatedFields: Object.keys(updateData),
      });

      return debtWithMetrics;
    } catch (error) {
      logger.error("Failed to update debt", {
        debtId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a debt
   * @param {string|number} id - Debt ID
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Deleted debt
   */
  async deleteDebt(id, userId) {
    try {
      const debtId = parseInt(id);
      if (isNaN(debtId)) {
        throw new Error("Invalid debt ID");
      }

      // Verify debt belongs to user before deleting
      const existingDebt = await this.prisma.debt.findFirst({
        where: {
          id: debtId,
          userId,
        },
      });

      if (!existingDebt) {
        logger.warn("Debt not found for deletion", { debtId, userId });
        throw new Error("Debt not found");
      }

      const deletedDebt = await this.prisma.debt.delete({
        where: { id: debtId },
      });

      logger.info("Debt deleted successfully", { userId, debtId });
      return deletedDebt;
    } catch (error) {
      logger.error("Failed to delete debt", {
        debtId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Make payment on debt with transaction creation
   * @param {string|number} debtId - Debt ID
   * @param {number} amount - Payment amount
   * @param {string} paymentDate - Payment date
   * @param {string|number} accountId - Account ID for payment
   * @param {string|number} userId - User identifier
   * @param {string} description - Payment description
   * @returns {Promise<Object>} Payment result with updated debt
   */
  async makePayment(
    debtId,
    amount,
    paymentDate,
    accountId,
    userId,
    description
  ) {
    try {
      const id = parseInt(debtId);
      const accountIdNum = parseInt(accountId);
      const paymentAmount = parseFloat(amount);

      if (
        isNaN(id) ||
        isNaN(accountIdNum) ||
        isNaN(paymentAmount) ||
        paymentAmount <= 0
      ) {
        logger.warn("Invalid payment parameters", {
          debtId,
          accountId,
          amount,
          userId,
        });
        throw new Error("Invalid payment parameters");
      }

      const existingDebt = await this.prisma.debt.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!existingDebt) {
        logger.warn("Debt not found for payment", { debtId: id, userId });
        throw new Error("Debt not found");
      }

      // Start a transaction to ensure data consistency across updates
      const result = await this.prisma.$transaction(async (prisma) => {
        // Calculate new balance (minimum of 0)
        const newBalance = Math.max(0, existingDebt.balance - paymentAmount);

        // Calculate next due date (30 days from payment date)
        const nextDueDate = new Date(paymentDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);

        // Update debt record
        const debt = await prisma.debt.update({
          where: { id },
          data: {
            balance: newBalance,
            dueDate: nextDueDate,
            paymentsMade: existingDebt.paymentsMade + 1,
            isActive: newBalance > 0, // Mark inactive if fully paid
          },
        });

        // Create transaction record for payment tracking
        const transaction = await prisma.transaction.create({
          data: {
            accountId: accountIdNum,
            amount: -paymentAmount, // Negative amount for expense
            type: "expense",
            category: "Debt Payment",
            date: new Date(paymentDate),
            description: description || `Payment for ${existingDebt.name}`,
            flagged: false,
            riskScore: 0,
            reviewed: true,
          },
        });

        // Update account balance (decrement by payment amount)
        await prisma.account.update({
          where: { id: accountIdNum },
          data: {
            balance: {
              decrement: paymentAmount,
            },
          },
        });

        return { debt, transaction };
      });

      const paymentResult = {
        ...result.debt,
        ...this.calculateDebtMetrics(result.debt),
        paymentApplied: paymentAmount,
        newBalance: Math.max(0, existingDebt.balance - paymentAmount),
        transactionCreated: result.transaction,
      };

      logger.info("Debt payment processed successfully", {
        userId,
        debtId: id,
        amount: paymentAmount,
        newBalance: paymentResult.newBalance,
      });

      return paymentResult;
    } catch (error) {
      logger.error("Failed to process debt payment", {
        debtId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate comprehensive metrics for a debt
   * @param {Object} debt - Debt object
   * @returns {Object} Calculated debt metrics
   */
  calculateDebtMetrics(debt) {
    const monthlyInterestRate = debt.interestRate / 100 / 12;
    const remainingBalance = debt.balance;

    // Calculate estimated payoff time using amortization formula
    let estimatedPayoffMonths = null;
    let totalInterest = 0;

    if (debt.minimumPayment > 0 && monthlyInterestRate > 0) {
      // Use standard amortization formula: n = log(P/(P - r*B)) / log(1 + r)
      // where P = payment, r = monthly interest rate, B = balance
      const numerator =
        debt.minimumPayment /
        (debt.minimumPayment - remainingBalance * monthlyInterestRate);
      estimatedPayoffMonths = Math.ceil(
        Math.log(numerator) / Math.log(1 + monthlyInterestRate)
      );

      // Calculate total interest: (monthly payment * months) - principal
      totalInterest = Math.max(
        0,
        debt.minimumPayment * estimatedPayoffMonths - remainingBalance
      );
    }

    // Calculate progress percentage based on original principal
    const progressPercentage =
      debt.principal > 0
        ? ((debt.principal - remainingBalance) / debt.principal) * 100
        : 0;

    // Calculate total paid so far
    const totalPaid = debt.principal - remainingBalance;

    return {
      estimatedPayoffMonths,
      totalInterest,
      progressPercentage: Math.min(100, Math.max(0, progressPercentage)),
      monthlyInterest: remainingBalance * monthlyInterestRate,
      totalPaid,
      // Check if minimum payment covers at least the monthly interest
      isOnTrack: debt.minimumPayment > remainingBalance * monthlyInterestRate,
      dailyInterest: remainingBalance * (debt.interestRate / 100 / 365),
    };
  }

  /**
   * Get comprehensive debt summary and analytics
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Debt summary with strategies
   */
  async getDebtSummary(userId) {
    try {
      const debts = await this.prisma.debt.findMany({
        where: {
          userId,
          isActive: true,
        },
      });

      const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
      const totalMinimumPayments = debts.reduce(
        (sum, debt) => sum + debt.minimumPayment,
        0
      );
      const totalInterest = debts.reduce((sum, debt) => {
        const monthlyInterest = debt.balance * (debt.interestRate / 100 / 12);
        return sum + monthlyInterest;
      }, 0);

      // Group debts by type for analysis
      const debtByType = debts.reduce((acc, debt) => {
        acc[debt.type] = (acc[debt.type] || 0) + debt.balance;
        return acc;
      }, {});

      // Calculate payoff strategies
      const snowballOrder = [...debts].sort((a, b) => a.balance - b.balance);
      const avalancheOrder = [...debts].sort(
        (a, b) => b.interestRate - a.interestRate
      );

      // Calculate payoff timelines for each strategy
      const snowballTimeline = this.calculatePayoffTimeline(
        snowballOrder,
        "snowball"
      );
      const avalancheTimeline = this.calculatePayoffTimeline(
        avalancheOrder,
        "avalanche"
      );

      const summary = {
        totalDebt,
        totalMinimumPayments,
        totalMonthlyInterest: totalInterest,
        debtCount: debts.length,
        debtByType,
        highestInterestDebt:
          debts.length > 0
            ? debts.reduce((max, debt) =>
                debt.interestRate > max.interestRate ? debt : max
              )
            : null,
        snowballOrder,
        avalancheOrder,
        snowballTimeline,
        avalancheTimeline,
        // Suggest strategy with lower total interest
        suggestedStrategy:
          avalancheTimeline.totalInterest < snowballTimeline.totalInterest
            ? "avalanche"
            : "snowball",
      };

      logger.debug("Debt summary generated", {
        userId,
        debtCount: debts.length,
        totalDebt,
        suggestedStrategy: summary.suggestedStrategy,
      });

      return summary;
    } catch (error) {
      logger.error("Failed to get debt summary", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate payoff timeline for a specific strategy
   * @param {Array} debtsOrder - Debts ordered by strategy
   * @param {string} strategy - Payoff strategy ('snowball' or 'avalanche')
   * @returns {Object} Payoff timeline calculation
   */
  calculatePayoffTimeline(debtsOrder, strategy) {
    // Create working copy with remaining balance property
    let remainingDebts = debtsOrder.map((debt) => ({
      ...debt,
      remainingBalance: debt.balance,
    }));

    const monthlyBudget = 500; // Assume $500/month extra for debt payoff
    let timeline = [];
    let totalMonths = 0;
    let totalInterest = 0;
    let currentMonth = 0;

    while (remainingDebts.length > 0) {
      currentMonth++;
      let monthlyPayment = monthlyBudget;

      // Apply minimum payments to all debts first
      remainingDebts.forEach((debt) => {
        const minPayment = Math.min(debt.minimumPayment, debt.remainingBalance);
        const interest = debt.remainingBalance * (debt.interestRate / 100 / 12);

        debt.remainingBalance = debt.remainingBalance + interest - minPayment;
        monthlyPayment -= minPayment;
        totalInterest += interest;
      });

      // Apply extra payment based on strategy
      if (strategy === "snowball") {
        // Snowball: Pay extra on smallest balance first
        const smallestDebt = remainingDebts[0];
        if (smallestDebt && monthlyPayment > 0) {
          const extraPayment = Math.min(
            monthlyPayment,
            smallestDebt.remainingBalance
          );
          smallestDebt.remainingBalance -= extraPayment;
          monthlyPayment -= extraPayment;
        }
      } else if (strategy === "avalanche") {
        // Avalanche: Pay extra on highest interest first
        const highestInterestDebt = [...remainingDebts].sort(
          (a, b) => b.interestRate - a.interestRate
        )[0];
        if (highestInterestDebt && monthlyPayment > 0) {
          const extraPayment = Math.min(
            monthlyPayment,
            highestInterestDebt.remainingBalance
          );
          highestInterestDebt.remainingBalance -= extraPayment;
          monthlyPayment -= extraPayment;
        }
      }

      // Remove fully paid debts
      remainingDebts = remainingDebts.filter(
        (debt) => debt.remainingBalance > 0
      );

      if (remainingDebts.length === 0) {
        totalMonths = currentMonth;
        timeline.push({
          month: currentMonth,
          remainingDebts: 0,
          totalRemaining: 0,
          totalInterestPaid: totalInterest,
        });
        break;
      }
    }

    return {
      totalMonths,
      totalInterest,
      estimatedPayoffDate: this.calculateFutureDate(totalMonths),
      monthlyPaymentRequired: monthlyBudget,
      timeline,
    };
  }

  /**
   * Calculate future date based on months from now
   * @param {number} monthsFromNow - Number of months to add
   * @returns {Date} Future date
   */
  calculateFutureDate(monthsFromNow) {
    const date = new Date();
    date.setMonth(date.getMonth() + monthsFromNow);
    return date;
  }

  /**
   * Generate detailed payment schedule for a debt
   * @param {string|number} debtId - Debt ID
   * @param {string|number} userId - User identifier
   * @param {number} [extraPayment=0] - Additional monthly payment
   * @returns {Promise<Object>} Payment schedule with summary
   */
  async getPaymentSchedule(debtId, userId, extraPayment = 0) {
    try {
      const id = parseInt(debtId);
      if (isNaN(id)) {
        throw new Error("Invalid debt ID");
      }

      const debt = await this.getDebt(id, userId);

      const schedule = [];
      let remainingBalance = debt.balance;
      let totalInterest = 0;
      let month = 0;
      const monthlyInterestRate = debt.interestRate / 100 / 12;

      // Generate schedule up to 360 months (30 years) maximum
      while (remainingBalance > 0 && month < 360) {
        month++;
        const interest = remainingBalance * monthlyInterestRate;
        // Principal payment = total payment - interest
        const principalPayment = Math.min(
          debt.minimumPayment + extraPayment - interest,
          remainingBalance
        );

        totalInterest += interest;
        remainingBalance -= principalPayment;

        schedule.push({
          month,
          paymentNumber: month,
          paymentDate: this.calculateFutureDate(month),
          interest,
          principal: principalPayment,
          totalPayment: debt.minimumPayment + extraPayment,
          remainingBalance: Math.max(0, remainingBalance),
          cumulativeInterest: totalInterest,
        });

        if (remainingBalance <= 0) break;
      }

      const result = {
        debt,
        schedule,
        summary: {
          totalMonths: month,
          totalInterest,
          totalPaid: debt.balance + totalInterest,
          moneySaved:
            extraPayment > 0 ? this.calculateSavings(debt, extraPayment) : 0,
        },
      };

      logger.debug("Payment schedule generated", {
        debtId: id,
        userId,
        scheduleLength: month,
        extraPayment,
      });

      return result;
    } catch (error) {
      logger.error("Failed to generate payment schedule", {
        debtId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate savings from extra payments
   * @param {Object} debt - Debt object
   * @param {number} extraPayment - Additional monthly payment
   * @returns {Object} Savings calculation
   */
  calculateSavings(debt, extraPayment) {
    const monthlyInterestRate = debt.interestRate / 100 / 12;

    // Calculate months to pay off with minimum payment only
    const minNumerator =
      debt.minimumPayment /
      (debt.minimumPayment - debt.balance * monthlyInterestRate);
    const minMonths = Math.ceil(
      Math.log(minNumerator) / Math.log(1 + monthlyInterestRate)
    );
    const minTotalInterest = debt.minimumPayment * minMonths - debt.balance;

    // Calculate months to pay off with extra payment
    const extraNumerator =
      (debt.minimumPayment + extraPayment) /
      (debt.minimumPayment + extraPayment - debt.balance * monthlyInterestRate);
    const extraMonths = Math.ceil(
      Math.log(extraNumerator) / Math.log(1 + monthlyInterestRate)
    );
    const extraTotalInterest =
      (debt.minimumPayment + extraPayment) * extraMonths - debt.balance;

    return {
      monthsSaved: minMonths - extraMonths,
      interestSaved: minTotalInterest - extraTotalInterest,
      extraPayment,
      payoffTimeReduction: ((minMonths - extraMonths) / minMonths) * 100,
    };
  }

  /**
   * Cleanup database connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      logger.debug("DebtService cleanup completed");
    } catch (error) {
      logger.error("DebtService cleanup failed", { error: error.message });
      throw error;
    }
  }
}
