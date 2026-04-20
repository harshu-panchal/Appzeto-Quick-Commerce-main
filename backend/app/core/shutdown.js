/**
 * Graceful Shutdown Manager
 * 
 * Coordinates graceful shutdown of all application components including
 * HTTP server, database connections, Redis, Bull queues, and Socket.IO.
 * 
 * @module core/shutdown
 */

import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis.js';

let _isShuttingDown = false;
let _httpServer = null;
let _socketIO = null;
let _bullQueues = [];
let _schedulerStopper = null;

/**
 * Register HTTP server for graceful shutdown
 * @param {Object} server - HTTP server instance
 */
function registerHttpServer(server) {
  _httpServer = server;
}

/**
 * Register Socket.IO instance for graceful shutdown
 * @param {Object} io - Socket.IO instance
 */
function registerSocketIO(io) {
  _socketIO = io;
}

/**
 * Register Bull queue for graceful shutdown
 * @param {Object} queue - Bull queue instance
 */
function registerBullQueue(queue) {
  if (queue && !_bullQueues.includes(queue)) {
    _bullQueues.push(queue);
  }
}

/**
 * Register scheduler stop callback for graceful shutdown
 * @param {Function} stopper - Async function to stop scheduler jobs
 */
function registerSchedulerStopper(stopper) {
  if (typeof stopper === "function") {
    _schedulerStopper = stopper;
  }
}

/**
 * Check if shutdown is in progress
 * @returns {boolean}
 */
function isShuttingDown() {
  return _isShuttingDown;
}

/**
 * Close HTTP server gracefully
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function closeHttpServer(timeout) {
  if (!_httpServer) {
    console.log('[Shutdown] No HTTP server to close');
    return;
  }
  
  return new Promise((resolve) => {
    console.log('[Shutdown] Closing HTTP server...');
    
    const timeoutHandle = setTimeout(() => {
      console.warn('[Shutdown] HTTP server close timeout exceeded, forcing close');
      resolve();
    }, timeout);
    
    _httpServer.close((err) => {
      clearTimeout(timeoutHandle);
      if (err) {
        console.error('[Shutdown] Error closing HTTP server:', err.message);
      } else {
        console.log('[Shutdown] HTTP server closed successfully');
      }
      resolve();
    });
  });
}

/**
 * Close Socket.IO connections gracefully
 * @returns {Promise<void>}
 */
async function closeSocketIO() {
  if (!_socketIO) {
    console.log('[Shutdown] No Socket.IO instance to close');
    return;
  }
  
  return new Promise((resolve) => {
    console.log('[Shutdown] Closing Socket.IO connections...');
    
    try {
      // Notify all connected clients
      _socketIO.emit('server_shutdown', { message: 'Server is shutting down' });
      
      const timeoutHandle = setTimeout(() => {
        console.warn('[Shutdown] Socket.IO close timeout, forcing close');
        resolve();
      }, 5000);

      // Close all connections
      _socketIO.close(() => {
        clearTimeout(timeoutHandle);
        console.log('[Shutdown] Socket.IO closed successfully');
        resolve();
      });
    } catch (error) {
      console.error('[Shutdown] Error closing Socket.IO:', error.message);
      resolve();
    }
  });
}

/**
 * Close Bull queue connections gracefully
 * @returns {Promise<void>}
 */
async function closeBullQueues() {
  if (_bullQueues.length === 0) {
    console.log('[Shutdown] No Bull queues to close');
    return;
  }
  
  console.log(`[Shutdown] Closing ${_bullQueues.length} Bull queue(s)...`);
  
  const closePromises = _bullQueues.map(async (queue) => {
    try {
      // Pause the queue to stop accepting new jobs
      await queue.pause(true, true);
      console.log(`[Shutdown] Queue "${queue.name}" paused`);
      
      // Wait for active jobs to complete (with timeout)
      const activeJobs = await queue.getActive();
      if (activeJobs.length > 0) {
        console.log(`[Shutdown] Waiting for ${activeJobs.length} active job(s) in queue "${queue.name}"...`);
      }
      
      // Close the queue
      await queue.close();
      console.log(`[Shutdown] Queue "${queue.name}" closed successfully`);
    } catch (error) {
      console.error(`[Shutdown] Error closing queue "${queue.name}":`, error.message);
    }
  });
  
  await Promise.all(closePromises);
}

/**
 * Close Redis connection gracefully
 * @returns {Promise<void>}
 */
