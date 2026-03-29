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
    result.errors.push("APP_ROLE=all is not allowed in production. Use api, worker, or scheduler.");
  }

  if (
    process.env.APP_ROLE &&
    process.env.PROCESS_ROLE &&
    String(process.env.APP_ROLE).toLowerCase() !== String(process.env.PROCESS_ROLE).toLowerCase()
  ) {
    result.valid = false;
    result.errors.push("APP_ROLE and PROCESS_ROLE are both set but have different values.");
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
  const requiredVars = ['MONGO_URI'];
  
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
  const mongoUri = process.env.MONGO_URI;
  const connectTimeout = parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || '10000', 10);
  
  if (!mongoUri) {
    throw new Error('MONGO_URI environment variable is required');
  }
  
  // If already connected, return
  if (mongoose.connection.readyState === 1) {
    console.log('[MongoDB] Already connected');
    return;
  }
  
  const options = {
    serverSelectionTimeoutMS: connectTimeout,
    socketTimeoutMS: 45000,
  };
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[MongoDB] Connection attempt ${attempt}/${maxRetries}...`);
      await mongoose.connect(mongoUri, options);
      console.log('[MongoDB] Connected successfully');
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      if (isLastAttempt) {
        throw new Error(
          `Failed to connect to MongoDB after ${maxRetries} attempts: ${error.message}`
        );
      }
      
      const delay = Math.min(1000 * attempt, 5000);
      console.log(
        `[MongoDB] Connection attempt ${attempt}/${maxRetries} failed: ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );
      
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
    console.log('[Startup] Step 1: Validating process role...');
    validateProcessRole();
    const role = getProcessRole();
    console.log(`[Startup] Process role validated: ${role}`);
    
    // Step 2: Connect to MongoDB
    console.log('[Startup] Step 2: Connecting to MongoDB...');
    const maxMongoRetries = parseInt(process.env.MONGO_MAX_RETRIES || '5', 10);
    await connectMongoDB(maxMongoRetries);
    
    // Step 3: Connect to Redis (if enabled)
    if (isRedisEnabled()) {
      console.log('[Startup] Step 3: Connecting to Redis...');
      await waitForRedis();
    } else {
      console.log('[Startup] Step 3: Redis is disabled, skipping...');
    }
    
    // Step 4: Validate all dependencies
    console.log('[Startup] Step 4: Validating dependencies...');
    const validation = await validateDependencies();
    
    if (!validation.valid) {
      console.error('[Startup] Dependency validation failed:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Startup validation failed: ' + validation.errors.join('; '));
    }
    
    console.log('[Startup] All dependencies validated successfully');
    
    // Step 6: Create database indexes
    console.log('[Startup] Step 6: Creating database indexes...');
    try {
      await createAllIndexes();
      console.log('[Startup] Database indexes created successfully');
    } catch (error) {
      console.error('[Startup] Warning: Failed to create indexes:', error.message);
      // Don't fail startup if index creation fails - indexes can be created later
    }
    
    // Step 7: Start search index worker (if worker role)
    if (isComponentEnabled('worker')) {
      console.log('[Startup] Step 7: Starting search index worker...');
      try {
        await startSearchIndexWorker();
        console.log('[Startup] Search index worker started successfully');
      } catch (error) {
        console.error('[Startup] Warning: Failed to start search index worker:', error.message);
      }
    } else {
      console.log('[Startup] Step 7: Skipping search index worker (not a worker process)');
    }

    // Step 8: Subscribe to cache invalidation events (Phase 2)
    if (isRedisEnabled() && isComponentEnabled('http')) {
      console.log('[Startup] Step 8: Subscribing to cache invalidation events...');
      try {
        const { subscribeToInvalidations } = await import('../services/cacheService.js');
        await subscribeToInvalidations((data) => {
          console.log(`[Cache] Invalidation received: ${data.key}`);
        });
        console.log('[Startup] Cache invalidation subscription active');
      } catch (error) {
        console.error('[Startup] Warning: Failed to subscribe to cache invalidations:', error.message);
      }
    }

    // Step 9: Warm dashboard summaries (Phase 2 - worker role only)
    if (isComponentEnabled('worker') && process.env.DASHBOARD_SUMMARIES_ENABLED !== 'false') {
      console.log('[Startup] Step 9: Warming dashboard summaries...');
      try {
        const { refreshAllSummaries } = await import('../services/dashboardSummaryService.js');
        // Fire-and-forget: don't block startup
        refreshAllSummaries().catch(err =>
          console.error('[Startup] Warning: Dashboard summary warm-up failed:', err.message)
        );
        console.log('[Startup] Dashboard summary warm-up initiated');
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
