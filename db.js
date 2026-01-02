// db.js
// Database connection module for Prisma ORM with connection pooling and error handling
import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

/**
 * Database connection manager using Prisma ORM
 * Implements singleton pattern with connection pooling and error handling
 */
class Database {
  /**
   * @private
   */
  constructor() {
    if (Database.instance) {
      return Database.instance;
    }
    
    Database.instance = this;
    this.prisma = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 1000; // 1 second
    
    this.initialize();
  }

  /**
   * Initialize Prisma client with connection pooling configuration
   * @private
   */
  initialize() {
    try {
      // Create Prisma client with production-optimized configuration
      this.prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' 
          ? ['query', 'info', 'warn', 'error'] 
          : ['warn', 'error'], // Reduced logging in production
        errorFormat: 'minimal', // Minimal error formatting for production
      });

      logger.debug('Prisma client initialized successfully');
      
      // Set up connection event handlers
      this.setupEventHandlers();
      
    } catch (error) {
      logger.error('Failed to initialize Prisma client', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Set up Prisma client event handlers for connection monitoring
   * @private
   */
  setupEventHandlers() {
    if (!this.prisma) return;

    // Handle query events (only in development for performance)
    if (process.env.NODE_ENV === 'development') {
      this.prisma.$on('query', (event) => {
        logger.debug('Database query executed', {
          query: event.query,
          duration: `${event.duration}ms`,
          timestamp: event.timestamp
        });
      });
    }

    // Handle Prisma client lifecycle events
    this.prisma.$on('info', (event) => {
      logger.info('Database info event', { message: event.message });
    });

    this.prisma.$on('warn', (event) => {
      logger.warn('Database warning', { message: event.message });
    });

    this.prisma.$on('error', (event) => {
      logger.error('Database error event', { 
        message: event.message,
        target: event.target 
      });
    });
  }

  /**
   * Establish database connection with retry logic
   * @returns {Promise<PrismaClient>} Connected Prisma client instance
   * @throws {Error} If connection fails after maximum retries
   */
  async connect() {
    if (this.isConnected && this.prisma) {
      logger.debug('Database already connected, returning existing connection');
      return this.prisma;
    }

    try {
      logger.info('Establishing database connection...');
      
      // Test connection with a simple query
      await this.prisma.$queryRaw`SELECT 1`;
      
      this.isConnected = true;
      this.retryCount = 0;
      
      logger.info('Database connection established successfully');
      return this.prisma;
      
    } catch (error) {
      this.retryCount++;
      
      logger.error('Database connection failed', {
        attempt: this.retryCount,
        error: error.message,
        maxRetries: this.MAX_RETRIES
      });

      // Implement retry logic for transient failures
      if (this.retryCount < this.MAX_RETRIES) {
        const delay = this.RETRY_DELAY * Math.pow(2, this.retryCount - 1); // Exponential backoff
        
        logger.warn(`Retrying database connection in ${delay}ms...`, {
          attempt: this.retryCount,
          nextAttempt: this.retryCount + 1
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect(); // Recursive retry
      } else {
        const fatalError = new Error(`Failed to connect to database after ${this.MAX_RETRIES} attempts: ${error.message}`);
        logger.error('Database connection exhausted all retry attempts', {
          error: fatalError.message,
          originalError: error.message
        });
        throw fatalError;
      }
    }
  }

  /**
   * Gracefully disconnect from database
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.prisma || !this.isConnected) {
      logger.debug('No active database connection to disconnect');
      return;
    }

    try {
      logger.info('Disconnecting from database...');
      
      await this.prisma.$disconnect();
      this.isConnected = false;
      
      logger.info('Database disconnected gracefully');
      
    } catch (error) {
      logger.error('Error during database disconnection', {
        error: error.message,
        stack: error.stack
      });
      
      // Re-throw to allow caller to handle
      throw error;
    }
  }

  /**
   * Get the Prisma client instance
   * @returns {Promise<PrismaClient>} Connected Prisma client
   */
  async getClient() {
    return this.connect();
  }

  /**
   * Health check for database connection
   * @returns {Promise<Object>} Health status object
   */
  async healthCheck() {
    try {
      if (!this.prisma) {
        return {
          status: 'uninitialized',
          message: 'Prisma client not initialized',
          timestamp: new Date().toISOString()
        };
      }

      const startTime = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;

      return {
        status: 'healthy',
        message: 'Database connection is active',
        latency: `${latency}ms`,
        connected: this.isConnected,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      
      return {
        status: 'unhealthy',
        message: `Database connection failed: ${error.message}`,
        connected: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute a database transaction with automatic rollback on error
   * @param {Function} transactionFn - Transaction function receiving Prisma client
   * @returns {Promise<any>} Transaction result
   */
  async transaction(transactionFn) {
    const client = await this.getClient();
    
    try {
      logger.debug('Starting database transaction');
      
      const result = await client.$transaction(async (tx) => {
        return await transactionFn(tx);
      });
      
      logger.debug('Database transaction completed successfully');
      return result;
      
    } catch (error) {
      logger.error('Database transaction failed', {
        error: error.message,
        stack: error.stack
      });
      
      // Transaction automatically rolls back on error
      throw error;
    }
  }
}

// Create singleton instance
const database = new Database();

// Export the singleton instance and convenience methods
export default database;

/**
 * Convenience function to get Prisma client with automatic connection
 * @returns {Promise<PrismaClient>} Connected Prisma client
 */
export const getPrismaClient = async () => {
  return await database.getClient();
};

/**
 * Convenience function to disconnect from database
 * @returns {Promise<void>}
 */
export const disconnectDatabase = async () => {
  return await database.disconnect();
};

/**
 * Convenience function for health check
 * @returns {Promise<Object>} Health status
 */
export const checkDatabaseHealth = async () => {
  return await database.healthCheck();
};