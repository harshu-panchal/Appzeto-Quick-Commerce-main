import Bull from "bull";
import { getRedisClient } from "../config/redis.js";
import Product from "../models/product.js";
import SearchIndexFailure from "../models/searchIndexFailure.js";
import { indexProduct, removeProduct } from "./searchService.js";
import * as logger from "./logger.js";

/**
 * Search Sync Service
 * 
 * Manages asynchronous search indexing via Bull queue.
 * Handles product create/update/delete events with retry logic
 * and failure tracking.
 */

// Configuration
const SEARCH_INDEX_ASYNC = process.env.SEARCH_INDEX_ASYNC !== "false";
const SEARCH_INDEX_RETRY_ATTEMPTS = parseInt(
  process.env.SEARCH_INDEX_RETRY_ATTEMPTS || "3",
  10
);

// Queue instance
let searchIndexQueue = null;

/**
 * Initialize search index queue
 * @returns {Bull.Queue} Queue instance
 */
export function getSearchIndexQueue() {
  if (searchIndexQueue) {
    return searchIndexQueue;
  }
  
  const client = getRedisClient();
  if (!client) {
    logger.warn("[SearchSync] Redis client not available, search sync queue initialization skipped");
    return null;
  }
  
  searchIndexQueue = new Bull("search-index", {
    redis: {
      host: client.options.host,
      port: client.options.port,
      password: client.options.password,
      db: client.options.db || 0,
    },
    defaultJobOptions: {
      attempts: SEARCH_INDEX_RETRY_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: 2000, // Start with 2 seconds
      },
      removeOnComplete: true,
      removeOnFail: false, // Keep failed jobs for inspection
    },
  });
  
  logger.info("[SearchSync] Search index queue initialized");
  
  return searchIndexQueue;
}

/**
 * Enqueue product for indexing
 * @param {string} productId - Product ID
 * @returns {Promise<void>}
 */
export async function enqueueProductIndex(productId) {
  if (!SEARCH_INDEX_ASYNC) {
    return;
  }
  
  try {
    const queue = getSearchIndexQueue();
    await queue.add("index", { productId }, {
      jobId: `index-${productId}`, // Prevent duplicate jobs
    });
    
    logger.debug(`[SearchSync] Enqueued index job for product ${productId}`);
    
  } catch (error) {
    logger.error(`[SearchSync] Error enqueuing index job for product ${productId}:`, error);
    // Don't throw - indexing is async and shouldn't block product operations
  }
}

/**
 * Enqueue product for removal from index
 * @param {string} productId - Product ID
 * @returns {Promise<void>}
 */
export async function enqueueProductRemoval(productId) {
  if (!SEARCH_INDEX_ASYNC) {
    return;
  }
  
  try {
    const queue = getSearchIndexQueue();
    await queue.add("remove", { productId }, {
      jobId: `remove-${productId}`, // Prevent duplicate jobs
    });
    
    logger.debug(`[SearchSync] Enqueued remove job for product ${productId}`);
    
  } catch (error) {
    logger.error(`[SearchSync] Error enqueuing remove job for product ${productId}:`, error);
    // Don't throw - indexing is async and shouldn't block product operations
  }
}

/**
 * Process search index job
 * @param {Object} job - Bull job
 * @returns {Promise<void>}
 */
async function processSearchIndexJob(job) {
  const { productId } = job.data;
  const operation = job.name; // "index" or "remove"
  
  try {
    logger.debug(`[SearchSync] Processing ${operation} job for product ${productId}, attempt ${job.attemptsMade + 1}/${SEARCH_INDEX_RETRY_ATTEMPTS}`);
    
    if (operation === "index") {
      const product = await Product.findById(productId).lean();
      
      if (!product) {
        logger.warn(`[SearchSync] Product ${productId} not found, skipping index`);
        return;
      }
      
      await indexProduct(product);
      logger.debug(`[SearchSync] Successfully indexed product ${productId}`);
      
      await SearchIndexFailure.updateMany(
        { productId, operation: "index", resolved: false },
        { $set: { resolved: true, resolvedAt: new Date() } }
      );
      
    } else if (operation === "remove") {
      await removeProduct(productId);
      logger.debug(`[SearchSync] Successfully removed product ${productId} from index`);
      
      await SearchIndexFailure.updateMany(
        { productId, operation: "remove", resolved: false },
        { $set: { resolved: true, resolvedAt: new Date() } }
      );
    }
    
  } catch (error) {
    logger.error(`[SearchSync] Error processing ${operation} job for product ${productId}:`, error);
    
    // If this is the last attempt, log to SearchIndexFailure collection
    if (job.attemptsMade + 1 >= SEARCH_INDEX_RETRY_ATTEMPTS) {
      try {
        await SearchIndexFailure.create({
          productId,
          operation,
          error: error.message,
          attempts: job.attemptsMade + 1,
          lastAttempt: new Date(),
          resolved: false,
        });
        
        logger.error(`[SearchSync] Logged failure for product ${productId} after ${job.attemptsMade + 1} attempts`);
        
      } catch (logError) {
        logger.error(`[SearchSync] Error logging failure:`, logError);
      }
    }
    
    throw error; // Re-throw to trigger retry
  }
}

/**
 * Start search index worker
 * Should be called once during worker process startup
 * @returns {Promise<void>}
 */
export async function startSearchIndexWorker() {
  if (!SEARCH_INDEX_ASYNC) {
    logger.info("[SearchSync] Async search indexing is disabled");
    return;
  }
  
  try {
    const queue = getSearchIndexQueue();
    
    // Process jobs
    queue.process("index", 5, processSearchIndexJob); // 5 concurrent index jobs
    queue.process("remove", 5, processSearchIndexJob); // 5 concurrent remove jobs
    
    // Event handlers
    queue.on("completed", (job) => {
      logger.debug(`[SearchSync] Job ${job.id} completed`);
    });
    
    queue.on("failed", (job, error) => {
      logger.error(`[SearchSync] Job ${job.id} failed:`, error.message);
    });
    
    queue.on("stalled", (job) => {
      logger.warn(`[SearchSync] Job ${job.id} stalled`);
    });
    
    logger.info("[SearchSync] Search index worker started");
    
  } catch (error) {
    logger.error("[SearchSync] Error starting search index worker:", error);
    throw error;
  }
}

/**
 * Stop search index worker
 * Should be called during graceful shutdown
 * @returns {Promise<void>}
 */
export async function stopSearchIndexWorker() {
  if (!searchIndexQueue) {
    return;
  }
  
  try {
    await searchIndexQueue.close();
    logger.info("[SearchSync] Search index worker stopped");
    
  } catch (error) {
    logger.error("[SearchSync] Error stopping search index worker:", error);
  }
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue stats
 */
export async function getQueueStats() {
  if (!searchIndexQueue) {
    return null;
  }
  
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      searchIndexQueue.getWaitingCount(),
      searchIndexQueue.getActiveCount(),
      searchIndexQueue.getCompletedCount(),
      searchIndexQueue.getFailedCount(),
      searchIndexQueue.getDelayedCount(),
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
    
  } catch (error) {
    logger.error("[SearchSync] Error getting queue stats:", error);
    return null;
  }
}

export default {
  getSearchIndexQueue,
  enqueueProductIndex,
  enqueueProductRemoval,
  startSearchIndexWorker,
  stopSearchIndexWorker,
  getQueueStats,
};