async function closeRedis() {
  const client = getRedisClient();
  if (!client) {
    console.log('[Shutdown] No Redis client to close');
    return;
  }
  
  console.log('[Shutdown] Closing Redis connection...');
  
  try {
    // Try graceful quit first
    await Promise.race([
      client.quit(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Quit timeout')), 5000)
      )
    ]);
    console.log('[Shutdown] Redis connection closed gracefully');
  } catch (error) {
    console.warn('[Shutdown] Redis quit failed, forcing disconnect:', error.message);
    try {
      await client.disconnect();
      console.log('[Shutdown] Redis disconnected forcefully');
    } catch (disconnectError) {
      console.error('[Shutdown] Error disconnecting Redis:', disconnectError.message);
    }
  }
}

/**
 * Close MongoDB connection gracefully
 * @returns {Promise<void>}
 */
async function closeMongoDB() {
  if (mongoose.connection.readyState === 0) {
    console.log('[Shutdown] MongoDB already disconnected');
    return;
  }
  
  console.log('[Shutdown] Closing MongoDB connection...');
  
  try {
    await mongoose.connection.close(false);
    console.log('[Shutdown] MongoDB connection closed successfully');
  } catch (error) {
    console.error('[Shutdown] Error closing MongoDB connection:', error.message);
  }
}

/**
 * Execute graceful shutdown sequence
 * @param {string} signal - Signal that triggered shutdown (SIGTERM, SIGINT, etc.)
 * @returns {Promise<void>}
 */
async function gracefulShutdown(signal) {
  if (_isShuttingDown) {
    console.log('[Shutdown] Shutdown already in progress, ignoring signal:', signal);
    return;
  }
  
  _isShuttingDown = true;
  console.log('='.repeat(60));
  console.log(`[Shutdown] Received ${signal}, starting graceful shutdown...`);
  console.log('='.repeat(60));
  
  const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '15000', 10);
  const startTime = Date.now();
  
  // Set up force exit timeout
  const forceExitTimeout = setTimeout(() => {
    const elapsed = Date.now() - startTime;
    console.error('='.repeat(60));
    console.error(`[Shutdown] Graceful shutdown timeout exceeded (${elapsed}ms)`);
    console.error('[Shutdown] Forcing exit...');
    console.error('='.repeat(60));
    process.exit(1);
  }, shutdownTimeout);
  
  try {
    // Step 1: Stop accepting new connections/requests
    console.log('[Shutdown] Step 1: Stopping new connections...');
    
    // Step 2: Close HTTP server (wait for in-flight requests)
    console.log('[Shutdown] Step 2: Closing HTTP server...');
    await closeHttpServer(Math.floor(shutdownTimeout * 0.6));
    
    // Step 3: Close Bull queue connections
    console.log('[Shutdown] Step 3: Stopping scheduler jobs...');
    if (_schedulerStopper) {
      await Promise.race([
        Promise.resolve(_schedulerStopper()),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Scheduler stop timeout")), 4000)),
      ]).catch((error) => {
        console.warn("[Shutdown] Scheduler stopper warning:", error.message);
      });
    }

    // Step 4: Close Bull queue connections
    console.log('[Shutdown] Step 4: Closing Bull queues...');
    await closeBullQueues();
    
    // Step 5: Close Socket.IO connections
    console.log('[Shutdown] Step 5: Closing Socket.IO...');
    await closeSocketIO();
    
    // Step 6: Close Redis connection
    console.log('[Shutdown] Step 6: Closing Redis...');
    await closeRedis();
    
    // Step 7: Close MongoDB connection
    console.log('[Shutdown] Step 7: Closing MongoDB...');
    await closeMongoDB();
    
    clearTimeout(forceExitTimeout);
    
    const elapsed = Date.now() - startTime;
    console.log('='.repeat(60));
    console.log(`[Shutdown] Graceful shutdown completed successfully in ${elapsed}ms`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimeout);
    console.error('[Shutdown] Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * Register shutdown handlers for process signals
 */
function registerShutdownHandlers() {
  // Handle SIGTERM (production deployments)
  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
  });
  
  // Handle SIGINT (Ctrl+C in development)
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Shutdown] Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  // Handle unhandled promise rejections (log but don't exit)
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Shutdown] Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejection, just log it
  });
  
  console.log('[Shutdown] Shutdown handlers registered');
}

export {
  gracefulShutdown,
  registerShutdownHandlers,
  isShuttingDown,
  registerHttpServer,
  registerSocketIO,
  registerBullQueue,
  registerSchedulerStopper,
};

export default gracefulShutdown;
