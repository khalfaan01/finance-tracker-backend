// transactionMood.js - Transaction mood and emotional tracking routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { TransactionMoodService } from "../services/transactionMoodService.js";

const router = express.Router();
const moodService = new TransactionMoodService();

// Validation rules for mood tracking
const moodValidation = [
  body("transactionId")
    .isInt({ min: 1 })
    .withMessage("Valid transaction ID required"),
  body("mood")
    .isIn([
      "happy",
      "stressed",
      "bored",
      "impulsive",
      "planned",
      "anxious",
      "excited",
      "regretful",
    ])
    .withMessage("Valid mood required"),
  body("intensity")
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage("Intensity must be 1-10"),
  body("notes")
    .optional()
    .trim()
    .escape()
    .isLength({ max: 500 })
    .withMessage("Notes too long"),
];

/**
 * GET /transaction-mood - Get all moods for the current user
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const moods = await moodService.prisma.transactionMood.findMany({
      where: {
        userId: req.user.userId,
      },
      include: {
        transaction: {
          select: {
            id: true,
            amount: true,
            description: true,
            category: true,
            date: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(moods);
  } catch (error) {
    logger.error("Failed to fetch user moods", {
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch moods" });
  }
});

/**
 * POST /transaction-mood - Add emotional mood to a transaction
 * @route POST /transaction-mood
 * @param {number} transactionId - Transaction ID
 * @param {string} mood - Emotional state: 'happy', 'stressed', 'bored', 'impulsive', 'planned', 'anxious', 'excited', 'regretful'
 * @param {number} [intensity] - Emotional intensity (1-10, default: 5)
 * @param {string} [notes] - Additional notes about emotional state
 * @returns {Object} Created transaction mood record
 * @description Associates emotional state with financial transactions for behavioral analysis
 */
