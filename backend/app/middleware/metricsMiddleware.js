/**
 * Metrics Collection Middleware
 * 
 * Automatically tracks HTTP request metrics for Prometheus monitoring.
 * 
 * @module middleware/metricsMiddleware
 */

import { setGauge } from '../services/metrics.js';

// Track in-flight requests
let inFlightRequests = 0;

/**
 * Middleware to track in-flight HTTP requests
 */
export function trackInFlightRequests(req, res, next) {
  // Skip health and metrics endpoints
  if (req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
    return next();
  }
  
  // Increment in-flight counter
  inFlightRequests++;
  setGauge('http_requests_in_flight', inFlightRequests);
  
  // Decrement when response finishes
  res.on('finish', () => {
    inFlightRequests--;
    setGauge('http_requests_in_flight', inFlightRequests);
  });
  
  next();
}

/**
 * Get current in-flight request count
 * @returns {number}
 */
export function getInFlightRequestCount() {
  return inFlightRequests;
}
