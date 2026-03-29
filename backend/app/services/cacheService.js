import { getRedisClient } from "../config/redis.js";
import * as logger from "./logger.js";

/**
 * Cache Service
 * 
 * Manages Redis caching with TTL and invalidation strategies.
 * Provides cache-aside pattern, pub/sub invalidation, and graceful
 * fallback to database on Redis errors.
 */

// Configuration constants
const CACHE_ENABLED = process.env.CACHE_ENABLED !== "false";
const CACHE_INVALIDATION_CHANNEL = "cache:invalidate";

// TTL configuration (seconds)
const TTL_CONFIG = {
  categories: parseInt(process.env.CACHE_CATEGORIES_TTL || "3600", 10), // 1 hour
  settings: parseInt(process.env.CACHE_SETTINGS_TTL || "3600", 10), // 1 hour
  deliveryRules: parseInt(process.env.CACHE_DELIVERY_RULES_TTL || "1800", 10), // 30 minutes
  product: parseInt(process.env.CACHE_PRODUCT_TTL || "300", 10), // 5 minutes
  homepage: parseInt(process.env.CACHE_HOMEPAGE_TTL || "600", 10), // 10 minutes
  dashboard: parseInt(process.env.CACHE_DASHBOARD_TTL || "300", 10), // 5 minutes
};

/**
 * Build namespaced cache key
 * @param {string} service - Service name
 * @param {string} entity - Entity type
 * @param {string} identifier - Entity identifier (optional)
 * @returns {string} Namespaced cache key
 */
export function buildKey(service, entity, identifier = "") {
  if (identifier) {
    return `cache:${service}:${entity}:${identifier}`;
  }
  return `cache:${service}:${entity}`;
}

/**
 * Get cached value
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached value or null if not found
 */
export async function get(key) {
  if (!CACHE_ENABLED) {
    return null;
  }
  
  try {
    const redis = getRedisClient();
    const data = await redis.get(key);
    
    if (!data) {
      logger.debug(`[Cache] Miss: ${key}`);
      return null;
    }
    
    logger.debug(`[Cache] Hit: ${key}`);
    return JSON.parse(data);
    
  } catch (error) {
    logger.error(`[Cache] Error getting key ${key}:`, error);
    // Graceful fallback: return null to trigger database query
    return null;
  }
}

/**
 * Set cached value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<void>}
 */
export async function set(key, value, ttlSeconds) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    
    await redis.setex(key, ttlSeconds, serialized);
    logger.debug(`[Cache] Set: ${key}, TTL: ${ttlSeconds}s`);
    
  } catch (error) {
    logger.error(`[Cache] Error setting key ${key}:`, error);
    // Graceful fallback: don't throw, just log
  }
}

/**
 * Delete cached value
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 */
export async function del(key) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    await redis.del(key);
    logger.debug(`[Cache] Deleted: ${key}`);
    
  } catch (error) {
    logger.error(`[Cache] Error deleting key ${key}:`, error);
    // Graceful fallback: don't throw, just log
  }
}

/**
 * Delete multiple keys matching pattern
 * Uses SCAN for production safety (not KEYS)
 * @param {string} pattern - Key pattern (e.g., "cache:product:*")
 * @returns {Promise<number>} Number of keys deleted
 */
export async function delPattern(pattern) {
  if (!CACHE_ENABLED) {
    return 0;
  }
  
  try {
    const redis = getRedisClient();
    let cursor = "0";
    let deletedCount = 0;
    
    do {
      // Use SCAN instead of KEYS for production safety
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      
      cursor = nextCursor;
      
      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
      
    } while (cursor !== "0");
    
    logger.info(`[Cache] Deleted ${deletedCount} keys matching pattern: ${pattern}`);
    return deletedCount;
    
  } catch (error) {
    logger.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    return 0;
  }
}

/**
 * Get or set cached value (cache-aside pattern)
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch value if not cached
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<any>} Cached or fetched value
 */
export async function getOrSet(key, fetchFn, ttlSeconds) {
  // Try to get from cache
  const cached = await get(key);
  
  if (cached !== null) {
    return cached;
  }
  
  // Cache miss: fetch from source
  try {
    const value = await fetchFn();
    
    // Store in cache for next time
    await set(key, value, ttlSeconds);
    
    return value;
    
  } catch (error) {
    logger.error(`[Cache] Error in getOrSet for key ${key}:`, error);
    throw error;
  }
}

/**
 * Invalidate cache and publish event to all instances
 * @param {string} key - Cache key or pattern
 * @returns {Promise<void>}
 */
export async function invalidate(key) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    
    // Delete the key(s)
    if (key.includes("*")) {
      await delPattern(key);
    } else {
      await del(key);
    }
    
    // Publish invalidation event to all instances
    const message = JSON.stringify({
      key,
      timestamp: Date.now(),
    });
    
    await redis.publish(CACHE_INVALIDATION_CHANNEL, message);
    logger.info(`[Cache] Invalidation published for key: ${key}`);
    
  } catch (error) {
    logger.error(`[Cache] Error invalidating key ${key}:`, error);
    // Graceful fallback: don't throw, just log
  }
}

/**
 * Subscribe to cache invalidation events
 * Should be called once during application startup
 * @param {Function} callback - Callback function to handle invalidation events
 * @returns {Promise<void>}
 */
export async function subscribeToInvalidations(callback) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    
    // Create a separate Redis client for pub/sub
    const subscriber = redis.duplicate();
    
    await subscriber.subscribe(CACHE_INVALIDATION_CHANNEL);
    
    subscriber.on("message", (channel, message) => {
      if (channel === CACHE_INVALIDATION_CHANNEL) {
        try {
          const data = JSON.parse(message);
          logger.debug(`[Cache] Invalidation received for key: ${data.key}`);
          
          if (callback) {
            callback(data);
          }
          
        } catch (error) {
          logger.error("[Cache] Error processing invalidation message:", error);
        }
      }
    });
    
    logger.info(`[Cache] Subscribed to invalidation channel: ${CACHE_INVALIDATION_CHANNEL}`);
    
  } catch (error) {
    logger.error("[Cache] Error subscribing to invalidations:", error);
    // Don't throw - cache invalidation is not critical for app startup
  }
}

/**
 * Get TTL configuration for a cache type
 * @param {string} type - Cache type (categories, settings, product, etc.)
 * @returns {number} TTL in seconds
 */
export function getTTL(type) {
  return TTL_CONFIG[type] || 300; // Default 5 minutes
}

export default {
  buildKey,
  get,
  set,
  del,
  delPattern,
  getOrSet,
  invalidate,
  subscribeToInvalidations,
  getTTL,
};
