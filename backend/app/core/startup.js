/**
 * Startup Orchestration Module
 * 
 * Coordinates application startup sequence with dependency validation,
 * retry logic, and structured logging.
 * 
 * @module core/startup
 */

import mongoose from 'mongoose';
import { getProcessRole, isComponentEnabled, validateProcessRole } from './processRole.js';
import { isRedisEnabled, getRedisClient, waitForRedis } from '../config/redis.js';
import { createAllIndexes } from '../services/databaseIndexManager.js';
import { startSearchIndexWorker } from '../services/searchSyncService.js';

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Overall validation status
 * @property {Object} checks - Individual check results
 * @property {Array<string>} errors - List of validation errors
 */

/**
 * Validate all required dependencies based on process role and environment
 * @returns {Promise<ValidationResult>}
 */
async function validateDependencies() {
  const result = {
    valid: true,
    checks: {},
    errors: []
  };
  
  const isProduction = process.env.NODE_ENV === 'production';
  const role = getProcessRole();

  if (isProduction && role === "all") {
    result.valid = false;
    result.errors.push("PROCESS_ROLE=all (or legacy APP_ROLE=all) is not allowed in production. Use api, worker, or scheduler.");
  }

  const hasAppRole = Boolean(process.env.APP_ROLE && String(process.env.APP_ROLE).trim());
  const hasProcessRole = Boolean(process.env.PROCESS_ROLE && String(process.env.PROCESS_ROLE).trim());
  if (hasAppRole && hasProcessRole) {
    const appRole = String(process.env.APP_ROLE).toLowerCase().trim();
    const processRole = String(process.env.PROCESS_ROLE).toLowerCase().trim();
    if (appRole !== processRole) {
      result.checks.processRole = {
        status: "WARN",
        message: `Both APP_ROLE (${appRole}) and PROCESS_ROLE (${processRole}) are set; PROCESS_ROLE takes precedence.`,
      };
    }
  }
  
  // Validate MongoDB connection
  try {
    if (mongoose.connection.readyState === 1) {
      result.checks.mongodb = { status: 'UP', message: 'Connected' };
    } else {
      result.checks.mongodb = { status: 'DOWN', message: 'Not connected' };
      result.valid = false;
      result.errors.push('MongoDB is not connected');
    }
  } catch (error) {
    result.checks.mongodb = { status: 'DOWN', message: error.message };
    result.valid = false;
    result.errors.push(`MongoDB validation failed: ${error.message}`);
  }
  
  // Validate Redis connection (mandatory in production)
  try {
    if (isRedisEnabled()) {
      const client = getRedisClient();
      if (client && client.status === 'ready') {
        result.checks.redis = { status: 'UP', message: 'Connected' };
      } else {
        result.checks.redis = { status: 'DOWN', message: 'Not ready' };
        if (isProduction) {
          result.valid = false;
          result.errors.push('Redis is required in production but not ready');
        }
      }
    } else {
      result.checks.redis = { status: 'DISABLED', message: 'Redis is disabled' };
      if (isProduction) {
        result.valid = false;
        result.errors.push('Redis is required in production mode');
      }
    }
  } catch (error) {
    result.checks.redis = { status: 'ERROR', message: error.message };
    if (isProduction) {
      result.valid = false;
      result.errors.push(`Redis validation failed: ${error.message}`);
    }
  }
  
  // Validate required environment variables
  const requiredVars = [];
  const hasMongoUri = Boolean(
    String(
      process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        "",
    ).trim(),
  );
  if (!hasMongoUri) {
    result.valid = false;
    result.errors.push('Required environment variable MONGO_URI is not set (or set MONGODB_URI / DATABASE_URL)');
  }
  
  if (isProduction) {
    requiredVars.push('JWT_SECRET');
    
    // Check for security defaults that should be overridden
    if (process.env.JWT_SECRET === 'your-secret-key' || 
        process.env.JWT_SECRET === 'default-secret') {
      result.valid = false;
      result.errors.push('JWT_SECRET must be overridden in production (not using default value)');
    }
  }
  
  if (isComponentEnabled('http')) {
    const port = parseInt(process.env.PORT || '7000', 10);
    if (port < 1024 || port > 65535) {
      result.valid = false;
      result.errors.push(`Invalid PORT value: ${port}. Must be between 1024 and 65535`);
    }
  }
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      result.valid = false;
      result.errors.push(`Required environment variable ${varName} is not set`);
    }
  }
  
  return result;
}

/**
 * Log startup information with configuration summary
 */
