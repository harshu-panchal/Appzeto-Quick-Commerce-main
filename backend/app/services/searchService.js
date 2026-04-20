import MongoSearchBackend from "./search/mongoSearchBackend.js";
import * as logger from "./logger.js";
import * as cacheService from "./cacheService.js";

/**
 * Search Service
 * 
 * Provides product search with pluggable backend support.
 * Handles backend selection, caching, and fallback strategies.
 */

// Configuration
const SEARCH_BACKEND = process.env.SEARCH_BACKEND || "mongo";
const SEARCH_ENABLED = process.env.SEARCH_ENABLED !== "false";
const SEARCH_FALLBACK_ENABLED = process.env.SEARCH_FALLBACK_ENABLED !== "false";
const SEARCH_CACHE_TTL = 60; // 60 seconds for search results

// Backend instances
let primaryBackend = null;
let fallbackBackend = null;

/**
 * Initialize search backends
 */
function initializeBackends() {
  if (primaryBackend) {
    return; // Already initialized
  }
  
  // Always initialize MongoDB as fallback
  fallbackBackend = new MongoSearchBackend();
  
  // Initialize primary backend based on configuration
  switch (SEARCH_BACKEND.toLowerCase()) {
    case "mongo":
    case "mongodb":
      primaryBackend = fallbackBackend;
      logger.info("[SearchService] Using MongoDB search backend");
      break;
      
    case "elasticsearch":
    case "opensearch":
    case "typesense":
      // Future: Initialize external search engine
      logger.warn(`[SearchService] ${SEARCH_BACKEND} not yet implemented, falling back to MongoDB`);
      primaryBackend = fallbackBackend;
      break;
      
    default:
      logger.warn(`[SearchService] Unknown backend ${SEARCH_BACKEND}, using MongoDB`);
      primaryBackend = fallbackBackend;
  }
}

/**
 * Get active search backend
 * @returns {Object} Search backend instance
 */
function getBackend() {
  if (!primaryBackend) {
    initializeBackends();
  }
  return primaryBackend;
}

/**
 * Build cache key for search query
 * @param {Object} query - Search query
 * @returns {string} Cache key
 */
function buildSearchCacheKey(query) {
  const normalized = {
    keyword: query.keyword || "",
    categoryId: query.categoryId || "",
    priceMin: query.priceMin || "",
    priceMax: query.priceMax || "",
    inStock: query.inStock || "",
    sellerId: query.sellerId || "",
    page: query.page || 1,
    limit: query.limit || 20,
  };
  
  const keyString = Object.entries(normalized)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  
  return cacheService.buildKey("search", "products", keyString);
}

/**
 * Search products
 * @param {Object} query - Search query
 * @returns {Promise<Object>} Search result
 */
export async function searchProducts(query) {
  if (!SEARCH_ENABLED) {
    throw new Error("Search is disabled");
  }
  
  try {
    // Check cache first
    const cacheKey = buildSearchCacheKey(query);
    const cached = await cacheService.get(cacheKey);
    
    if (cached) {
      logger.debug("[SearchService] Cache hit for search query");
      return cached;
    }
    
    // Execute search
    const backend = getBackend();
    const result = await backend.search(query);
    
    // Cache result
    await cacheService.set(cacheKey, result, SEARCH_CACHE_TTL);
    
    logger.debug(`[SearchService] Search completed: ${result.total} results in ${result.took}ms`);
    
    return result;
    
  } catch (error) {
    logger.error("[SearchService] Search error:", error);
    
    // Try fallback if enabled and primary backend failed
    if (SEARCH_FALLBACK_ENABLED && primaryBackend !== fallbackBackend) {
      logger.warn("[SearchService] Attempting fallback to MongoDB search");
      
      try {
        const result = await fallbackBackend.search(query);
        logger.info("[SearchService] Fallback search succeeded");
        return result;
        
      } catch (fallbackError) {
        logger.error("[SearchService] Fallback search also failed:", fallbackError);
        throw fallbackError;
      }
    }
    
    throw error;
  }
}

/**
 * Index a product
 * @param {Object} product - Product to index
 * @returns {Promise<void>}
 */
export async function indexProduct(product) {
  if (!SEARCH_ENABLED) {
    return;
  }
  
  try {
    const backend = getBackend();
    await backend.index(product);
    
    logger.debug(`[SearchService] Indexed product ${product._id}`);
    
    // Invalidate search cache
    await cacheService.delPattern("cache:search:products:*");
    
  } catch (error) {
    logger.error(`[SearchService] Error indexing product ${product._id}:`, error);
    throw error;
  }
}

/**
 * Remove product from search index
 * @param {string} productId - Product ID
 * @returns {Promise<void>}
 */
export async function removeProduct(productId) {
  if (!SEARCH_ENABLED) {
    return;
  }
  
  try {
    const backend = getBackend();
    await backend.remove(productId);
    
    logger.debug(`[SearchService] Removed product ${productId} from index`);
    
    // Invalidate search cache
    await cacheService.delPattern("cache:search:products:*");
    
  } catch (error) {
    logger.error(`[SearchService] Error removing product ${productId}:`, error);
    throw error;
  }
}

/**
 * Bulk index products
 * @param {Array} products - Products to index
 * @returns {Promise<Object>} Bulk index result
 */
export async function bulkIndexProducts(products) {
  if (!SEARCH_ENABLED) {
    return { indexed: 0, failed: 0, errors: [] };
  }
  
  try {
    const backend = getBackend();
    const result = await backend.bulkIndex(products);
    
    logger.debug(`[SearchService] Bulk indexed ${result.indexed} products, ${result.failed} failed`);
    
    // Invalidate search cache
    await cacheService.delPattern("cache:search:products:*");
    
    return result;
    
  } catch (error) {
    logger.error("[SearchService] Error bulk indexing products:", error);
    throw error;
  }
}

/**
 * Get search backend health status
 * @returns {Promise<Object>} Health status
 */
export async function getSearchHealth() {
  try {
    const backend = getBackend();
    const health = await backend.health();
    
    return {
      ...health,
      fallbackAvailable: SEARCH_FALLBACK_ENABLED && primaryBackend !== fallbackBackend,
    };
    
  } catch (error) {
    logger.error("[SearchService] Health check error:", error);
    return {
      healthy: false,
      backend: SEARCH_BACKEND,
      details: {
        error: error.message,
      },
    };
  }
}

export default {
  searchProducts,
  indexProduct,
  removeProduct,
  bulkIndexProducts,
  getSearchHealth,
};
