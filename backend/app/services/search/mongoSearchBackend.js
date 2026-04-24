import Product from "../../models/product.js";
import { SearchBackend } from "./searchBackend.js";
import * as logger from "../logger.js";
import { getApprovedOrLegacyFilter } from "../productModerationService.js";

/**
 * MongoDB Search Backend
 * 
 * Implements search using MongoDB text indexes.
 * Provides baseline search functionality with case-insensitive matching
 * and partial word matching.
 */
export class MongoSearchBackend extends SearchBackend {
  constructor() {
    super();
    this.name = "mongodb";
  }

  /**
   * Normalize search query
   * @param {string} keyword - Raw search keyword
   * @returns {string} Normalized keyword
   */
  normalizeQuery(keyword) {
    if (!keyword || typeof keyword !== "string") {
      return "";
    }
    
    // Trim whitespace, convert to lowercase, remove special characters, then trim again
    return keyword
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, " ")  // Collapse multiple spaces
      .trim();                // Final trim after special char removal
  }

  /**
   * Build MongoDB query from search parameters
   * @param {Object} query - Search query
   * @returns {Object} MongoDB query
   */
  buildQuery(query) {
    const mongoQuery = {};
    
    // Text search
    if (query.keyword) {
      const normalized = this.normalizeQuery(query.keyword);
      if (normalized) {
        mongoQuery.$text = { $search: normalized };
      }
    }
    
    // Status filter (always active)
    mongoQuery.status = "active";
    Object.assign(mongoQuery, getApprovedOrLegacyFilter());
    
    // Category filter
    if (query.categoryId) {
      mongoQuery.categoryId = query.categoryId;
    }
    
    // Price range filter
    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      mongoQuery.price = {};
      if (query.priceMin !== undefined) {
        mongoQuery.price.$gte = Number(query.priceMin);
      }
      if (query.priceMax !== undefined) {
        mongoQuery.price.$lte = Number(query.priceMax);
      }
    }
    
    // Stock filter
    if (query.inStock === true) {
      mongoQuery.stock = { $gt: 0 };
    } else if (query.inStock === false) {
      mongoQuery.stock = { $lte: 0 };
    }
    
    // Seller filter
    if (query.sellerId) {
      mongoQuery.sellerId = query.sellerId;
    }
    
    return mongoQuery;
  }

  /**
   * Search products
   * @param {Object} query - Search query
   * @returns {Promise<Object>} Search result
   */
  async search(query) {
    const startTime = Date.now();
    
    try {
      const page = query.page || 1;
      const limit = query.limit || 20;
      const skip = (page - 1) * limit;
      
      const mongoQuery = this.buildQuery(query);
      
      // Build projection
      const projection = {
        _id: 1,
        name: 1,
        price: 1,
        salePrice: 1,
        mainImage: 1,
        sellerId: 1,
        stock: 1,
        status: 1,
      };
      
      // Add text score if text search is used
      if (mongoQuery.$text) {
        projection.score = { $meta: "textScore" };
      }
      
      // Build sort
      const sort = {};
      if (mongoQuery.$text) {
        sort.score = { $meta: "textScore" };
      } else {
        sort.createdAt = -1; // Default sort by newest
      }
      
      // Execute query
      const [items, total] = await Promise.all([
        Product.find(mongoQuery, projection)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(mongoQuery),
      ]);
      
      const took = Date.now() - startTime;
      
      logger.debug(`[MongoSearch] Query completed in ${took}ms, found ${total} results`);
      
      return {
        items: items.map(item => ({
          ...item,
          score: item.score || 0,
        })),
        total,
        page,
        limit,
        took,
      };
      
    } catch (error) {
      logger.error("[MongoSearch] Search error:", error);
      throw error;
    }
  }

  /**
   * Index a product (no-op for MongoDB as it uses native indexes)
   * @param {Object} product - Product to index
   * @returns {Promise<void>}
   */
  async index(product) {
    // MongoDB uses native text indexes, no explicit indexing needed
    logger.debug(`[MongoSearch] Index operation (no-op) for product ${product._id}`);
    return Promise.resolve();
  }

  /**
   * Remove a product from index (no-op for MongoDB)
   * @param {string} productId - Product ID
   * @returns {Promise<void>}
   */
  async remove(productId) {
    // MongoDB uses native text indexes, no explicit removal needed
    logger.debug(`[MongoSearch] Remove operation (no-op) for product ${productId}`);
    return Promise.resolve();
  }

  /**
   * Bulk index products (no-op for MongoDB)
   * @param {Array} products - Products to index
   * @returns {Promise<Object>} Bulk index result
   */
  async bulkIndex(products) {
    // MongoDB uses native text indexes, no explicit indexing needed
    logger.debug(`[MongoSearch] Bulk index operation (no-op) for ${products.length} products`);
    return {
      indexed: products.length,
      failed: 0,
      errors: [],
    };
  }

  /**
   * Get backend health status
   * @returns {Promise<Object>} Health status
   */
  async health() {
    try {
      // Check if text index exists
      const indexes = await Product.collection.indexes();
      const hasTextIndex = indexes.some(idx => idx.name === "name_text_tags_text");
      
      return {
        healthy: hasTextIndex,
        backend: this.name,
        details: {
          textIndexExists: hasTextIndex,
          message: hasTextIndex 
            ? "MongoDB text search is operational" 
            : "Text index not found. Run database index manager.",
        },
      };
      
    } catch (error) {
      logger.error("[MongoSearch] Health check error:", error);
      return {
        healthy: false,
        backend: this.name,
        details: {
          error: error.message,
        },
      };
    }
  }
}

export default MongoSearchBackend;
