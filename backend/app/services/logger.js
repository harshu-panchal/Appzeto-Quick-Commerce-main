/**
 * Structured Logging Service
 * 
 * Provides structured JSON logging with correlation tracking, log level filtering,
 * and automatic sanitization of sensitive data.
 * 
 * @module services/logger
 */

import { AsyncLocalStorage } from 'async_hooks';
import processRole from '../core/processRole.js';

const { getProcessRole } = processRole;

// AsyncLocalStorage for request context (correlation ID)
const asyncLocalStorage = new AsyncLocalStorage();

// Log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /secret/i,
  /authorization/i,
  /bearer/i,
  /otp/i,
  /pin/i,
  /signature/i,
  /cookie/i,
  /privatekey/i,
];

/**
 * Get current log level from environment
 * @returns {number}
 */
function getCurrentLogLevel() {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.info;
}

/**
 * Get correlation ID from async context
 * @returns {string|undefined}
 */
function getCorrelationId() {
  const store = asyncLocalStorage.getStore();
  return store?.correlationId;
}

/**
 * Set correlation ID in async context
 * @param {string} correlationId
 * @param {Function} callback
 */
function runWithCorrelationId(correlationId, callback) {
  asyncLocalStorage.run({ correlationId }, callback);
}

/**
 * Sanitize sensitive data from logs
 * @param {*} data - Data to sanitize
 * @returns {*} Sanitized data
 */
function sanitize(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitize(item));
  }
  
  const sanitized = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Check if key matches sensitive patterns
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      // Mask credit card numbers (keep last 4 digits)
      const ccPattern = /\b\d{13,19}\b/g;
      let maskedValue = value.replace(ccPattern, (match) => {
        return '*'.repeat(match.length - 4) + match.slice(-4);
      });
      
      // Mask phone numbers (keep first 3 and last 2 digits)
      const phonePattern = /\b\d{10,15}\b/g;
      maskedValue = maskedValue.replace(phonePattern, (match) => {
        if (match.length >= 5) {
          return match.slice(0, 3) + '*'.repeat(match.length - 5) + match.slice(-2);
        }
        return match;
      });
      
      sanitized[key] = maskedValue;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Format log entry as structured JSON
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 * @returns {Object}
 */
function formatLogEntry(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId: getCorrelationId(),
    role: getProcessRole(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  // Add context if provided
  if (context && Object.keys(context).length > 0) {
    entry.context = sanitize(context);
  }
  
  return entry;
}

/**
 * Log with structured format
 * @param {string} level - Log level (error, warn, info, debug)
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 */
function log(level, message, context = {}) {
  const currentLevel = getCurrentLogLevel();
  const messageLevel = LOG_LEVELS[level];
  
  // Filter out logs below current level
  if (messageLevel === undefined || messageLevel > currentLevel) {
    return;
  }
  
  const entry = formatLogEntry(level, message, context);
  
  // Output as JSON
  const output = JSON.stringify(entry);
  
  // Use appropriate console method
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/**
 * Log error message
 * @param {string} message - Error message
 * @param {Object} context - Additional context (can include error object)
 */
function error(message, context = {}) {
  // If context contains an Error object, extract details
  if (context.error instanceof Error) {
    context.error = {
      message: context.error.message,
      code: context.error.code,
      stack: context.error.stack
    };
  }
  
  log('error', message, context);
}

/**
 * Log warning message
 * @param {string} message - Warning message
 * @param {Object} context - Additional context
 */
function warn(message, context = {}) {
  log('warn', message, context);
}

/**
 * Log info message
 * @param {string} message - Info message
 * @param {Object} context - Additional context
 */
function info(message, context = {}) {
  log('info', message, context);
}

/**
 * Log debug message
 * @param {string} message - Debug message
 * @param {Object} context - Additional context
 */
function debug(message, context = {}) {
  log('debug', message, context);
}

/**
 * Create child logger with persistent context
 * @param {Object} persistentContext - Context to include in all logs
 * @returns {Object} Child logger with same methods
 */
function child(persistentContext = {}) {
  return {
    log: (level, message, context = {}) => 
      log(level, message, { ...persistentContext, ...context }),
    error: (message, context = {}) => 
      error(message, { ...persistentContext, ...context }),
    warn: (message, context = {}) => 
      warn(message, { ...persistentContext, ...context }),
    info: (message, context = {}) => 
      info(message, { ...persistentContext, ...context }),
    debug: (message, context = {}) => 
      debug(message, { ...persistentContext, ...context }),
    child: (additionalContext = {}) => 
      child({ ...persistentContext, ...additionalContext })
  };
}

const logger = {
  log,
  error,
  warn,
  info,
  debug,
  child,
  sanitize,
  runWithCorrelationId,
  getCorrelationId,
  LOG_LEVELS
};

export {
  log,
  error,
  warn,
  info,
  debug,
  child,
  sanitize,
  runWithCorrelationId,
  getCorrelationId,
  LOG_LEVELS
};

export default logger;
