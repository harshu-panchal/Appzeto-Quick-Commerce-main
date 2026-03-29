/**
 * Metrics Collection Service
 * 
 * Collects and exposes Prometheus-compatible metrics for monitoring.
 * Stores metrics in-memory (stateless, resets on process restart).
 * 
 * @module services/metrics
 */

// In-memory metrics storage
const metrics = {
  counters: new Map(),
  histograms: new Map(),
  gauges: new Map()
};

/**
 * Serialize labels to string key
 * @param {Object} labels - Metric labels
 * @returns {string}
 */
function serializeLabels(labels = {}) {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }
  
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${value}"`)
    .join(',');
}

/**
 * Get or create counter map for metric
 * @param {string} name - Metric name
 * @returns {Map}
 */
function getCounterMap(name) {
  if (!metrics.counters.has(name)) {
    metrics.counters.set(name, new Map());
  }
  return metrics.counters.get(name);
}

/**
 * Get or create histogram map for metric
 * @param {string} name - Metric name
 * @returns {Map}
 */
function getHistogramMap(name) {
  if (!metrics.histograms.has(name)) {
    metrics.histograms.set(name, new Map());
  }
  return metrics.histograms.get(name);
}

/**
 * Get or create gauge map for metric
 * @param {string} name - Metric name
 * @returns {Map}
 */
function getGaugeMap(name) {
  if (!metrics.gauges.has(name)) {
    metrics.gauges.set(name, new Map());
  }
  return metrics.gauges.get(name);
}

/**
 * Increment counter metric
 * @param {string} name - Metric name
 * @param {Object} labels - Metric labels
 * @param {number} value - Value to increment by (default: 1)
 */
function incrementCounter(name, labels = {}, value = 1) {
  const counterMap = getCounterMap(name);
  const key = serializeLabels(labels);
  const current = counterMap.get(key) || 0;
  counterMap.set(key, current + value);
}

/**
 * Record histogram value
 * @param {string} name - Metric name
 * @param {number} value - Value to record
 * @param {Object} labels - Metric labels
 */
function recordHistogram(name, value, labels = {}) {
  const histogramMap = getHistogramMap(name);
  const key = serializeLabels(labels);
  
  if (!histogramMap.has(key)) {
    histogramMap.set(key, []);
  }
  
  histogramMap.get(key).push(value);
}

/**
 * Set gauge value
 * @param {string} name - Metric name
 * @param {number} value - Value to set
 * @param {Object} labels - Metric labels
 */
function setGauge(name, value, labels = {}) {
  const gaugeMap = getGaugeMap(name);
  const key = serializeLabels(labels);
  gaugeMap.set(key, value);
}

/**
 * Calculate histogram buckets for Prometheus
 * @param {Array<number>} values - Histogram values
 * @param {Array<number>} buckets - Bucket boundaries
 * @returns {Object}
 */
function calculateHistogramBuckets(values, buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
  const counts = new Map();
  let sum = 0;
  
  // Initialize bucket counts
  buckets.forEach(bucket => counts.set(bucket, 0));
  counts.set('+Inf', 0);
  
  // Count values in buckets
  values.forEach(value => {
    sum += value;
    buckets.forEach(bucket => {
      if (value <= bucket) {
        counts.set(bucket, counts.get(bucket) + 1);
      }
    });
    counts.set('+Inf', counts.get('+Inf') + 1);
  });
  
  // Make buckets cumulative
  let cumulative = 0;
  const cumulativeCounts = new Map();
  buckets.forEach(bucket => {
    cumulative += counts.get(bucket);
    cumulativeCounts.set(bucket, cumulative);
  });
  cumulativeCounts.set('+Inf', values.length);
  
  return {
    buckets: cumulativeCounts,
    sum,
    count: values.length
  };
}

/**
 * Format counter metrics in Prometheus format
 * @param {string} name - Metric name
 * @param {Map} counterMap - Counter values
 * @returns {string}
 */
function formatCounter(name, counterMap) {
  let output = `# HELP ${name} Total count\n`;
  output += `# TYPE ${name} counter\n`;
  
  for (const [labels, value] of counterMap.entries()) {
    const labelStr = labels ? `{${labels}}` : '';
    output += `${name}${labelStr} ${value}\n`;
  }
  
  return output;
}

/**
 * Format histogram metrics in Prometheus format
 * @param {string} name - Metric name
 * @param {Map} histogramMap - Histogram values
 * @returns {string}
 */
function formatHistogram(name, histogramMap) {
  let output = `# HELP ${name} Histogram\n`;
  output += `# TYPE ${name} histogram\n`;
  
  for (const [labels, values] of histogramMap.entries()) {
    const { buckets, sum, count } = calculateHistogramBuckets(values);
    const labelPrefix = labels ? `{${labels}` : '{';
    
    // Output buckets
    for (const [bucket, bucketCount] of buckets.entries()) {
      const bucketLabel = labels 
        ? `{${labels},le="${bucket}"}` 
        : `{le="${bucket}"}`;
      output += `${name}_bucket${bucketLabel} ${bucketCount}\n`;
    }
    
    // Output sum and count
    const labelStr = labels ? `{${labels}}` : '';
    output += `${name}_sum${labelStr} ${sum}\n`;
    output += `${name}_count${labelStr} ${count}\n`;
  }
  
  return output;
}

/**
 * Format gauge metrics in Prometheus format
 * @param {string} name - Metric name
 * @param {Map} gaugeMap - Gauge values
 * @returns {string}
 */
function formatGauge(name, gaugeMap) {
  let output = `# HELP ${name} Gauge value\n`;
  output += `# TYPE ${name} gauge\n`;
  
  for (const [labels, value] of gaugeMap.entries()) {
    const labelStr = labels ? `{${labels}}` : '';
    output += `${name}${labelStr} ${value}\n`;
  }
  
  return output;
}

/**
 * Collect system metrics
 */
function collectSystemMetrics() {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  setGauge('process_uptime_seconds', uptime);
  setGauge('process_memory_bytes', memUsage.rss, { type: 'rss' });
  setGauge('process_memory_bytes', memUsage.heapUsed, { type: 'heapUsed' });
  setGauge('process_memory_bytes', memUsage.heapTotal, { type: 'heapTotal' });
  
  // CPU usage (approximate)
  const cpuUsage = process.cpuUsage();
  const totalCpu = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
  setGauge('process_cpu_usage_seconds', totalCpu);
}

/**
 * Get metrics in Prometheus text exposition format
 * @returns {string}
 */
function getMetrics() {
  // Collect system metrics before exporting
  collectSystemMetrics();
  
  let output = '';
  
  // Export counters
  for (const [name, counterMap] of metrics.counters.entries()) {
    output += formatCounter(name, counterMap);
    output += '\n';
  }
  
  // Export histograms
  for (const [name, histogramMap] of metrics.histograms.entries()) {
    output += formatHistogram(name, histogramMap);
    output += '\n';
  }
  
  // Export gauges
  for (const [name, gaugeMap] of metrics.gauges.entries()) {
    output += formatGauge(name, gaugeMap);
    output += '\n';
  }
  
  return output;
}

/**
 * Reset all metrics (useful for testing)
 */
function resetMetrics() {
  metrics.counters.clear();
  metrics.histograms.clear();
  metrics.gauges.clear();
}

const metricsService = {
  incrementCounter,
  recordHistogram,
  setGauge,
  getMetrics,
  resetMetrics
};

export {
  incrementCounter,
  recordHistogram,
  setGauge,
  getMetrics,
  resetMetrics
};

export default metricsService;