router.post("/", authenticateToken, moodValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Transaction mood creation validation failed", {
      context: "transaction-mood",
      userId: req.user.userId,
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const data = {
      transactionId: parseInt(req.body.transactionId),
      userId: req.user.userId,
      mood: req.body.mood,
      intensity: req.body.intensity || 5, // Default intensity if not provided
      notes: req.body.notes || null,
    };

    const transactionMood = await moodService.upsertTransactionMood(data);

    logger.info("Transaction mood recorded successfully", {
      context: "transaction-mood",
      userId: req.user.userId,
      moodId: transactionMood.id,
      transactionId: transactionMood.transactionId,
      mood: transactionMood.mood,
      intensity: transactionMood.intensity,
    });

    res.status(201).json(transactionMood);
  } catch (error) {
    logger.error("Transaction mood creation failed", {
      context: "transaction-mood",
      userId: req.user.userId,
      error: error.message,
      transactionId: req.body.transactionId,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /transaction-mood/analysis - Get emotional analytics for user transactions
 * @route GET /transaction-mood/analysis
 * @param {string} [timeframe] - Timeframe for analysis: 'weekly', 'monthly', 'yearly' (default: 'monthly')
 * @returns {Object} Mood analytics with patterns and insights
 * @description Analyzes emotional patterns in spending habits over time
 */
router.get("/analysis", authenticateToken, async (req, res) => {
  try {
    const { timeframe = "monthly" } = req.query;

    const analysis = await moodService.getUserMoodAnalytics(
      req.user.userId,
      timeframe
    );

    logger.info("Generated transaction mood analytics", {
      context: "transaction-mood",
      userId: req.user.userId,
      timeframe: timeframe,
      totalMoods: analysis.summary?.totalMoods || 0,
      uniqueMoodTypes: Object.keys(analysis.byMood || {}).length || 0,
    });

    res.json(analysis);
  } catch (error) {
    logger.error("Transaction mood analytics generation failed", {
      context: "transaction-mood",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to analyze moods" });
  }
});

/**
 * PUT /transaction-mood/:id - Update an existing mood record
 */
router.put(
  "/:id",
  authenticateToken,
  [
    body("mood")
      .isIn([
        "happy",
        "stressed",
        "bored",
        "impulsive",
        "planned",
        "anxious",
        "excited",
        "regretful",
      ])
      .withMessage("Valid mood required"),
    body("intensity")
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage("Intensity must be 1-10"),
    body("notes")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Notes too long"),
  ],
  async (req, res) => {
    const { id } = req.params;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const moodExists = await moodService.prisma.transactionMood.findUnique({
        where: { id: parseInt(id) },
      });

      if (!moodExists) {
        return res.status(404).json({ error: "Mood not found" });
      }

      // Verify ownership
      if (moodExists.userId !== req.user.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const data = {
        mood: req.body.mood,
        intensity: req.body.intensity || moodExists.intensity,
        notes: req.body.notes || null,
        updatedAt: new Date(),
      };

      const transactionMood = await moodService.prisma.transactionMood.update({
        where: {
          id: parseInt(id),
        },
        data,
      });

      logger.info("Transaction mood updated successfully", {
        moodId: id,
        userId: req.user.userId,
      });

      res.json(transactionMood);
    } catch (error) {
      if (error.code === "P2025") {
        res.status(404).json({ error: "Mood not found" });
      } else {
        logger.error("Transaction mood update failed", {
          moodId: id,
          userId: req.user.userId,
          error: error.message,
        });
        res.status(500).json({ error: "Failed to update mood" });
      }
    }
  }
);

/**
 * GET /transaction-mood/transaction/:transactionId - Get mood for specific transaction
 * @route GET /transaction-mood/transaction/:transactionId
 * @param {string} transactionId - Transaction ID
 * @returns {Object|null} Mood record for transaction or null if not found
 * @description Retrieves emotional association for a specific transaction
 */
router.get(
  "/transaction/:transactionId",
  authenticateToken,
  async (req, res) => {
    const { transactionId } = req.params;

    try {
      // Validate transaction ownership
      const transaction = await moodService.prisma.transaction.findFirst({
        where: {
          id: parseInt(transactionId),
          account: { userId: req.user.userId },
        },
      });

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      const mood = await moodService.prisma.transactionMood.findFirst({
        where: {
          transactionId: parseInt(transactionId),
          userId: req.user.userId,
        },
        include: {
          transaction: {
            select: {
              id: true,
              amount: true,
              description: true,
            },
          },
        },
      });

      res.json(mood || null);
    } catch (error) {
      logger.error("Failed to fetch transaction mood", {
        userId: req.user.userId,
        transactionId: transactionId,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to get mood" });
    }
  }
);

/**
 * GET /transaction-mood/trends - Get mood trends over time
 * @route GET /transaction-mood/trends
 * @param {string} [groupBy] - Grouping period: 'week' or 'month' (default: 'week')
 * @returns {Object} Mood trends grouped by time period with spending correlations
 * @description Tracks how emotional states correlate with spending patterns over time
 */
router.get("/trends", authenticateToken, async (req, res) => {
  try {
    const { groupBy = "week" } = req.query;

    if (!["week", "month"].includes(groupBy)) {
      logger.warn("Invalid groupBy parameter for mood trends", {
        context: "transaction-mood",
        userId: req.user.userId,
        groupBy: groupBy,
      });
      return res
        .status(400)
        .json({ error: "groupBy must be 'week' or 'month'" });
    }

    const moods = await moodService.prisma.transactionMood.findMany({
      where: {
        userId: req.user.userId,
      },
      include: {
        transaction: {
          select: {
            amount: true,
            category: true,
            date: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Group moods by time period for trend analysis
    const trends = {};
    moods.forEach((mood) => {
      const date = new Date(mood.createdAt);
      let periodKey;

      if (groupBy === "week") {
        // Calculate week number: Math.ceil(dayOfMonth / 7)
        const weekNumber = Math.ceil(date.getDate() / 7);
        periodKey = `${date.getFullYear()}-W${String(weekNumber).padStart(
          2,
          "0"
        )}`;
      } else {
        // Month grouping: YYYY-MM format
        periodKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;
      }

      if (!trends[periodKey]) {
        trends[periodKey] = {
          moods: {},
          totalSpent: 0,
          count: 0,
        };
      }

      // Track mood frequency distribution
      if (!trends[periodKey].moods[mood.mood]) {
        trends[periodKey].moods[mood.mood] = 0;
      }
      trends[periodKey].moods[mood.mood]++;

      // Track spending associated with moods (negative amounts are expenses)
      if (mood.transaction && mood.transaction.amount < 0) {
        trends[periodKey].totalSpent += Math.abs(mood.transaction.amount);
      }

      trends[periodKey].count++;
    });

    // Calculate most common mood for each period
    const mostCommonMoods = Object.entries(trends).map(([period, data]) => {
      const moodEntries = Object.entries(data.moods);
      const mostCommon =
        moodEntries.length > 0
          ? moodEntries.reduce((a, b) => (a[1] > b[1] ? a : b), ["", 0])
          : ["none", 0];
      return { period, mood: mostCommon[0], count: mostCommon[1] };
    });

    const result = {
      trends,
      summary: {
        totalPeriods: Object.keys(trends).length,
        mostCommonMoods: mostCommonMoods,
      },
    };

    logger.info("Generated transaction mood trends", {
      context: "transaction-mood",
      userId: req.user.userId,
      groupBy: groupBy,
      totalPeriods: result.summary.totalPeriods,
      totalMoods: moods.length,
      periodsWithData: Object.keys(trends).length,
    });

    res.json(result);
  } catch (error) {
    logger.error("Failed to generate mood trends", {
      context: "transaction-mood",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ error: "Failed to get mood trends" });
  }
});

/**
 * DELETE /transaction-mood/:id - Delete a mood record
 * @route DELETE /transaction-mood/:id
 * @param {string} id - Mood record ID
 * @returns {Object} Deletion confirmation
 * @description Removes emotional association from transaction
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await moodService.prisma.transactionMood.delete({
      where: {
        id: parseInt(id),
        userId: req.user.userId,
      },
    });

    logger.info("Transaction mood deleted successfully", {
      context: "transaction-mood",
      userId: req.user.userId,
      moodId: id,
    });

    res.json({ message: "Mood deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      logger.warn("Transaction mood not found for deletion", {
        context: "transaction-mood",
        userId: req.user.userId,
        moodId: id,
      });
      res.status(404).json({ error: "Mood not found" });
    } else {
      logger.error("Transaction mood deletion failed", {
        context: "transaction-mood",
        userId: req.user.userId,
        moodId: id,
        error: error.message,
      });
      res.status(500).json({ error: "Failed to delete mood" });
    }
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info(
    "Shutting down transaction mood service - cleaning up connections",
    { context: "transaction-mood" }
  );
  try {
    await moodService.cleanup();
    logger.info("Transaction mood service cleanup completed", {
      context: "transaction-mood",
    });
  } catch (error) {
    logger.error("Error during transaction mood service cleanup", {
      context: "transaction-mood",
      error: error.message,
    });
  }
  process.exit();
});

export default router;
