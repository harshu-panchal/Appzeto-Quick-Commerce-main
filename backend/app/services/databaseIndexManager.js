import mongoose from "mongoose";
import * as logger from "./logger.js";

/**
 * Database Index Manager Service
 * 
 * Manages database indexes for optimal query performance across all collections.
 * Provides functions to create, verify, analyze, and monitor indexes.
 */

/**
 * Index definitions for all collections
 * Each entry specifies the collection name and its required indexes
 */
const INDEX_DEFINITIONS = {
  // Only define indexes here that are NOT already in the model schemas
  // or that need specific centralized management.
  
  products: [
    // These are managed here to ensure background: true and specific naming
    { keys: { status: 1, categoryId: 1, createdAt: -1 }, options: { name: "idx_status_category_created", background: true } },
    { keys: { status: 1, sellerId: 1, createdAt: -1 }, options: { name: "idx_status_seller_created", background: true } },
  ],
  
  orders: [
    // These are already in Order.js, keeping only if we want explicit background creation
    { keys: { customer: 1, createdAt: -1, status: 1 }, options: { name: "idx_customer_created_status", background: true } },
    { keys: { seller: 1, status: 1, createdAt: -1 }, options: { name: "idx_seller_status_created", background: true } },
    { keys: { seller: 1, workflowStatus: 1, createdAt: -1 }, options: { name: "idx_seller_workflow_created", background: true } },
  ],
  
  transactions: [
    { keys: { userId: 1, createdAt: -1, type: 1 }, options: { name: "idx_user_created_type", background: true } },
    { keys: { userId: 1, status: 1, createdAt: -1 }, options: { name: "idx_user_status_created", background: true } },
  ],
  
  notifications: [
    { keys: { recipient: 1, createdAt: -1 }, options: { name: "idx_recipient_created", background: true } },
  ],
};

/**
 * Create all required indexes across all collections
 * @returns {Promise<void>}
 */
