/**
 * Health Check Routes
 * 
 * Provides liveness and readiness probe endpoints for orchestration platforms.
 * 
 * @module routes/healthRoutes
 */

import express from 'express';
import handleResponse from '../utils/helper.js';
import { getHealthStatus, getReadinessStatus } from '../services/healthCheck.js';

const router = express.Router();

/**
 * GET /health
 * Liveness probe - returns 200 if process is running
 * 
 * Authentication: None
 * 
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "status": "UP",
 *     "timestamp": "2024-01-15T10:30:00.000Z",
 *     "role": "api",
 *     "environment": "production",
 *     "uptime": 3600,
 *     "correlationId": "uuid-v4"
 *   }
 * }
 */
router.get('/', async (req, res) => {
  try {
    const status = await getHealthStatus();
    return handleResponse(res, 200, 'Service is healthy', status);
  } catch (error) {
    return handleResponse(res, 500, 'Health check failed', {
      error: error.message
    });
  }
});

/**
 * GET /health/ready
 * Readiness probe - returns 200 only if dependencies are healthy
 * 
 * Authentication: None
 * 
 * Response (200 OK):
 * {
 *   "success": true,
 *   "result": {
 *     "ready": true,
 *     "checks": {
 *       "mongodb": { "status": "UP", "responseTime": 5 },
 *       "redis": { "status": "UP", "responseTime": 2 }
 *     },
 *     "timestamp": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 * 
 * Response (503 Service Unavailable):
 * {
 *   "success": false,
 *   "result": {
 *     "ready": false,
 *     "checks": {
 *       "mongodb": { "status": "UP", "responseTime": 5 },
 *       "redis": { "status": "DOWN", "error": "Connection timeout" }
 *     },
 *     "timestamp": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
router.get('/ready', async (req, res) => {
  try {
    const status = await getReadinessStatus();
    
    if (status.ready) {
      return handleResponse(res, 200, 'Service is ready', status);
    } else {
      return res.status(503).json({
        success: false,
        message: 'Service is not ready',
        result: status
      });
    }
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'Readiness check failed',
      error: error.message
    });
  }
});

export default router;