function logStartupInfo() {
  const role = getProcessRole();
  const env = process.env.NODE_ENV || 'development';
  const components = {
    http: isComponentEnabled('http'),
    worker: isComponentEnabled('worker'),
    scheduler: isComponentEnabled('scheduler')
  };
  
  console.log('='.repeat(60));
  console.log('🚀 Application Starting');
  console.log('='.repeat(60));
  console.log(`Environment: ${env}`);
  console.log(`Process Role: ${role}`);
  console.log(`Components Enabled:`);
  console.log(`  - HTTP Server: ${components.http ? '✓' : '✗'}`);
  console.log(`  - Queue Worker: ${components.worker ? '✓' : '✗'}`);
  console.log(`  - Scheduler: ${components.scheduler ? '✓' : '✗'}`);
  console.log(`Redis: ${isRedisEnabled() ? 'Enabled' : 'Disabled'}`);
  console.log(`MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  console.log('='.repeat(60));
}

/**
 * Connect to MongoDB with retry logic
 * @param {number} maxRetries - Maximum retry attempts (default: 5)
 * @returns {Promise<void>}
 */
async function connectMongoDB(maxRetries = 5) {
  const mongoUri = String(
    process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.DATABASE_URL ||
      "",
  ).trim();
  const connectTimeout = parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || '10000', 10);
  
  if (!mongoUri) {
    throw new Error('MONGO_URI environment variable is required (or set MONGODB_URI / DATABASE_URL)');
  }
  
  // If already connected, return
  if (mongoose.connection.readyState === 1) {
    return;
  }
  
  const options = {
    serverSelectionTimeoutMS: connectTimeout,
    socketTimeoutMS: 45000,
  };
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(mongoUri, options);
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      if (isLastAttempt) {
        throw new Error(
          `Failed to connect to MongoDB after ${maxRetries} attempts: ${error.message}`
        );
      }
      
      const delay = Math.min(1000 * attempt, 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Execute startup sequence with dependency checks
 * @returns {Promise<void>}
 * @throws {Error} if any dependency check fails
 */
async function startup() {
  try {
    console.log('[Startup] Beginning startup sequence...');
  
    // Step 1: Validate process role configuration
    validateProcessRole();
    const role = getProcessRole();
    
    // Step 2: Connect to MongoDB
    const maxMongoRetries = parseInt(process.env.MONGO_MAX_RETRIES || '5', 10);
    await connectMongoDB(maxMongoRetries);
    
    // Step 3: Connect to Redis (if enabled)
    if (isRedisEnabled()) {
      await waitForRedis();
    }
    
    // Step 4: Validate all dependencies
    const validation = await validateDependencies();
    
    if (!validation.valid) {
      console.error('[Startup] Dependency validation failed:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Startup validation failed: ' + validation.errors.join('; '));
    }
    
    // Step 6: Create database indexes
    try {
      await createAllIndexes();
    } catch (error) {
      console.error('[Startup] Warning: Failed to create indexes:', error.message);
    }
    
    // Step 7: Start search index worker (if worker role)
    if (isComponentEnabled('worker')) {
      try {
        await startSearchIndexWorker();
      } catch (error) {
        console.error('[Startup] Warning: Failed to start search index worker:', error.message);
      }
    }

    // Step 8: Subscribe to cache invalidation events
    if (isRedisEnabled() && isComponentEnabled('http')) {
      try {
        const { subscribeToInvalidations } = await import('../services/cacheService.js');
        await subscribeToInvalidations(() => {});
      } catch (error) {
        console.error('[Startup] Warning: Failed to subscribe to cache invalidations:', error.message);
      }
    }

    // Step 9: Warm dashboard summaries
    if (isComponentEnabled('worker') && process.env.DASHBOARD_SUMMARIES_ENABLED !== 'false') {
      try {
        const { refreshAllSummaries } = await import('../services/dashboardSummaryService.js');
        refreshAllSummaries().catch(err =>
          console.error('[Startup] Warning: Dashboard summary warm-up failed:', err.message)
        );
      } catch (error) {
        console.error('[Startup] Warning: Failed to initiate dashboard warm-up:', error.message);
      }
    }

    // Step 10: Log startup information
    logStartupInfo();
    
    console.log('[Startup] Startup sequence completed successfully');
    
  } catch (error) {
    console.error('[Startup] FATAL: Startup failed:', error.message);
    throw error;
  }
}

export {
  startup,
  validateDependencies,
  logStartupInfo,
  connectMongoDB
};

export default startup;
