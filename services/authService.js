// authService.js
// Authentication and user management service with security features and geolocation

import { PrismaClient } from "@prisma/client";
import axios from "axios";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import logger from "../logger.js";

/**
 * Service class for user authentication, authorization, and security management
 * Handles user registration, login, token management, and security features
 */
export class AuthService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Enhanced GeoIP function with multiple free services as fallback
   * @param {string} ip - IP address to geolocate
   * @returns {Promise<Object>} Geolocation data with city, country, region
   */
  async getGeoLocation(ip) {
    try {
      // Handle localhost and private IPs - default to Cape Town
      const privateIpRanges = [
        "127.0.0.1",
        "::1",
        "192.168.",
        "10.",
        "172.16.",
        "172.17.",
        "172.18.",
        "172.19.",
        "172.20.",
        "172.21.",
        "172.22.",
        "172.23.",
        "172.24.",
        "172.25.",
        "172.26.",
        "172.27.",
        "172.28.",
        "172.29.",
        "172.30.",
        "172.31.",
      ];

      // Check if IP is private/local
      const isPrivateIp = privateIpRanges.some((range) => ip.startsWith(range));
      if (isPrivateIp) {
        logger.debug("Local/private IP detected, using Cape Town as default", {
          ip,
        });
        return {
          city: "Cape Town",
          country_name: "South Africa",
          country_code: "ZA",
          region: "Western Cape",
        };
      }

      // Try multiple free IP geolocation services with fallback strategy
      const services = [
        { url: `https://ipapi.co/${ip}/json/`, name: "ipapi.co" },
        { url: `https://ipwho.is/${ip}`, name: "ipwho.is" },
        { url: `http://ip-api.com/json/${ip}`, name: "ip-api.com" },
      ];

      for (const service of services) {
        try {
          logger.debug(`Attempting geolocation service`, {
            service: service.name,
            ip,
          });
          const response = await axios.get(service.url, { timeout: 5000 });

          // Parse response based on service provider
          let geoData;
          switch (service.name) {
            case "ipapi.co":
              if (response.data && response.data.country_name) {
                geoData = {
                  city: response.data.city || "Unknown",
                  country_name: response.data.country_name,
                  country_code: response.data.country_code,
                  region: response.data.region,
                };
              }
              break;
            case "ipwho.is":
              if (response.data && response.data.country) {
                geoData = {
                  city: response.data.city || "Unknown",
                  country_name: response.data.country,
                  country_code: response.data.country_code,
                  region: response.data.region,
                };
              }
              break;
            case "ip-api.com":
              if (response.data && response.data.country) {
                geoData = {
                  city: response.data.city || "Unknown",
                  country_name: response.data.country,
                  country_code: response.data.countryCode,
                  region: response.data.regionName,
                };
              }
              break;
          }

          if (geoData) {
            logger.info("Geolocation successful", {
              service: service.name,
              ip,
              location: `${geoData.city}, ${geoData.country_name}`,
            });
            return geoData;
          }
        } catch (serviceError) {
          logger.warn(`Geolocation service failed`, {
            service: service.name,
            ip,
            error: serviceError.message,
          });
          continue; // Try next service
        }
      }

      logger.warn("All geolocation services failed", { ip });
      throw new Error("All geolocation services failed");
    } catch (error) {
      logger.warn("Geolocation failed, using default location", {
        ip,
        error: error.message,
      });
      // Return default location as fallback
      return {
        city: "Cape Town",
        country_name: "South Africa",
        country_code: "ZA",
        region: "Western Cape",
      };
    }
  }

  /**
   * Check if account is locked due to multiple failed login attempts
   * @param {Object} user - User object with lock status
   * @throws {Error} If account is locked
   */
  async checkAccountLock(user) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil - new Date()) / (1000 * 60)
      );
      logger.warn("Account lock check failed", {
        userId: user.id,
        lockedUntil: user.lockedUntil,
        minutesLeft,
      });
      throw new Error(
        `Account temporarily locked. Try again in ${minutesLeft} minutes.`
      );
    }
  }

  /**
   * Log security event for audit trail
   * @param {string|number} userId - User identifier
   * @param {string} action - Security action type
   * @param {string} ipAddress - Client IP address
   * @param {string} details - Event details
   * @param {number} riskScore - Risk assessment score (0-100)
   * @returns {Promise<Object>} Created security log
   */
  async logSecurityEvent(userId, action, ipAddress, details, riskScore = 0) {
    try {
      const log = await this.prisma.securityLog.create({
        data: {
          userId,
          action,
          ipAddress,
          details,
          riskScore,
          timestamp: new Date(),
        },
      });

      logger.http("Security event logged", {
        userId,
        action,
        ipAddress,
        riskScore,
        logId: log.id,
      });

      return log;
    } catch (error) {
      logger.error("Failed to log security event", {
        userId,
        action,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Register new user with initial account
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} [name] - Optional user name
   * @returns {Promise<Object>} Created user with accounts
   */
  async registerUser(email, password, name = null) {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Check if user exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        logger.warn("Registration attempt with existing email", {
          email: normalizedEmail,
        });
        throw new Error("Email already registered");
      }

      // Hash password with configurable salt rounds
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user with default account in a transaction
      const user = await this.prisma.$transaction(async (prisma) => {
        const newUser = await prisma.user.create({
          data: {
            email: normalizedEmail,
            password: hashedPassword,
            name: name || null,
          },
        });

        // Create default account for new user
        await prisma.account.create({
          data: {
            userId: newUser.id,
            name: "Main Account",
            balance: 0,
          },
        });

        return prisma.user.findUnique({
          where: { id: newUser.id },
          include: { accounts: true },
        });
      });

      // Log successful registration
      await this.logSecurityEvent(
        user.id,
        "registration_success",
        "127.0.0.1", // Registration typically from trusted source
        "New user registered",
        0
      );

      logger.info("User registered successfully", {
        userId: user.id,
        email: normalizedEmail,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          accounts: user.accounts,
        },
      };
    } catch (error) {
      logger.error("User registration failed", {
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Login user with enhanced security features
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} [clientIp='127.0.0.1'] - Client IP address
   * @returns {Promise<Object>} Authentication tokens and user data
   */
  async loginUser(email, password, clientIp = "127.0.0.1") {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Case-insensitive search (Prisma doesn't support case-insensitive email search natively)
      const allUsers = await this.prisma.user.findMany();
      const user = allUsers.find(
        (u) => u.email.toLowerCase() === normalizedEmail
      );

      if (!user) {
        logger.warn("Login attempt with non-existent email", {
          email: normalizedEmail,
          clientIp,
        });
        throw new Error("Invalid credentials");
      }

      // Check account lock status
      await this.checkAccountLock(user);

      // Validate password
      const valid = await bcrypt.compare(password, user.password);

      if (!valid) {
        // Handle failed login attempt
        const loginAttempts = (user.loginAttempts || 0) + 1;
        let lockedUntil = null;

        // Lock account after 5 failed attempts for 15 minutes
        if (loginAttempts >= 5) {
          lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          logger.warn("Account locked due to multiple failed attempts", {
            userId: user.id,
            loginAttempts,
            lockedUntil,
          });
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: { loginAttempts, lockedUntil },
        });

        // Log failed attempt with risk score
        await this.logSecurityEvent(
          user.id,
          "login_failed",
          clientIp,
          `Failed login attempt ${loginAttempts}/5`,
          20
        );

        logger.warn("Login failed - invalid password", {
          userId: user.id,
          clientIp,
          loginAttempts,
        });

        throw new Error("Invalid credentials");
      }

      // SUCCESSFUL LOGIN

      // Reset login attempts on successful login
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 0, lockedUntil: null },
      });

      // Get geolocation data for audit trail
      const geoData = await this.getGeoLocation(clientIp);

      // Update user with login location and timestamp
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          lastLoginIP: clientIp,
          lastLoginCity: geoData.city,
          lastLoginCountry: geoData.country_name,
        },
      });

      // Log successful login
      await this.logSecurityEvent(
        user.id,
        "login_success",
        clientIp,
        `Successful login from ${geoData.city}, ${geoData.country_name}`,
        0
      );

      // Generate JWT tokens with different expirations
      const accessToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d", // changed from '15m' to '7d' for development
        }
      );

      // Refresh token uses user-specific secret for added security
      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET + user.password,
        {
          expiresIn: "7d",
        }
      );

      logger.info("User login successful", {
        userId: user.id,
        clientIp,
        location: `${geoData.city}, ${geoData.country_name}`,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          lastLoginFrom: `${geoData.city}, ${geoData.country_name}`,
        },
      };
    } catch (error) {
      logger.error("User login failed", {
        email,
        clientIp,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Valid refresh token
   * @returns {Promise<Object>} New access token
   */
  async refreshToken(refreshToken) {
    try {
      if (!refreshToken) {
        throw new Error("Refresh token required");
      }

      // Decode token to get user ID without verification
      const decoded = jwt.decode(refreshToken);
      if (!decoded || !decoded.userId) {
        logger.warn("Invalid refresh token format");
        throw new Error("Invalid token");
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      if (!user) {
        logger.warn("Refresh token for non-existent user", {
          userId: decoded.userId,
        });
        throw new Error("User not found");
      }

      // Verify with user-specific secret (password changes invalidate refresh tokens)
      jwt.verify(refreshToken, process.env.JWT_SECRET + user.password);

      // Generate new access token
      const newAccessToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        {
          expiresIn: "15m",
        }
      );

      logger.info("Access token refreshed", { userId: user.id });

      return { accessToken: newAccessToken };
    } catch (error) {
      logger.error("Token refresh failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Get user profile with account information
   * @param {string|number} userId - User identifier
   * @returns {Promise<Object>} User profile data
   */
  async getUserProfile(userId) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          lastLogin: true,
          lastLoginCity: true,
          lastLoginCountry: true,
          isVerified: true,
          alertEmailEnabled: true,
          securityPreferences: true,
          accounts: {
            select: {
              id: true,
              name: true,
              balance: true,
              createdAt: true,
            },
          },
        },
      });

      if (!user) {
        logger.warn("User profile requested for non-existent user", { userId });
        throw new Error("User not found");
      }

      logger.debug("User profile retrieved", { userId });
      return user;
    } catch (error) {
      logger.error("Failed to get user profile", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update user profile with allowed fields
   * @param {string|number} userId - User identifier
   * @param {Object} updates - Profile updates
   * @returns {Promise<Object>} Updated user
   */
  async updateUserProfile(userId, updates) {
    try {
      // Only allow updates to specific fields for security
      const allowedUpdates = [
        "name",
        "securityPreferences",
        "alertEmailEnabled",
        "typicalLoginHours",
      ];
      const filteredUpdates = {};

      Object.keys(updates).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: filteredUpdates,
      });

      // Log profile update
      await this.logSecurityEvent(
        userId,
        "profile_updated",
        "127.0.0.1", // Could get actual IP if available
        `Updated fields: ${Object.keys(filteredUpdates).join(", ")}`,
        5
      );

      logger.info("User profile updated", {
        userId,
        updatedFields: Object.keys(filteredUpdates),
      });
      return updatedUser;
    } catch (error) {
      logger.error("Failed to update user profile", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Change user password with current password verification
   * @param {string|number} userId - User identifier
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Success response
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        logger.warn("Password change attempted for non-existent user", {
          userId,
        });
        throw new Error("User not found");
      }

      // Verify current password
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        logger.warn("Password change failed - incorrect current password", {
          userId,
        });
        throw new Error("Current password is incorrect");
      }

      // Hash new password
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      // Log password change event
      await this.logSecurityEvent(
        userId,
        "password_changed",
        "127.0.0.1", // Could get actual IP if available
        "User changed password",
        10
      );

      logger.info("Password changed successfully", { userId });
      return { success: true, message: "Password updated successfully" };
    } catch (error) {
      logger.error("Password change failed", { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Logout user and log security event
   * @param {string|number} userId - User identifier
   * @param {string} [clientIp='127.0.0.1'] - Client IP address
   * @returns {Promise<Object>} Success response
   */
  async logout(userId, clientIp = "127.0.0.1") {
    try {
      // Log logout event for audit trail
      await this.logSecurityEvent(
        userId,
        "logout",
        clientIp,
        "User logged out",
        0
      );

      logger.info("User logged out", { userId, clientIp });
      return { success: true, message: "Logged out successfully" };
    } catch (error) {
      logger.error("Logout event logging failed", {
        userId,
        error: error.message,
      });
      // Don't throw error for logout as it's client-side primarily
      return { success: true, message: "Logged out successfully" };
    }
  }

  /**
   * Debug: Get all users (for development/admin only)
   * @returns {Promise<Array>} List of users without sensitive data
   */
  async getAllUsers() {
    try {
      const users = await this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          createdAt: true,
          lastLogin: true,
          loginAttempts: true,
          lockedUntil: true,
        },
      });

      logger.debug("All users retrieved for debug/admin", {
        count: users.length,
      });
      return users;
    } catch (error) {
      logger.error("Failed to get all users", { error: error.message });
      throw error;
    }
  }

  /**
   * Validate JWT token
   * @param {string} token - JWT token to validate
   * @returns {Object} Decoded token payload
   */
  validateToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.debug("Token validated successfully", { userId: decoded.userId });
      return decoded;
    } catch (error) {
      logger.warn("Token validation failed", { error: error.message });
      throw new Error("Invalid token");
    }
  }

  /**
   * Generate password reset token and log request
   * @param {string} email - User email
   * @returns {Promise<Object>} Reset token response
   */
  async generatePasswordResetToken(email) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user) {
        // Security: Don't reveal if user exists
        logger.info(
          "Password reset requested for non-existent email (security)",
          { email: normalizedEmail }
        );
        return {
          success: true,
          message: "If an account exists, a reset email has been sent",
        };
      }

      // Create reset token with user-specific secret (invalidates on password change)
      const resetToken = jwt.sign(
        { userId: user.id, purpose: "password_reset" },
        process.env.JWT_SECRET + user.password,
        { expiresIn: "1h" }
      );

      // In production: Send email with reset link
      // For development: Return token in development mode only
      const shouldReturnToken =
        process.env.NODE_ENV === "development" ||
        process.env.NODE_ENV === "test";

      // Log reset request
      await this.logSecurityEvent(
        user.id,
        "password_reset_requested",
        "127.0.0.1",
        "Password reset requested",
        20
      );

      logger.info("Password reset token generated", {
        userId: user.id,
        email: normalizedEmail,
      });

      return {
        success: true,
        message: "Password reset instructions sent to email",
        // Only return token in development/test environments
        resetToken: shouldReturnToken ? resetToken : undefined,
      };
    } catch (error) {
      logger.error("Password reset token generation failed", {
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Reset password using valid reset token
   * @param {string} token - Password reset token
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Success response
   */
  async resetPasswordWithToken(token, newPassword) {
    try {
      let decoded;
      try {
        decoded = jwt.decode(token);
        // Validate token structure and purpose
        if (!decoded || decoded.purpose !== "password_reset") {
          logger.warn("Invalid reset token format or purpose", {
            token: token.substring(0, 20),
          });
          throw new Error("Invalid token");
        }
      } catch (error) {
        throw new Error("Invalid token");
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        logger.warn("Password reset attempted for non-existent user", {
          userId: decoded.userId,
        });
        throw new Error("User not found");
      }

      // Verify token with user-specific secret
      jwt.verify(token, process.env.JWT_SECRET + user.password);

      // Hash new password
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      // Log password reset completion
      await this.logSecurityEvent(
        user.id,
        "password_reset_completed",
        "127.0.0.1",
        "Password reset completed",
        30
      );

      logger.info("Password reset successfully", { userId: user.id });
      return { success: true, message: "Password reset successfully" };
    } catch (error) {
      logger.error("Password reset failed", { error: error.message });
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
      logger.debug("AuthService cleanup completed");
    } catch (error) {
      logger.error("AuthService cleanup failed", { error: error.message });
      throw error;
    }
  }
}

// Note: The logger configuration is in a separate file (logger.js)
// and is imported at the top of this file
