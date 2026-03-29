/**
 * Health Check Service
 * 
 * Provides health and readiness endpoints for orchestration platforms
 * (Kubernetes, Docker, load balancers).
 * 
 * @module services/healthCheck
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getProcessRole, isComponentEnabled } from '../core/processRole.js';
import { isRedisEnabled, getRedisClient } from '../config/redis.js';
import { setGauge } from './metrics.js';

const startTime = Date.now();

/**
 * Check MongoDB connectivity
 * @returns {Promise<{status: string, responseTime: number, error?: string}>}
 */
async function checkMongoHealth() {
  const start = Date.now();
  
  try {
    if (mongoose.connection.readyState !== 1) {
      return {
        status: 'DOWN',
        responseTime: Date.now() - start,
        error: 'Not connected'
      };
    }
    
    // Ping MongoDB to verify connectivity
    await mongoose.connection.db.admin().ping();
    
    return {
      status: 'UP',
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'DOWN',
      responseTime: Date.now() - start,
      error: error.message
    };
  }
}

/**
 * Check Redis connectivity
 * @returns {Promise<{status: string, responseTime: number, error?: string}>}
 */
async function checkRedisHealth() {
  const start = Date.now();
  
  try {
    if (!isRedisEnabled()) {
      return {
        status: 'DISABLED',
        responseTime: Date.now() - start
      };
    }
    
    const client = getRedisClient();
    if (!client) {
      return {
        status: 'DOWN',
        responseTime: Date.now() - start,
        error: 'Client not initialized'
      };
    }
    
    if (client.status !== 'ready') {
      return {
        status: 'DOWN',
        responseTime: Date.now() - start,
        error: `Connection status: ${client.status}`
      };
    }
    
    // Ping Redis to verify connectivity
    const result = await client.ping();
    
    if (result === 'PONG') {
      return {
        status: 'UP',
        responseTime: Date.now() - start
      };
    } else {
      return {
        status: 'DOWN',
        responseTime: Date.now() - start,
        error: 'Unexpected ping response'
      };
    }
  } catch (error) {
    return {
      status: 'DOWN',
      responseTime: Date.now() - start,
      error: error.message
    };
  }
}

async function checkQueueHealth() {
  const start = Date.now();
  if (!isComponentEnabled("worker")) {
    return {
      status: "DISABLED",
      responseTime: Date.now() - start,
    };
  }

  try {
    const { sellerTimeoutQueue, deliveryTimeoutQueue } = await import("../queues/orderQueues.js");
    const queueCandidates = [
      sellerTimeoutQueue,
      deliveryTimeoutQueue,
    ];
    for (const queue of queueCandidates) {
      if (typeof queue?.isReady === "function") {
        await queue.isReady();
      }
    }
    return {
      status: "UP",
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "DOWN",
      responseTime: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Get health status (liveness probe)
 * @returns {Promise<Object>}
 */
async function getHealthStatus() {
  return {
    status: 'UP',
    timestamp: new Date().toISOString(),
    role: getProcessRole(),
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    correlationId: uuidv4()
  };
}

/**
 * Get readiness status (readiness probe)
 * @returns {Promise<{ready: boolean, checks: Object, timestamp: string}>}
 */
async function getReadinessStatus() {
  const checks = {};
  let ready = true;
  
  // Check MongoDB
  const mongoHealth = await checkMongoHealth();
  checks.mongodb = mongoHealth;
  setGauge("dependency_up", mongoHealth.status === "UP" ? 1 : 0, { dependency: "mongodb" });
  if (mongoHealth.status !== 'UP') {
    ready = false;
  }
  
  // Check Redis (only required in production)
  const redisHealth = await checkRedisHealth();
  checks.redis = redisHealth;
  setGauge("dependency_up", redisHealth.status === "UP" ? 1 : 0, { dependency: "redis" });
  
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && redisHealth.status !== 'UP') {
    ready = false;
  }

  const queueHealth = await checkQueueHealth();
  checks.queue = queueHealth;
  setGauge("dependency_up", queueHealth.status === "UP" ? 1 : 0, { dependency: "queue" });
  if (isComponentEnabled("worker") && queueHealth.status !== "UP") {
    ready = false;
  }
  
  return {
    ready,
    checks,
    role: getProcessRole(),
    timestamp: new Date().toISOString()
  };
}

const healthCheck = {
  getHealthStatus,
  getReadinessStatus,
  checkMongoHealth,
  checkRedisHealth,
  checkQueueHealth,
};

export {
  getHealthStatus,
  getReadinessStatus,
  checkMongoHealth,
  checkRedisHealth,
  checkQueueHealth,
};

export default healthCheck;