export async function createAllIndexes() {
  const startTime = Date.now();
  logger.info("[DatabaseIndexManager] Starting index creation...");
  
  const results = {
    created: 0,
    existing: 0,
    failed: 0,
    errors: [],
  };
  
  try {
    for (const [collectionName, indexes] of Object.entries(INDEX_DEFINITIONS)) {
      const collection = mongoose.connection.collection(collectionName);
      
      for (const indexDef of indexes) {
        try {
          const indexName = indexDef.options?.name || Object.keys(indexDef.keys).join("_");
          
          const existingIndexes = await collection.indexes();
          const indexExists = existingIndexes.some(idx => idx.name === indexName);
          
          if (indexExists) {
            results.existing++;
            continue;
          }
          
          const options = { ...indexDef.options, background: true };
          await collection.createIndex(indexDef.keys, options);
          logger.info(`[DatabaseIndexManager] Created index "${indexName}" on ${collectionName}`);
          results.created++;
          
        } catch (error) {
          if (error.code === 85 || error.codeName === "IndexOptionsConflict") {
            results.existing++;
            continue;
          }
          
          logger.error(`[DatabaseIndexManager] Failed to create index on ${collectionName}:`, error);
          results.failed++;
          results.errors.push({
            collection: collectionName,
            index: indexDef.options?.name || "unnamed",
            error: error.message,
          });
        }
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`[DatabaseIndexManager] Index creation completed in ${duration}ms`, {
      created: results.created,
      existing: results.existing,
      failed: results.failed,
    });
    
    if (results.failed > 0) {
      logger.warn(`[DatabaseIndexManager] ${results.failed} indexes failed to create:`, results.errors);
    }
    
  } catch (error) {
    logger.error("[DatabaseIndexManager] Fatal error during index creation:", error);
    throw error;
  }
}

/**
 * Verify index existence and performance
 * @returns {Promise<Object>} Index health report
 */
export async function verifyIndexes() {
  logger.info("[DatabaseIndexManager] Verifying indexes...");
  
  const report = {
    collections: {},
    summary: {
      totalExpected: 0,
      totalExisting: 0,
      missing: [],
      healthy: true,
    },
  };
  
  try {
    for (const [collectionName, expectedIndexes] of Object.entries(INDEX_DEFINITIONS)) {
      const collection = mongoose.connection.collection(collectionName);
      const existingIndexes = await collection.indexes();
      
      const collectionReport = {
        expected: expectedIndexes.length,
        existing: existingIndexes.length,
        missing: [],
        extra: [],
      };
      
      // Check for missing indexes
      for (const indexDef of expectedIndexes) {
        const indexName = indexDef.options?.name || Object.keys(indexDef.keys).join("_");
        const exists = existingIndexes.some(idx => idx.name === indexName);
        
        if (!exists) {
          collectionReport.missing.push(indexName);
          report.summary.missing.push({ collection: collectionName, index: indexName });
          report.summary.healthy = false;
        }
      }
      
      report.collections[collectionName] = collectionReport;
      report.summary.totalExpected += expectedIndexes.length;
      report.summary.totalExisting += existingIndexes.length;
    }
    
    if (report.summary.healthy) {
      logger.info("[DatabaseIndexManager] All indexes verified successfully");
    } else {
      logger.warn("[DatabaseIndexManager] Missing indexes detected:", report.summary.missing);
    }
    
    return report;
    
  } catch (error) {
    logger.error("[DatabaseIndexManager] Error verifying indexes:", error);
    throw error;
  }
}

/**
 * Analyze slow queries and suggest indexes
 * @param {number} thresholdMs - Slow query threshold in milliseconds (default: 100ms)
 * @returns {Promise<Array>} Array of index suggestions
 */
export async function analyzeSlowQueries(thresholdMs = 100) {
  logger.info(`[DatabaseIndexManager] Analyzing slow queries (threshold: ${thresholdMs}ms)...`);
  
  const suggestions = [];
  
  try {
    // Enable profiling if not already enabled
    const adminDb = mongoose.connection.db.admin();
    await mongoose.connection.db.setProfilingLevel(1, { slowms: thresholdMs });
    
    // Query system.profile collection for slow queries
    const profileCollection = mongoose.connection.db.collection("system.profile");
    const slowQueries = await profileCollection
      .find({ millis: { $gte: thresholdMs } })
      .sort({ ts: -1 })
      .limit(100)
      .toArray();
    
    // Analyze query patterns
    const queryPatterns = new Map();
    
    for (const query of slowQueries) {
      if (!query.ns || !query.command) continue;
      
      const collection = query.ns.split(".").pop();
      const operation = query.op || "unknown";
      const filter = query.command?.filter || query.command?.query || {};
      
      const pattern = {
        collection,
        operation,
        fields: Object.keys(filter),
        executionTime: query.millis,
        timestamp: query.ts,
      };
      
      const key = `${collection}:${pattern.fields.join(",")}`;
      
      if (!queryPatterns.has(key)) {
        queryPatterns.set(key, {
          ...pattern,
          count: 1,
          avgTime: query.millis,
        });
      } else {
        const existing = queryPatterns.get(key);
        existing.count++;
        existing.avgTime = (existing.avgTime * (existing.count - 1) + query.millis) / existing.count;
      }
    }
    
    // Generate suggestions
    for (const [key, pattern] of queryPatterns) {
      if (pattern.count >= 5 && pattern.avgTime >= thresholdMs) {
        suggestions.push({
          collection: pattern.collection,
          suggestedIndex: pattern.fields.reduce((acc, field) => {
            acc[field] = 1;
            return acc;
          }, {}),
          reason: `Frequent slow query (${pattern.count} occurrences, avg ${pattern.avgTime.toFixed(2)}ms)`,
          priority: pattern.avgTime > 500 ? "high" : pattern.avgTime > 200 ? "medium" : "low",
        });
      }
    }
    
    logger.info(`[DatabaseIndexManager] Found ${suggestions.length} index suggestions`);
    return suggestions;
    
  } catch (error) {
    logger.error("[DatabaseIndexManager] Error analyzing slow queries:", error);
    return suggestions;
  }
}

/**
 * Get index usage statistics for a collection
 * @param {string} collectionName - Collection name
 * @returns {Promise<Array>} Array of index statistics
 */
export async function getIndexStats(collectionName) {
  logger.info(`[DatabaseIndexManager] Getting index stats for ${collectionName}...`);
  
  try {
    const collection = mongoose.connection.collection(collectionName);
    
    // Use $indexStats aggregation to get usage statistics
    const stats = await collection.aggregate([
      { $indexStats: {} }
    ]).toArray();
    
    const formattedStats = stats.map(stat => ({
      name: stat.name,
      operations: stat.accesses?.ops || 0,
      since: stat.accesses?.since || null,
      key: stat.key,
      isUnused: (stat.accesses?.ops || 0) === 0,
    }));
    
    // Log unused indexes
    const unusedIndexes = formattedStats.filter(stat => stat.isUnused && stat.name !== "_id_");
    if (unusedIndexes.length > 0) {
      logger.warn(`[DatabaseIndexManager] Unused indexes on ${collectionName}:`, 
        unusedIndexes.map(idx => idx.name)
      );
    }
    
    return formattedStats;
    
  } catch (error) {
    logger.error(`[DatabaseIndexManager] Error getting index stats for ${collectionName}:`, error);
    throw error;
  }
}

export default {
  createAllIndexes,
  verifyIndexes,
  analyzeSlowQueries,
  getIndexStats,
};
