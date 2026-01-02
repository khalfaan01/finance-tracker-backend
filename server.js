// fintech-cyber-backend/server.js
// Main server setup with Express, Socket.IO, security middleware, and real-time monitoring
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import { createServer } from "http";
import { Server } from "socket.io";
import prisma from "./db.js";
import logger from "./logger.js";
import accountRoutes from "./routes/accounts.js";
import analyticsRoutes from "./routes/analytics.js";
import authRoutes from "./routes/auth.js";
import budgetRoutes from "./routes/budgets.js";
import debtRoutes from "./routes/debts.js";
import goalRoutes from "./routes/goals.js";
import recurringTransactionRoutes from "./routes/recurringTransactions.js";
import securityRoutes from "./routes/security.js";
import transactionMoodRoutes from "./routes/transactionMoods.js";
import transactionRoutes from "./routes/transactions.js";

dotenv.config();

// Initialize Express and HTTP server
const app = express();
const server = createServer(app);

/**
 * Rate limiting configuration
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const moodLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Too many mood requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again later." },
});

/**
 * CORS configuration
 */
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        process.env.FRONTEND_URL,
      ].filter(Boolean);

      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        // Only log unauthorized origins in development
        if (process.env.NODE_ENV === "development") {
          logger.warn(`CORS blocked request from origin: ${origin}`);
        }
        return callback(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

/**
 * Apply rate limiting with different rules for different endpoints
 */
app.use((req, res, next) => {
  const path = req.path;

  if (path === "/health" || path === "/") {
    return next();
  }

  if (path.startsWith("/api/transaction-moods")) {
    return moodLimiter(req, res, next);
  }

  if (path.startsWith("/api/auth")) {
    return authLimiter(req, res, next);
  }

  return limiter(req, res, next);
});

/**
 * Security middleware
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "ws://localhost:5173",
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(hpp());
app.use(mongoSanitize());
app.use(express.json({ limit: "10kb" }));

/**
 * Socket.IO setup - Minimal logging
 */
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  // Only log on development for debugging
  if (process.env.NODE_ENV === "development") {
    logger.debug(`Socket.IO client connected: ${socket.id}`);
  }

  socket.on("join_user_room", (userId) => {
    socket.join(`user_${userId}`);
  });

  socket.on("monitor_transaction", (data) => {
    socket.to("admin_security").emit("new_transaction_monitor", data);
  });

  socket.on("disconnect", () => {
    if (process.env.NODE_ENV === "development") {
      logger.debug(`Socket.IO client disconnected: ${socket.id}`);
    }
  });
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

/**
 * API Routes
 */
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/transaction-mood", transactionMoodRoutes);
app.use("/api/recurring-transactions", recurringTransactionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/debts", debtRoutes);

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    service: "fintech-cyber-backend",
  });
});

app.get("/", (req, res) => res.send("Fintech Cyber Backend Server is running"));

/**
 * Global error handling
 */
app.use((err, req, res, next) => {
  // Log all errors - this is important
  logger.error("Application error", {
    error: err.message,
    path: req.path,
    method: req.method,
    statusCode: res.statusCode,
    // Only include stack in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });

  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }

  if (err.message.includes("CORS")) {
    return res.status(403).json({ error: "CORS policy blocked the request" });
  }

  if (err.message && err.message.includes("Too many")) {
    return res.status(429).json({ error: err.message });
  }

  res.status(500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

/**
 * 404 handler - Only log suspicious 404s
 */
app.use((req, res) => {
  // Only log 404s for API routes (not static files, favicon, etc.)
  if (req.path.startsWith("/api/")) {
    logger.warn("API route not found", {
      path: req.path,
      method: req.method,
    });
  }
  res.status(404).json({ error: "Route not found" });
});

/**
 * Server startup
 */
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  try {
    // Test database connection
    const prismaClient = await prisma.getClient();

    // Single startup log with essential info
    logger.info("Server started successfully", {
      port: PORT,
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
    });
  } catch (err) {
    logger.error("Server startup failed - Database connection error", {
      error: err.message,
    });
    process.exit(1);
  }
});

/**
 * Graceful shutdown
 */
const gracefulShutdown = async (signal) => {
  logger.info(`Initiating graceful shutdown (${signal})...`);

  try {
    server.close(() => {
      logger.info("HTTP server closed");
    });

    if (io) {
      io.close();
    }

    await prisma.disconnect();
    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during graceful shutdown", { error: error.message });
    process.exit(1);
  }
};

// Keep these process-level handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection", {
    reason: reason,
  });
});

export { app, io, server };
