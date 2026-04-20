/**
 * Metrics Routes
 * 
 * Provides Prometheus-compatible metrics endpoint for monitoring.
 * 
 * @module routes/metricsRoutes
 */

import express from 'express';
import { getMetrics } from '../services/metrics.js';

const router = express.Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 * 
 * Authentication: None (should be restricted by network policy in production)
 * 
 * Response: Prometheus text exposition format
 * Content-Type: text/plain
 * 
 * Example:
 * # HELP http_requests_total Total HTTP requests
 * # TYPE http_requests_total counter
 * http_requests_total{method="GET",path="/api/orders",status="200"} 1523
 */
router.get('/', (req, res) => {
  try {
    const metricsOutput = getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metricsOutput);
  } catch (error) {
    console.error('[Metrics] Failed to generate metrics:', error);
    res.status(500).send('# Error generating metrics\n');
  }
});

export default router;
