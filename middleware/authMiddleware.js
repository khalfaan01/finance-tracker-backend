// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import logger, { authLogger } from '../logger.js';

// In-memory token blacklist (use Redis in production for scalability and persistence)
const tokenBlacklist = new Set();

/**
 * JWT authentication middleware
 * Verifies access tokens and attaches user data to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  // Production logging - structured and concise
  authLogger.attempt({
    component: 'authMiddleware',
    ip: req.ip,
    method: req.method,
    endpoint: req.url,
    hasAuthHeader: !!authHeader,
    tokenPresent: !!token,
    tokenPrefix: token ? `${token.substring(0, 10)}...` : null,
    userAgent: req.headers['user-agent']
  });

  // No token provided
  if (!token) {
    authLogger.failed({
      component: 'authMiddleware',
      reason: 'no_token_provided',
      ip: req.ip,
      endpoint: req.url,
      method: req.method
    });
    return res.status(401).json({ error: "Access token required" });
  }

  // Check if token is blacklisted (revoked)
  if (tokenBlacklist.has(token)) {
    authLogger.failed({
      component: 'authMiddleware',
      reason: 'token_revoked',
      ip: req.ip,
      tokenPrefix: `${token.substring(0, 10)}...`,
      endpoint: req.url
    });
    return res.status(403).json({ error: "Token revoked" });
  }

  // Verify JWT token
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // Handle specific JWT errors with appropriate logging
      let errorReason = 'invalid_token';
      let statusCode = 403;
      
      if (err.name === 'TokenExpiredError') {
        errorReason = 'token_expired';
        authLogger.failed({
          component: 'authMiddleware',
          reason: errorReason,
          ip: req.ip,
          tokenPrefix: `${token.substring(0, 10)}...`,
          expiresAt: err.expiredAt,
          endpoint: req.url
        });
        return res.status(statusCode).json({ error: "Token expired" });
      }
      
      if (err.name === 'JsonWebTokenError') {
        errorReason = 'jwt_error';
        authLogger.error({
          component: 'authMiddleware',
          event: 'authentication_failed',
          reason: errorReason,
          ip: req.ip,
          tokenPrefix: `${token.substring(0, 10)}...`,
          errorName: err.name,
          errorMessage: err.message,
          note: 'Possible causes: Invalid signature, malformed token, or secret mismatch',
          endpoint: req.url
        });
      } else {
        authLogger.error({
          component: 'authMiddleware',
          event: 'authentication_failed',
          reason: 'verification_error',
          ip: req.ip,
          errorName: err.name,
          errorMessage: err.message,
          endpoint: req.url
        });
      }
      
      return res.status(statusCode).json({ error: "Invalid token" });
    }

    // Authentication successful
    req.user = user; // Attach user data to request object
    
    authLogger.success({
      component: 'authMiddleware',
      userId: user.userId || user.id || 'unknown',
      ip: req.ip,
      method: req.method,
      endpoint: req.url,
      userRole: user.role || 'user', // Log role if present in token
      userEmail: user.email || 'unknown'
    });

    next(); // Proceed to next middleware/route handler
  });
};

/**
 * Revokes a token by adding it to the blacklist
 * @param {string} token - JWT token to revoke
 */
export const revokeToken = (token) => {
  if (!token) {
    authLogger.failed({
      component: 'authMiddleware',
      event: 'revoke_token_failed',
      reason: 'no_token_provided'
    });
    return;
  }

  tokenBlacklist.add(token);
  
  authLogger.revoked({
    component: 'authMiddleware',
    tokenPrefix: `${token.substring(0, 10)}...`,
    blacklistSize: tokenBlacklist.size
  });

  // Auto-cleanup: Remove token from blacklist after 24 hours
  setTimeout(() => {
    if (tokenBlacklist.has(token)) {
      tokenBlacklist.delete(token);
      authLogger.debug({
        component: 'authMiddleware',
        event: 'token_cleanup',
        tokenPrefix: `${token.substring(0, 10)}...`,
        note: 'Token removed from blacklist after TTL',
        blacklistSize: tokenBlacklist.size
      });
    }
  }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
};

/**
 * Middleware to require admin privileges
 * Must be used after authenticateToken middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const requireAdmin = (req, res, next) => {
  // Ensure user is authenticated first
  if (!req.user) {
    authLogger.error({
      component: 'authMiddleware',
      event: 'admin_check_failed',
      reason: 'user_not_authenticated',
      ip: req.ip,
      endpoint: req.url,
      method: req.method
    });
    return res.status(401).json({ error: "Authentication required" });
  }

  // Check admin privilege
  if (!req.user.isAdmin) {
    authLogger.failed({
      component: 'authMiddleware',
      event: 'authorization_failed',
      reason: 'insufficient_privileges',
      userId: req.user.userId || req.user.id || 'unknown',
      ip: req.ip,
      endpoint: req.url,
      method: req.method,
      requiredRole: 'admin',
      userRole: req.user.role || 'user',
      userEmail: req.user.email || 'unknown'
    });
    return res.status(403).json({ error: "Admin access required" });
  }

  authLogger.adminAccess({
    component: 'authMiddleware',
    userId: req.user.userId || req.user.id || 'unknown',
    ip: req.ip,
    endpoint: req.url,
    method: req.method,
    userEmail: req.user.email || 'unknown'
  });
  
  next();
};

// Export for testing/debugging purposes
export const getBlacklistSize = () => tokenBlacklist.size;