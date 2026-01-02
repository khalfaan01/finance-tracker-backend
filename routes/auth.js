// auth.js - Authentication and user management routes
import express from "express";
import { body, validationResult } from "express-validator";
import logger, { authLogger } from "../logger.js"; // Import Winston logger
import { authenticateToken } from "../middleware/authMiddleware.js";
import { AuthService } from "../services/authService.js";

const router = express.Router();
const authService = new AuthService();

// Validation rules for user registration
const registerValidation = [
  body("email").isEmail().withMessage("Please provide a valid email"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase, and numbers"),
  body("name")
    .optional()
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters"),
];

// Validation rules for user login
const loginValidation = [
  body("email").isEmail().withMessage("Please provide a valid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

/**
 * POST /auth/register - Register a new user
 * @route POST /auth/register
 * @param {string} email - User email address
 * @param {string} password - User password (min 8 chars with uppercase, lowercase, numbers)
 * @param {string} [name] - Optional user display name
 * @returns {Object} Registration result with tokens
 * @description Creates a new user account with email validation
 */
router.post("/register", registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Registration validation failed", {
      context: "auth",
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, name } = req.body;

  try {
    const result = await authService.registerUser(email, password, name);

    authLogger.success({
      userId: result.user.id,
      email: result.user.email,
      context: "registration",
    });

    logger.info("User registered successfully", {
      userId: result.user.id,
      email: result.user.email,
    });

    res.status(201).json({
      message: "User registered successfully",
      ...result,
    });
  } catch (error) {
    if (error.message.includes("already registered")) {
      logger.warn("Registration attempt with existing email", {
        context: "auth",
        email: email,
      });
      res.status(400).json({
        errors: [{ msg: error.message }],
      });
    } else {
      logger.error("Registration server error", {
        context: "auth",
        email: email,
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
      res.status(500).json({
        errors: [{ msg: "Server error during registration" }],
      });
    }
  }
});

/**
 * POST /auth/login - Authenticate user and return tokens
 * @route POST /auth/login
 * @param {string} email - User email address
 * @param {string} password - User password
 * @returns {Object} Login result with access and refresh tokens
 * @description Authenticates user and implements security measures (IP tracking, rate limiting)
 */
router.post("/login", loginValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn("Login validation failed", {
      context: "auth",
      validationErrors: errors.array(),
    });
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  // Use multiple fallbacks for IP detection in different environments
  const clientIp =
    req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  try {
    authLogger.attempt({
      email: email,
      ip: clientIp,
      context: "login",
    });

    const result = await authService.loginUser(email, password, clientIp);

    authLogger.success({
      userId: result.user.id,
      email: email,
      ip: clientIp,
      context: "login",
    });

    res.json({
      message: "Login successful",
      ...result,
    });
  } catch (error) {
    if (error.message.includes("Invalid credentials")) {
      authLogger.failed({
        email: email,
        ip: clientIp,
        remainingAttempts: error.remainingAttempts,
        context: "login",
      });
      res.status(400).json({
        message: error.message,
        remainingAttempts: error.remainingAttempts,
      });
    } else if (error.message.includes("temporarily locked")) {
      logger.warn("Account temporarily locked due to failed attempts", {
        context: "auth",
        email: email,
        ip: clientIp,
      });
      res.status(423).json({ message: error.message });
    } else {
      logger.error("Login server error", {
        context: "auth",
        email: email,
        ip: clientIp,
        error: error.message,
      });
      res.status(500).json({ message: "Server error" });
    }
  }
});

/**
 * POST /auth/refresh - Refresh expired access token
 * @route POST /auth/refresh
 * @param {string} refreshToken - Valid refresh token
 * @returns {Object} New access and refresh tokens
 * @description Issues new tokens when access token expires (refresh token rotation)
 */
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    logger.warn("Refresh token missing in request", { context: "auth" });
    return res.status(400).json({ message: "Refresh token is required" });
  }

  try {
    const result = await authService.refreshToken(refreshToken);

    logger.info("Token refreshed successfully", {
      context: "auth",
      userId: result.user?.id,
    });

    res.json(result);
  } catch (error) {
    logger.warn("Token refresh failed", {
      context: "auth",
      error: error.message,
    });
    res.status(403).json({ message: error.message });
  }
});

/**
 * POST /auth/logout - Invalidate user session
 * @route POST /auth/logout
 * @returns {Object} Logout confirmation
 * @description Invalidates refresh token and logs logout activity
 */
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    const clientIp =
      req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const result = await authService.logout(req.user.userId, clientIp);

    authLogger.revoked({
      userId: req.user.userId,
      ip: clientIp,
      context: "logout",
    });

    res.json(result);
  } catch (error) {
    logger.error("Logout error", {
      context: "auth",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ message: "Server error during logout" });
  }
});

/**
 * GET /auth/profile - Get authenticated user's profile
 * @route GET /auth/profile
 * @returns {Object} User profile information
 */
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const profile = await authService.getUserProfile(req.user.userId);

    logger.info("User profile fetched", {
      context: "auth",
      userId: req.user.userId,
    });

    res.json(profile);
  } catch (error) {
    logger.error("Profile fetch error", {
      context: "auth",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

/**
 * PUT /auth/profile - Update user profile information
 * @route PUT /auth/profile
 * @param {Object} profileData - Profile fields to update
 * @returns {Object} Updated user profile
 */
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const updatedUser = await authService.updateUserProfile(
      req.user.userId,
      req.body
    );

    logger.info("User profile updated", {
      context: "auth",
      userId: req.user.userId,
      updatedFields: Object.keys(req.body),
    });

    res.json(updatedUser);
  } catch (error) {
    logger.error("Profile update error", {
      context: "auth",
      userId: req.user.userId,
      error: error.message,
    });
    res.status(500).json({ message: "Failed to update profile" });
  }
});

