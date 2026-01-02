// logger.js — Unified Production + Security + Development Logger
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for console (development)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Development console formatting
const devConsoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    return `${info.timestamp} ${info.level}: ${info.message}`;
  })
);

// JSON format for production logs
const prodJsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }), // include stack traces
  winston.format.json()
);

// Logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "info"),
  levels,
  format: prodJsonFormat,
  defaultMeta: { service: "fintech-app-service" },
  transports: [
    // Console for development
    new winston.transports.Console({
      format: process.env.NODE_ENV === "production" ? prodJsonFormat : devConsoleFormat,
      silent: process.env.NODE_ENV === "test",
    }),

    // Error logs
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "error.log"),
      level: "error",
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),

    // Combined logs
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),

    // Auth / security logs
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "auth.log"),
      level: "http",  // suitable for login attempts and security events
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],

  // Exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "exceptions.log"),
    }),
  ],

  // Promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "rejections.log"),
    }),
  ],

  exitOnError: false,
});

// Morgan/HTTP stream
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

// AUTH LOGGER (security-focused audit logging)
export const authLogger = {
  attempt: (info) => logger.http(`Auth attempt: ${JSON.stringify(info)}`),
  success: (info) => logger.info(`Auth success: ${JSON.stringify(info)}`),
  failed: (info) => logger.warn(`Auth failed: ${JSON.stringify(info)}`),
  error: (info) => logger.error(`Auth error: ${JSON.stringify(info)}`),
  revoked: (info) => logger.info(`Token revoked: ${JSON.stringify(info)}`),
  adminAccess: (info) => logger.info(`Admin access: ${JSON.stringify(info)}`),
  debug: (info) => logger.debug(`Auth debug: ${JSON.stringify(info)}`),
};

export default logger;