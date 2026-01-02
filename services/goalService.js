// goalService.js
// Service for financial goal management, optimization, and allocation strategies

import { PrismaClient } from "@prisma/client";
import logger from "../logger.js";

/**
 * Service class for financial goal management with optimization and allocation strategies
 * Handles goal tracking, smart allocation, progress analytics, and optimization recommendations
 */
export class GoalService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Get all goals for a user
   * @param {string|number} userId - User identifier
   * @returns {Promise<Array>} List of user goals sorted by deadline
   */
  async getUserGoals(userId) {
    try {
      const goals = await this.prisma.financialGoal.findMany({
        where: { userId },
        orderBy: { deadline: "asc" },
      });

      logger.debug("User goals retrieved", { userId, goalCount: goals.length });
      return goals;
    } catch (error) {
      logger.error("Failed to get user goals", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get single goal by ID with user authorization
   * @param {string|number} id - Goal ID
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Goal object
   */
  async getGoal(id, userId) {
    try {
      const goalId = parseInt(id);
      if (isNaN(goalId)) {
        throw new Error("Invalid goal ID");
      }

      const goal = await this.prisma.financialGoal.findFirst({
        where: {
          id: goalId,
          userId,
        },
      });

      if (!goal) {
        logger.warn("Goal not found", { goalId, userId });
        return null;
      }

      logger.debug("Goal retrieved", { goalId, userId });
      return goal;
    } catch (error) {
      logger.error("Failed to get goal", {
        goalId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create new financial goal
   * @param {Object} data - Goal creation data
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Created goal
   */
  async createGoal(data, userId) {
    try {
      const currentAmount = data.currentAmount
        ? parseFloat(data.currentAmount)
        : 0;
      const targetAmount = parseFloat(data.targetAmount);

      if (isNaN(targetAmount) || targetAmount <= 0) {
        logger.warn("Invalid target amount for goal creation", {
          userId,
          targetAmount: data.targetAmount,
        });
        throw new Error("Invalid target amount");
      }

      // Validate deadline is in the future
      const deadline = new Date(data.deadline);
      if (deadline <= new Date()) {
        logger.warn("Goal deadline is not in the future", { userId, deadline });
        throw new Error("Goal deadline must be in the future");
      }

      const goal = await this.prisma.financialGoal.create({
        data: {
          userId,
          name: data.name,
          targetAmount,
          currentAmount,
          deadline,
          category: data.category || "savings",
          importance: data.importance ? parseInt(data.importance) : 3,
          allocationPercentage: data.allocationPercentage
            ? parseFloat(data.allocationPercentage)
            : null,
          isCompleted: currentAmount >= targetAmount,
        },
      });

      logger.info("Goal created successfully", {
        userId,
        goalId: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
      });

      return goal;
    } catch (error) {
      logger.error("Failed to create goal", { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update existing goal with progress tracking
   * @param {string|number} id - Goal ID
   * @param {Object} data - Update data
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Updated goal
   */
  async updateGoal(id, data, userId) {
    try {
      const goalId = parseInt(id);
      if (isNaN(goalId)) {
        throw new Error("Invalid goal ID");
      }

      const currentGoal = await this.getGoal(goalId, userId);
      if (!currentGoal) {
        logger.warn("Goal not found for update", { goalId, userId });
        throw new Error("Goal not found");
      }

      // Parse numeric values with fallbacks
      const currentAmountNum =
        data.currentAmount !== undefined
          ? parseFloat(data.currentAmount)
          : currentGoal.currentAmount;
      const targetAmountNum =
        data.targetAmount !== undefined
          ? parseFloat(data.targetAmount)
          : currentGoal.targetAmount;

      if (isNaN(currentAmountNum) || isNaN(targetAmountNum)) {
        throw new Error("Invalid numeric values for goal update");
      }

      // Determine if goal is now completed
      const isCompleted = currentAmountNum >= targetAmountNum;

      const updateData = {
        name: data.name !== undefined ? data.name : currentGoal.name,
        targetAmount: targetAmountNum,
        currentAmount: currentAmountNum,
        deadline:
          data.deadline !== undefined
            ? new Date(data.deadline)
            : currentGoal.deadline,
        category:
          data.category !== undefined ? data.category : currentGoal.category,
        importance:
          data.importance !== undefined
            ? parseInt(data.importance)
            : currentGoal.importance,
        allocationPercentage:
          data.allocationPercentage !== undefined
            ? data.allocationPercentage
              ? parseFloat(data.allocationPercentage)
              : null
            : currentGoal.allocationPercentage,
        isActive:
          data.isActive !== undefined ? data.isActive : currentGoal.isActive,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      };

      const updatedGoal = await this.prisma.financialGoal.update({
        where: {
          id: goalId,
          userId,
        },
        data: updateData,
      });

      logger.info("Goal updated successfully", {
        userId,
        goalId,
        updatedFields: Object.keys(data),
        isCompleted,
      });

      return updatedGoal;
    } catch (error) {
      logger.error("Failed to update goal", {
        goalId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete a goal
   * @param {string|number} id - Goal ID
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Deleted goal
   */
  async deleteGoal(id, userId) {
    try {
      const goalId = parseInt(id);
      if (isNaN(goalId)) {
        throw new Error("Invalid goal ID");
      }

      const deletedGoal = await this.prisma.financialGoal.delete({
        where: {
          id: goalId,
          userId,
        },
      });

      logger.info("Goal deleted successfully", { userId, goalId });
      return deletedGoal;
    } catch (error) {
      logger.error("Failed to delete goal", {
        goalId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  // GOAL OPTIMIZATION METHODS

  /**
   * Optimize fund allocation across multiple goals using different strategies
   * @param {Array} goals - List of goal objects
   * @param {number} availableFunds - Available funds for allocation
   * @param {string} [strategy='balanced'] - Allocation strategy
   * @returns {Object} Allocation recommendations
   */
  optimizeGoalAllocation(goals, availableFunds, strategy = "balanced") {
    try {
      const activeGoals = goals.filter(
        (goal) => goal.isActive && !goal.isCompleted
      );

      if (activeGoals.length === 0 || availableFunds <= 0) {
        logger.debug("No active goals or funds for allocation", {
          goalCount: goals.length,
          activeGoalCount: activeGoals.length,
          availableFunds,
        });
        return {
          allocations: [],
          remaining: availableFunds,
          strategyUsed: strategy,
        };
      }

      // Calculate scores for each goal based on selected strategy
      const goalsWithScores = activeGoals
        .map((goal) => ({
          ...goal,
          score: this.calculateGoalScore(goal, strategy),
        }))
        .sort((a, b) => b.score - a.score);

      let allocations = [];

      // Apply allocation strategy
      switch (strategy) {
        case "urgency":
          allocations = this.allocateByUrgency(goalsWithScores, availableFunds);
          break;
        case "balanced":
          allocations = this.allocateByBalance(goalsWithScores, availableFunds);
          break;
        case "proportional":
          allocations = this.allocateProportionally(
            goalsWithScores,
            availableFunds
          );
          break;
        case "priority":
          allocations = this.allocateByPriority(
            goalsWithScores,
            availableFunds
          );
          break;
        default:
          allocations = this.allocateByBalance(goalsWithScores, availableFunds);
      }

      // Calculate remaining funds
      const totalAllocated = allocations.reduce(
        (sum, alloc) => sum + alloc.amount,
        0
      );
      const remaining =
        Math.round((availableFunds - totalAllocated) * 100) / 100;

      logger.debug("Goal allocation optimized", {
        strategy,
        goalCount: activeGoals.length,
        allocatedAmount: totalAllocated,
        remaining,
      });

      return {
        allocations,
        remaining,
        strategyUsed: strategy,
        totalAllocated: Math.round(totalAllocated * 100) / 100,
      };
    } catch (error) {
      logger.error("Goal allocation optimization failed", {
        strategy,
        availableFunds,
        error: error.message,
      });

      return {
        allocations: [],
        remaining: availableFunds,
        strategyUsed: strategy,
        totalAllocated: 0,
      };
    }
  }

  /**
   * Calculate goal score based on strategy and goal characteristics
   * @param {Object} goal - Goal object
   * @param {string} [strategy='balanced'] - Scoring strategy
   * @returns {number} Goal score (0-100)
   */
  calculateGoalScore(goal, strategy = "balanced") {
    let score = 50; // Base score

    // Calculate time-based metrics
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24))
    );
    const progress = (goal.currentAmount / goal.targetAmount) * 100;
    const remainingAmount = goal.targetAmount - goal.currentAmount;
    const dailyNeed = remainingAmount / daysLeft;

    // Apply strategy-specific scoring rules
    switch (strategy) {
      case "urgency":
        // Focus on deadlines and daily needs
        if (daysLeft < 30) score += 40; // Very urgent
        else if (daysLeft < 90) score += 20; // Moderately urgent

        if (dailyNeed > 10) score += 15; // High daily funding need
        if (progress < 25) score += 10; // Low progress, needs attention
        break;

      case "balanced":
        // Balance between urgency and overall progress
        if (daysLeft < 60) score += 25;
        else if (daysLeft > 180) score -= 10; // Far deadline, less urgent

        if (progress < 50) score += 15;
        else if (progress > 75) score -= 10; // Good progress, less urgent

        // Apply priority multiplier
        const importanceMultiplier = {
          5: 1.5, // Very high importance
          4: 1.3, // High importance
          3: 1.0, // Medium importance
          2: 0.7, // Low importance
          1: 0.5, // Very low importance
        };
        score *= importanceMultiplier[goal.importance] || 1.0;
        break;

      case "proportional":
        // Focus on percentage of goal completed
        if (progress < 25) score += 20;
        else if (progress > 75) score -= 15;

        // Larger remaining amounts get higher scores
        score += (remainingAmount / 1000) * 5; // Scale by $1000 increments
        break;

      case "priority":
        // Use explicit priority and importance
        const priorityScores = { high: 30, medium: 15, low: 0 };
        score += priorityScores[goal.priority] || 0;
        score += (goal.importance - 3) * 10; // Scale importance (1-5 scale)
        break;
    }

    // Normalize score to 0-100 range
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Allocate funds based on urgency (closest deadlines first)
   * @param {Array} goals - Goals with calculated scores
   * @param {number} availableFunds - Available funds
   * @returns {Array} Allocation recommendations
   */
  allocateByUrgency(goals, availableFunds) {
    const allocations = [];
    let remaining = availableFunds;

    // Sort by days left (ascending) and then by daily need (descending)
    const urgentGoals = [...goals].sort((a, b) => {
      const daysLeftA = Math.ceil(
        (new Date(a.deadline) - new Date()) / (1000 * 60 * 60 * 24)
      );
      const daysLeftB = Math.ceil(
        (new Date(b.deadline) - new Date()) / (1000 * 60 * 60 * 24)
      );
      const dailyNeedA = (a.targetAmount - a.currentAmount) / daysLeftA;
      const dailyNeedB = (b.targetAmount - b.currentAmount) / daysLeftB;

      if (daysLeftA !== daysLeftB) return daysLeftA - daysLeftB;
      return dailyNeedB - dailyNeedA;
    });

    for (const goal of urgentGoals) {
      if (remaining <= 0) break;

      const needed = goal.targetAmount - goal.currentAmount;
      const daysLeft = Math.max(
        1,
        Math.ceil(
          (new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)
        )
      );
      // Allocate up to 30 days worth or what's needed, whichever is less
      const allocation = Math.min(needed, remaining, (needed / daysLeft) * 30);

      if (allocation > 0) {
        allocations.push({
          goalId: goal.id,
          goalName: goal.name,
          amount: Math.round(allocation * 100) / 100,
          reason: `Urgent: ${daysLeft} days left`,
          strategy: "urgency",
        });
        remaining -= allocation;
      }
    }

    return allocations;
  }

  /**
   * Allocate funds based on balanced scoring across all goals
   * @param {Array} goals - Goals with calculated scores
   * @param {number} availableFunds - Available funds
   * @returns {Array} Allocation recommendations
   */
  allocateByBalance(goals, availableFunds) {
    const allocations = [];
    const totalScore = goals.reduce((sum, goal) => sum + goal.score, 0);

    if (totalScore === 0) return allocations;

    goals.forEach((goal) => {
      const allocationRatio = goal.score / totalScore;
      const allocation = availableFunds * allocationRatio;
      const needed = goal.targetAmount - goal.currentAmount;

      if (allocation > 0 && needed > 0) {
        const actualAllocation = Math.min(allocation, needed);
        allocations.push({
          goalId: goal.id,
          goalName: goal.name,
          amount: Math.round(actualAllocation * 100) / 100,
          reason: `Balanced allocation based on priority score`,
          strategy: "balanced",
          score: goal.score,
        });
      }
    });

    return allocations;
  }

  /**
   * Allocate funds proportionally based on remaining amounts needed
   * @param {Array} goals - Goals with calculated scores
   * @param {number} availableFunds - Available funds
   * @returns {Array} Allocation recommendations
   */
  allocateProportionally(goals, availableFunds) {
    const allocations = [];
    const totalRemaining = goals.reduce(
      (sum, goal) => sum + (goal.targetAmount - goal.currentAmount),
      0
    );

    if (totalRemaining === 0) return allocations;

    goals.forEach((goal) => {
      const remaining = goal.targetAmount - goal.currentAmount;
      if (remaining > 0) {
        const proportion = remaining / totalRemaining;
        const allocation = availableFunds * proportion;

        allocations.push({
          goalId: goal.id,
          goalName: goal.name,
          amount: Math.round(allocation * 100) / 100,
          reason: `Proportional to remaining amount needed`,
          strategy: "proportional",
          proportion: Math.round(proportion * 100) + "%",
        });
      }
    });

    return allocations;
  }

  /**
   * Allocate funds based on explicit priority levels
   * @param {Array} goals - Goals with calculated scores
   * @param {number} availableFunds - Available funds
   * @returns {Array} Allocation recommendations
   */
  allocateByPriority(goals, availableFunds) {
    const allocations = [];
    let remaining = availableFunds;

    // Group goals by priority level
    const highPriority = goals.filter((g) => g.priority === "high");
    const mediumPriority = goals.filter((g) => g.priority === "medium");
    const lowPriority = goals.filter((g) => g.priority === "low");

    // Process groups in priority order
    for (const group of [highPriority, mediumPriority, lowPriority]) {
      if (remaining <= 0) break;

      const groupNeeded = group.reduce(
        (sum, goal) => sum + (goal.targetAmount - goal.currentAmount),
        0
      );
      const groupAllocation = Math.min(groupNeeded, remaining);

      if (groupAllocation > 0) {
        // Distribute within group proportionally to remaining needs
        group.forEach((goal) => {
          const needed = goal.targetAmount - goal.currentAmount;
          const proportion = needed / groupNeeded;
          const allocation = groupAllocation * proportion;

          if (allocation > 0) {
            allocations.push({
              goalId: goal.id,
              goalName: goal.name,
              amount: Math.round(allocation * 100) / 100,
              reason: `${goal.priority} priority goal`,
              strategy: "priority",
              priority: goal.priority,
            });
            remaining -= allocation;
          }
        });
      }
    }

    return allocations;
  }

  /**
   * Manual contribution to a specific goal with transaction creation
   * @param {string|number} id - Goal ID
   * @param {number} amount - Contribution amount
   * @param {string|number} userId - User identifier
   * @param {string} [description="Manual contribution"] - Contribution description
   * @returns {Promise<Object>} Contribution result with updated goal
   */
  async contributeToGoal(
    id,
    amount,
    userId,
    description = "Manual contribution"
  ) {
    try {
      const goalId = parseInt(id);
      const contributionAmount = parseFloat(amount);

      if (
        isNaN(goalId) ||
        isNaN(contributionAmount) ||
        contributionAmount <= 0
      ) {
        logger.warn("Invalid contribution parameters", {
          goalId: id,
          amount,
          userId,
        });
        throw new Error("Invalid contribution parameters");
      }

      // Find user's primary account for transaction
      const account = await this.prisma.account.findFirst({
        where: { userId },
      });

      if (!account) {
        logger.warn("No account found for goal contribution", { userId });
        throw new Error("No account found for user");
      }

      const goal = await this.getGoal(goalId, userId);
      if (!goal) {
        logger.warn("Goal not found for contribution", { goalId, userId });
        throw new Error("Goal not found");
      }

      // Calculate new amount and completion status
      const newAmount = goal.currentAmount + contributionAmount;
      const isCompleted = newAmount >= goal.targetAmount;

      // Update goal progress
      const updatedGoal = await this.prisma.financialGoal.update({
        where: {
          id: goalId,
          userId,
        },
        data: {
          currentAmount: newAmount,
          isCompleted,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      // Create transaction record for audit trail
      const transaction = await this.prisma.transaction.create({
        data: {
          accountId: account.id,
          amount: contributionAmount,
          type: "income",
          category: "Goal Contribution",
          date: new Date(),
          description: `${description} - ${goal.name}`,
        },
      });

      const result = {
        goal: updatedGoal,
        transaction,
        contribution: contributionAmount,
        previousAmount: goal.currentAmount,
        newAmount,
        isCompleted,
      };

      logger.info("Goal contribution processed", {
        userId,
        goalId,
        amount: contributionAmount,
        newAmount,
        isCompleted,
      });

      return result;
    } catch (error) {
      logger.error("Failed to contribute to goal", {
        goalId: id,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Smart allocation of funds across goals using optimization strategies
   * @param {string|number} userId - User identifier
   * @param {number} availableAmount - Available funds
   * @param {string} [strategy='balanced'] - Allocation strategy
   * @returns {Promise<Object>} Smart allocation results
   */
  async smartAllocateFunds(userId, availableAmount, strategy = "balanced") {
    try {
      if (availableAmount <= 0) {
        logger.warn("No available funds for smart allocation", {
          userId,
          availableAmount,
        });
        return {
          success: false,
          message: "No available funds to allocate",
          allocations: [],
        };
      }

      const goals = await this.getUserGoals(userId);

      if (goals.length === 0) {
        logger.info("No goals found for smart allocation", { userId });
        return {
          success: false,
          message: "No goals found to allocate to",
          allocations: [],
        };
      }

      // Get optimization recommendations
      const optimization = this.optimizeGoalAllocation(
        goals,
        availableAmount,
        strategy
      );

      // Apply allocations to goals
      const allocations = [];

      for (const allocation of optimization.allocations) {
        if (allocation.amount > 0) {
          try {
            const result = await this.contributeToGoal(
              allocation.goalId,
              allocation.amount,
              userId,
              `Smart allocation (${strategy} strategy)`
            );

            allocations.push({
              success: true,
              goalId: allocation.goalId,
              goalName: allocation.goalName,
              amount: allocation.amount,
              reason: allocation.reason,
              transactionId: result.transaction.id,
            });
          } catch (error) {
            logger.error("Failed to allocate to individual goal", {
              goalId: allocation.goalId,
              error: error.message,
            });
            allocations.push({
              success: false,
              goalId: allocation.goalId,
              goalName: allocation.goalName,
              amount: allocation.amount,
              error: error.message,
            });
          }
        }
      }

      const success = allocations.some((a) => a.success);
      const result = {
        success,
        strategyUsed: strategy,
        availableAmount,
        allocatedAmount: optimization.totalAllocated,
        remainingAmount: optimization.remaining,
        allocations,
        optimizationSummary: {
          totalGoals: goals.length,
          activeGoals: goals.filter((g) => g.isActive && !g.isCompleted).length,
          strategy: strategy,
        },
      };

      logger.info("Smart allocation completed", {
        userId,
        strategy,
        availableAmount,
        allocatedAmount: optimization.totalAllocated,
        success,
      });

      return result;
    } catch (error) {
      logger.error("Smart allocation failed", {
        userId,
        strategy,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Auto-allocate income to goals based on predefined percentages
   * @param {number} incomeAmount - Income amount to allocate
   * @param {string|number} userId - User identifier
   * @param {string} [incomeDescription="Income allocation"] - Income description
   * @returns {Promise<Object>} Auto-allocation results
   */
  async autoAllocateIncome(
    incomeAmount,
    userId,
    incomeDescription = "Income allocation"
  ) {
    try {
      if (incomeAmount <= 0) {
        logger.warn("Invalid income amount for auto-allocation", {
          userId,
          incomeAmount,
        });
        throw new Error("Income amount must be positive");
      }

      // Find user's primary account
      const account = await this.prisma.account.findFirst({
        where: { userId },
      });

      if (!account) {
        logger.warn("No account found for auto-allocation", { userId });
        throw new Error("No account found for user");
      }

      // Get goals with allocation percentages
      const activeGoals = await this.prisma.financialGoal.findMany({
        where: {
          userId,
          isActive: true,
          isCompleted: false,
          allocationPercentage: { not: null },
        },
      });

      // Validate total allocation percentage doesn't exceed 100%
      const totalAllocation = activeGoals.reduce(
        (sum, goal) => sum + (goal.allocationPercentage || 0),
        0
      );

      if (totalAllocation > 100) {
        logger.error("Total allocation percentage exceeds 100%", {
          userId,
          totalAllocation,
        });
        throw new Error("Total allocation percentage exceeds 100%");
      }

      const allocations = [];

      // Process allocation for each goal
      for (const goal of activeGoals) {
        const allocationAmount =
          (incomeAmount * goal.allocationPercentage) / 100;
        const newAmount = goal.currentAmount + allocationAmount;
        const isCompleted = newAmount >= goal.targetAmount;

        const updatedGoal = await this.prisma.financialGoal.update({
          where: { id: goal.id },
          data: {
            currentAmount: newAmount,
            isCompleted,
            completedAt: isCompleted ? new Date() : null,
          },
        });

        // Create transaction for the allocation
        const transaction = await this.prisma.transaction.create({
          data: {
            accountId: account.id,
            amount: allocationAmount,
            type: "income",
            category: "Goal Allocation",
            date: new Date(),
            description: `${incomeDescription} - ${goal.name} (${goal.allocationPercentage}%)`,
          },
        });

        allocations.push({
          goal: goal.name,
          allocationPercentage: goal.allocationPercentage,
          amount: allocationAmount,
          previousAmount: goal.currentAmount,
          newAmount,
          isCompleted,
          transactionId: transaction.id,
        });
      }

      const result = {
        totalIncome: incomeAmount,
        totalAllocated: allocations.reduce(
          (sum, alloc) => sum + alloc.amount,
          0
        ),
        allocations,
      };

      logger.info("Income auto-allocation completed", {
        userId,
        incomeAmount,
        allocatedAmount: result.totalAllocated,
        goalCount: activeGoals.length,
      });

      return result;
    } catch (error) {
      logger.error("Income auto-allocation failed", {
        userId,
        incomeAmount,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get comprehensive goal progress analytics
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} Goal analytics
   */
  async getGoalAnalytics(userId) {
    try {
      const goals = await this.getUserGoals(userId);

      const analytics = {
        totalGoals: goals.length,
        completedGoals: goals.filter((g) => g.isCompleted).length,
        activeGoals: goals.filter((g) => g.isActive && !g.isCompleted).length,
        totalTargetAmount: goals.reduce((sum, g) => sum + g.targetAmount, 0),
        totalCurrentAmount: goals.reduce((sum, g) => sum + g.currentAmount, 0),
        totalProgressPercentage: 0,
        byCategory: {},
        byPriority: {},
        upcomingDeadlines: [],
        goalsAtRisk: [],
        optimizationOpportunities: [],
      };

      goals.forEach((goal) => {
        // Calculate individual goal progress
        const progressPercentage =
          goal.targetAmount > 0
            ? (goal.currentAmount / goal.targetAmount) * 100
            : 0;
        const daysToDeadline = Math.ceil(
          (new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)
        );

        // Group by category with aggregated metrics
        if (!analytics.byCategory[goal.category]) {
          analytics.byCategory[goal.category] = {
            goals: 0,
            totalTarget: 0,
            totalCurrent: 0,
            averageProgress: 0,
          };
        }
        analytics.byCategory[goal.category].goals++;
        analytics.byCategory[goal.category].totalTarget += goal.targetAmount;
        analytics.byCategory[goal.category].totalCurrent += goal.currentAmount;

        // Group by priority with aggregated metrics
        if (!analytics.byPriority[goal.priority]) {
          analytics.byPriority[goal.priority] = {
            goals: 0,
            totalTarget: 0,
            totalCurrent: 0,
          };
        }
        analytics.byPriority[goal.priority].goals++;
        analytics.byPriority[goal.priority].totalTarget += goal.targetAmount;
        analytics.byPriority[goal.priority].totalCurrent += goal.currentAmount;

        // Track upcoming deadlines (within 30 days)
        if (daysToDeadline > 0 && daysToDeadline <= 30 && !goal.isCompleted) {
          analytics.upcomingDeadlines.push({
            ...goal,
            daysToDeadline,
            progressPercentage,
          });
        }

        // Identify goals at risk (less than 50% progress with deadline within 60 days)
        if (
          progressPercentage < 50 &&
          daysToDeadline <= 60 &&
          daysToDeadline > 0
        ) {
          analytics.goalsAtRisk.push({
            ...goal,
            daysToDeadline,
            progressPercentage,
            neededPerDay: (
              (goal.targetAmount - goal.currentAmount) /
              daysToDeadline
            ).toFixed(2),
            urgency:
              daysToDeadline < 30
                ? "high"
                : daysToDeadline < 60
                ? "medium"
                : "low",
          });
        }

        // Identify optimization opportunities (high daily funding needs)
        if (!goal.isCompleted && daysToDeadline > 0) {
          const dailyNeed =
            (goal.targetAmount - goal.currentAmount) / daysToDeadline;
          if (dailyNeed > 100) {
            analytics.optimizationOpportunities.push({
              goal: goal.name,
              priority: goal.priority,
              dailyNeed: dailyNeed.toFixed(2),
              suggestion:
                "Consider increasing allocation or extending deadline",
            });
          }
        }
      });

      // Calculate overall progress percentage
      analytics.totalProgressPercentage =
        analytics.totalTargetAmount > 0
          ? (analytics.totalCurrentAmount / analytics.totalTargetAmount) * 100
          : 0;

      // Calculate average progress per category
      Object.keys(analytics.byCategory).forEach((category) => {
        const cat = analytics.byCategory[category];
        cat.averageProgress =
          cat.totalTarget > 0 ? (cat.totalCurrent / cat.totalTarget) * 100 : 0;
      });

      // Calculate progress by priority
      Object.keys(analytics.byPriority).forEach((priority) => {
        const pri = analytics.byPriority[priority];
        pri.averageProgress =
          pri.totalTarget > 0 ? (pri.totalCurrent / pri.totalTarget) * 100 : 0;
      });

      logger.debug("Goal analytics generated", {
        userId,
        totalGoals: analytics.totalGoals,
        progressPercentage: analytics.totalProgressPercentage,
      });

      return analytics;
    } catch (error) {
      logger.error("Failed to get goal analytics", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get optimization recommendations across different strategies
   * @param {string|number} userId - User identifier
   * @param {number} [availableFunds=1000] - Available funds for optimization
   * @returns {Promise<Object>} Optimization recommendations
   */
  async getOptimizationRecommendations(userId, availableFunds = 1000) {
    try {
      const goals = await this.getUserGoals(userId);
      const activeGoals = goals.filter(
        (goal) => goal.isActive && !goal.isCompleted
      );

      if (activeGoals.length === 0) {
        logger.info("No active goals for optimization recommendations", {
          userId,
        });
        return {
          message: "No active goals to optimize",
          recommendations: [],
        };
      }

      const recommendations = [];
      const strategies = ["urgency", "balanced", "proportional", "priority"];

      // Analyze each allocation strategy
      for (const strategy of strategies) {
        const optimization = this.optimizeGoalAllocation(
          goals,
          availableFunds,
          strategy
        );

        // Calculate effectiveness metrics for this strategy
        const effectiveness = this.calculateStrategyEffectiveness(
          optimization.allocations,
          goals
        );

        recommendations.push({
          strategy,
          description: this.getStrategyDescription(strategy),
          allocations: optimization.allocations,
          allocatedAmount: optimization.totalAllocated,
          remainingAmount: optimization.remaining,
          effectiveness,
          suitability: this.assessStrategySuitability(strategy, goals),
        });
      }

      // Sort by effectiveness score (descending)
      recommendations.sort(
        (a, b) => b.effectiveness.score - a.effectiveness.score
      );

      // Generate actionable insights
      const insights = this.generateOptimizationInsights(
        recommendations,
        goals
      );

      const result = {
        totalGoals: goals.length,
        activeGoals: activeGoals.length,
        availableFunds,
        topStrategy: recommendations[0].strategy,
        recommendations,
        insights,
      };

      logger.info("Optimization recommendations generated", {
        userId,
        topStrategy: result.topStrategy,
        activeGoalCount: activeGoals.length,
      });

      return result;
    } catch (error) {
      logger.error("Failed to generate optimization recommendations", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate effectiveness metrics for an allocation strategy
   * @param {Array} allocations - Allocation recommendations
   * @param {Array} goals - Original goal list
   * @returns {Object} Effectiveness metrics
   */
  calculateStrategyEffectiveness(allocations, goals) {
    let totalScore = 0;
    let goalsReached = 0;
    let deadlineAdherence = 0;

    // Create map for quick goal lookup
    const goalMap = new Map(goals.map((g) => [g.id, g]));

    allocations.forEach((allocation) => {
      const goal = goalMap.get(allocation.goalId);
      if (goal) {
        const newAmount = goal.currentAmount + allocation.amount;
        const progress = (newAmount / goal.targetAmount) * 100;

        // Score based on progress increase with priority weighting
        totalScore += allocation.amount * (goal.priority === "high" ? 1.5 : 1);

        if (progress >= 100) goalsReached++;

        // Deadline adherence calculation
        const daysLeft = Math.max(
          1,
          Math.ceil(
            (new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)
          )
        );
        const dailyNeed = (goal.targetAmount - goal.currentAmount) / daysLeft;
        const allocatedDays = allocation.amount / dailyNeed;
        if (allocatedDays >= daysLeft) deadlineAdherence++;
      }
    });

    return {
      score: Math.round(totalScore),
      goalsReached,
      deadlineAdherence: (deadlineAdherence / allocations.length) * 100,
      efficiency:
        allocations.length > 0
          ? totalScore / allocations.reduce((sum, a) => sum + a.amount, 0)
          : 0,
    };
  }

  /**
   * Get strategy description for user-friendly display
   * @param {string} strategy - Strategy name
   * @returns {string} Strategy description
   */
  getStrategyDescription(strategy) {
    const descriptions = {
      urgency:
        "Prioritizes goals with closest deadlines and highest daily funding needs",
      balanced:
        "Balances urgency, progress, and priority to allocate funds evenly",
      proportional:
        "Allocates funds proportionally based on remaining amounts needed",
      priority:
        "Focuses on user-defined priority levels and importance ratings",
    };
    return descriptions[strategy] || "Balanced allocation strategy";
  }

  /**
   * Assess suitability of a strategy based on goal characteristics
   * @param {string} strategy - Strategy name
   * @param {Array} goals - Goal list
   * @returns {string} Suitability rating
   */
  assessStrategySuitability(strategy, goals) {
    const activeGoals = goals.filter((g) => g.isActive && !g.isCompleted);

    if (activeGoals.length === 0) return "neutral";

    // Analyze goal characteristics
    const urgencyCount = activeGoals.filter((g) => {
      const daysLeft = Math.ceil(
        (new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24)
      );
      return daysLeft < 30;
    }).length;

    const priorityCount = activeGoals.filter(
      (g) => g.priority === "high"
    ).length;
    const variedAmounts =
      new Set(activeGoals.map((g) => g.targetAmount)).size > 3;

    // Determine suitability based on strategy and goal characteristics
    switch (strategy) {
      case "urgency":
        return urgencyCount > 2 ? "high" : urgencyCount > 0 ? "medium" : "low";
      case "priority":
        return priorityCount > 1
          ? "high"
          : priorityCount > 0
          ? "medium"
          : "low";
      case "proportional":
        return variedAmounts ? "high" : "medium";
      default:
        return "balanced";
    }
  }

  /**
   * Generate actionable insights from optimization recommendations
   * @param {Array} recommendations - Optimization recommendations
   * @param {Array} goals - Goal list
   * @returns {Array} Actionable insights
   */
  generateOptimizationInsights(recommendations, goals) {
    const insights = [];
    const activeGoals = goals.filter((g) => g.isActive && !g.isCompleted);

    if (activeGoals.length === 0) {
      insights.push({
        type: "no_goals",
        message:
          "No active goals to optimize. Consider creating some financial goals!",
        severity: "info",
      });
      return insights;
    }

    // Check for urgent goals (deadline within 30 days)
    const urgentGoals = activeGoals.filter((g) => {
      const daysLeft = Math.ceil(
        (new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24)
      );
      return daysLeft < 30;
    });

    if (urgentGoals.length > 0) {
      insights.push({
        type: "urgency",
        message: `${urgentGoals.length} goals have deadlines within 30 days`,
        severity: "high",
        goals: urgentGoals.map((g) => g.name),
      });
    }

    // Check allocation efficiency
    const topStrategy = recommendations[0];
    if (topStrategy.effectiveness.efficiency < 5) {
      insights.push({
        type: "efficiency",
        message:
          "Current allocation strategies have low efficiency. Consider reviewing goal priorities.",
        severity: "medium",
        suggestion:
          "Adjust goal priorities or deadlines for better allocation efficiency",
      });
    }

    // Check for underfunded high-priority goals
    const underfundedGoals = activeGoals.filter((g) => {
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24))
      );
      const dailyNeed = (g.targetAmount - g.currentAmount) / daysLeft;
      return dailyNeed > 100 && g.priority === "high";
    });

    if (underfundedGoals.length > 0) {
      insights.push({
        type: "underfunded",
        message: `${underfundedGoals.length} high priority goals require significant daily funding`,
        severity: "high",
        goals: underfundedGoals.map((g) => ({
          name: g.name,
          dailyNeed: ((g.targetAmount - g.currentAmount) / daysLeft).toFixed(2),
        })),
      });
    }

    return insights;
  }

  /**
   * Suggest allocation percentages based on optimization
   * @param {string|number} userId - User identifier
   * @param {number} availableAmount - Available funds
   * @returns {Promise<Object>} Allocation suggestions
   */
  async suggestAllocations(userId, availableAmount) {
    try {
      if (availableAmount <= 0) {
        logger.warn("No available funds for allocation suggestions", {
          userId,
          availableAmount,
        });
        return { suggestions: [] };
      }

      const activeGoals = await this.prisma.financialGoal.findMany({
        where: {
          userId,
          isActive: true,
          isCompleted: false,
        },
        orderBy: { deadline: "asc" },
      });

      if (activeGoals.length === 0) {
        logger.info("No active goals for allocation suggestions", { userId });
        return { suggestions: [] };
      }

      // Get optimization recommendations
      const optimization = await this.getOptimizationRecommendations(
        userId,
        availableAmount
      );

      // Use the top strategy's allocations
      const topAllocations = optimization.recommendations[0]?.allocations || [];

      const suggestions = activeGoals.map((goal) => {
        const allocation = topAllocations.find((a) => a.goalId === goal.id);
        const daysToDeadline = Math.max(
          1,
          Math.ceil(
            (new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)
          )
        );
        const remainingAmount = goal.targetAmount - goal.currentAmount;
        const monthlyNeed = remainingAmount / (daysToDeadline / 30);

        return {
          goal,
          remainingAmount,
          daysToDeadline,
          monthlyNeed,
          suggestedAllocation: allocation
            ? (allocation.amount / availableAmount) * 100
            : 0,
          suggestedAmount: allocation?.amount || 0,
          strategy: optimization.topStrategy,
          confidence: allocation ? "high" : "low",
        };
      });

      const result = {
        suggestions,
        strategy: optimization.topStrategy,
        totalAvailable: availableAmount,
        totalSuggested: suggestions.reduce(
          (sum, s) => sum + s.suggestedAmount,
          0
        ),
      };

      logger.debug("Allocation suggestions generated", {
        userId,
        strategy: result.strategy,
        suggestionCount: suggestions.length,
      });

      return result;
    } catch (error) {
      logger.error("Failed to generate allocation suggestions", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cleanup database connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.prisma.$disconnect();
      logger.debug("GoalService cleanup completed");
    } catch (error) {
      logger.error("GoalService cleanup failed", { error: error.message });
      throw error;
    }
  }
}