/**
 * POST /auth/change-password - Change user password
 * @route POST /auth/change-password
 * @param {string} currentPassword - Current password for verification
 * @param {string} newPassword - New password to set
 * @returns {Object} Password change confirmation
 * @description Requires current password for security verification
 */
router.post("/change-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    logger.warn("Password change validation failed", {
      context: "auth",
      userId: req.user.userId,
    });
    return res
      .status(400)
      .json({ message: "Current and new password are required" });
  }

  try {
    const result = await authService.changePassword(
      req.user.userId,
      currentPassword,
      newPassword
    );

    logger.info("Password changed successfully", {
      context: "auth",
      userId: req.user.userId,
    });

    res.json(result);
  } catch (error) {
    if (error.message.includes("incorrect")) {
      logger.warn("Password change failed - incorrect current password", {
        context: "auth",
        userId: req.user.userId,
      });
      res.status(400).json({ message: error.message });
    } else {
      logger.error("Password change error", {
        context: "auth",
        userId: req.user.userId,
        error: error.message,
      });
      res.status(500).json({ message: "Failed to change password" });
    }
  }
});

/**
 * POST /auth/request-password-reset - Request password reset token
 * @route POST /auth/request-password-reset
 * @param {string} email - User email address
 * @returns {Object} Reset request confirmation (token sent via email)
 * @description Generates and sends password reset token (email simulation)
 */
router.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    logger.warn("Password reset request missing email", { context: "auth" });
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const result = await authService.generatePasswordResetToken(email);

    logger.info("Password reset token generated", {
      context: "auth",
      email: email,
      // Note: Don't log the actual token for security
      tokenGenerated: true,
    });

    res.json(result);
  } catch (error) {
    logger.error("Password reset request error", {
      context: "auth",
      email: email,
      error: error.message,
    });
    res.status(500).json({ message: "Failed to process reset request" });
  }
});

/**
 * POST /auth/reset-password - Reset password using token
 * @route POST /auth/reset-password
 * @param {string} token - Password reset token
 * @param {string} newPassword - New password to set
 * @returns {Object} Password reset confirmation
 * @description Validates reset token and updates password
 */
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    logger.warn("Password reset missing required fields", { context: "auth" });
    return res
      .status(400)
      .json({ message: "Token and new password are required" });
  }

  try {
    const result = await authService.resetPasswordWithToken(token, newPassword);

    logger.info("Password reset successfully using token", {
      context: "auth",
      userId: result.user?.id,
      tokenUsed: true,
    });

    res.json(result);
  } catch (error) {
    if (
      error.message.includes("Invalid") ||
      error.message.includes("expired")
    ) {
      logger.warn("Password reset failed - invalid/expired token", {
        context: "auth",
        error: error.message,
      });
      res.status(400).json({ message: error.message });
    } else {
      logger.error("Password reset error", {
        context: "auth",
        error: error.message,
      });
      res.status(500).json({ message: "Failed to reset password" });
    }
  }
});

/**
 * POST /auth/validate-token - Validate JWT token
 * @route POST /auth/validate-token
 * @param {string} token - JWT token to validate
 * @returns {Object} Token validation result
 * @description Validates token without requiring authentication
 */
router.post("/validate-token", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ valid: false, message: "Token is required" });
  }

  try {
    const decoded = authService.validateToken(token);

    logger.debug("Token validated successfully", {
      context: "auth",
      userId: decoded.userId,
    });

    res.json({ valid: true, decoded });
  } catch (error) {
    logger.debug("Token validation failed", {
      context: "auth",
      error: error.message,
    });
    res.json({ valid: false, message: error.message });
  }
});

/**
 * GET /auth/debug-all-users - Development only: Get all users
 * @route GET /auth/debug-all-users
 * @returns {Array} List of all users (development only)
 * @description Development route for debugging - should be disabled in production
 */
router.get("/debug-all-users", async (req, res) => {
  // Security check: Disable in production
  if (process.env.NODE_ENV === "production") {
    logger.warn("Attempt to access debug-all-users in production", {
      context: "auth",
      ip: req.ip,
    });
    return res.status(403).json({ error: "Access forbidden in production" });
  }

  try {
    const users = await authService.getAllUsers();

    logger.debug("Debug route: Fetched all users", {
      context: "auth",
      userCount: users.length,
    });

    // Development console output (preserved from original)
    console.log(" EXACT USER DATA IN DATABASE:");
    users.forEach((user) => {
      console.log(
        `   ID: ${user.id}, Email: "${user.email}", Created: ${user.createdAt}`
      );
    });

    res.json(users);
  } catch (error) {
    logger.error("Error fetching users in debug route", {
      context: "auth",
      error: error.message,
    });
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Clean up Prisma connection on shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down auth service - cleaning up connections", {
    context: "auth",
  });
  try {
    await authService.cleanup();
    logger.info("Auth service cleanup completed", { context: "auth" });
  } catch (error) {
    logger.error("Error during auth service cleanup", {
      context: "auth",
      error: error.message,
    });
  }
  process.exit();
});

export { router as default };
