import Redis from "ioredis";

let _client = null;
let _lastSharedErrorLog = 0;
let _connectionAttempts = 0;

const REDIS_ERROR_LOG_INTERVAL_MS = () =>
  parseInt(process.env.REDIS_ERROR_LOG_INTERVAL_MS || "60000", 10);

/**
 * When false, no Redis connections are created: shared client is null and Bull
 * queues are no-op stubs (use MongoDB orderAutoCancelJob for timeouts).
 * 
 * In production mode (NODE_ENV=production), Redis is MANDATORY and this function
 * will throw an error if Redis is not properly configured.
 */
export function isRedisEnabled() {
  const d = process.env.REDIS_DISABLED;
  const e = process.env.REDIS_ENABLED;
  const isProduction = process.env.NODE_ENV === "production";

  // Default: disable Redis in Jest to avoid open handles + noisy retries.
  // Opt-in by setting REDIS_ENABLED=true.
  if (process.env.NODE_ENV === "test" && !(e === "true" || e === "1")) return false;
  if (d === "true" || d === "1") {
    if (isProduction) {
      throw new Error(
        "Redis cannot be disabled in production mode (NODE_ENV=production). " +
        "Redis is required for distributed operations, queues, and caching."
      );
    }
    return false;
  }
  if (e === "false" || e === "0") {
    if (isProduction) {
      throw new Error(
        "Redis is required in production mode (NODE_ENV=production). " +
        "Set REDIS_ENABLED=true or provide REDIS_URL/REDIS_HOST configuration."
      );
    }
    return false;
  }

  // In production, verify Redis configuration is present
  if (isProduction) {
    const hasConfig = !!(
      process.env.REDIS_URL ||
      process.env.REDIS_HOST ||
      e === "true" ||
      e === "1"
    );
    if (!hasConfig) {
      throw new Error(
        "Redis is required in production mode (NODE_ENV=production). " +
        "Please set REDIS_URL or REDIS_HOST environment variable."
      );
    }
  }

  return true;
}

/**
 * Single error handler so ioredis does not emit "Unhandled error event" when
 * Redis is down; logs are rate-limited.
 */
function attachRedisErrorHandler(client) {
  if (!client || client.__qcRedisErrorHandler) return;
  client.__qcRedisErrorHandler = true;

  client.on("connect", () => {
    _connectionAttempts = 0;
  });

  client.on("ready", () => {
    // suppress per-connection ready noise
  });

  client.on("error", (err) => {
    const now = Date.now();
    const interval = REDIS_ERROR_LOG_INTERVAL_MS();
    if (now - _lastSharedErrorLog > interval) {
      _lastSharedErrorLog = now;
      const isProduction = process.env.NODE_ENV === "production";
      const message = isProduction
        ? `[Redis] ERROR: ${err?.code || err?.message || String(err)} - Redis is required in production`
        : `[Redis] ${err?.code || err?.message || String(err)} — set REDIS_DISABLED=true to run without Redis.`;
      console.warn(message);
    }
  });

  client.on("close", () => {
    // suppress close noise
  });

  client.on("reconnecting", () => {
    _connectionAttempts++;
  });
}

function standaloneOptions() {
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (times > 20) return null;
      return Math.min(times * 200, 3000);
    },
  };
}

function urlOptions() {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      if (times > 20) return null;
      return Math.min(times * 200, 3000);
    },
  };
}

/**
 * Shared Redis client for caching / rate limits (optional).
 * Returns null when REDIS_DISABLED=true.
 */
export function getRedisClient() {
  if (!isRedisEnabled()) return null;
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  _client = url
    ? new Redis(url, urlOptions())
    : new Redis(standaloneOptions());

  attachRedisErrorHandler(_client);
  return _client;
}

/**
 * Bull passes (type, config) where config is merged from options.redis.
 * Mirrors bull/lib/queue.js defaults and attaches the same error handler.
 */
export function createBullRedisClient(type, config) {
  let client;
  if (typeof config === "string") {
    client = new Redis(config, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        if (times > 20) return null;
        return Math.min(times * 200, 3000);
      },
    });
  } else if (["bclient", "subscriber"].includes(type)) {
    client = new Redis({
      ...config,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  } else {
    client = new Redis({
      ...config,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }
  attachRedisErrorHandler(client);
  return client;
}

/**
 * Parse REDIS_URL or host/port for Bull.
 */
export function getRedisOptionsForBull() {
  const url = process.env.REDIS_URL;
  if (url) {
    return url;
  }
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Validate Redis connectivity with PING command
 * @returns {Promise<boolean>} True if Redis responds to PING
 */
export async function validateRedisConnection() {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    console.error("[Redis] Validation failed:", error.message);
    return false;
  }
}

/**
 * Wait for Redis connection with exponential backoff retry logic
 * @param {number} maxRetries - Maximum retry attempts (default: 10)
 * @param {number} baseDelay - Base delay in ms (default: 1000)
 * @returns {Promise<void>}
 * @throws {Error} if connection fails after max retries
 */
export async function waitForRedis(maxRetries = 10, baseDelay = 1000) {
  if (!isRedisEnabled()) {
    return;
  }

  const client = getRedisClient();
  if (!client) {
    throw new Error("Redis client is not initialized");
  }

  const isProduction = process.env.NODE_ENV === "production";
  const maxDelay = 30000; // 30 seconds max delay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to connect if not already connected
      if (client.status !== "ready" && client.status !== "connect") {
        await client.connect();
      }

      // Validate connection with PING
      const isValid = await validateRedisConnection();
      if (isValid) {
        return;
      }
    } catch (error) {
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        const errorMessage = `Failed to connect to Redis after ${maxRetries} attempts: ${error.message}`;
        if (isProduction) {
          console.warn(`[Redis] ⚠️ CRITICAL: ${errorMessage} - Continuing without Redis in production.`);
          return;
        } else {
          console.warn(`[Redis] ${errorMessage} - Continuing without Redis`);
          return;
        }
      }

      console.log(
        `[Redis] Connection attempt ${attempt}/${maxRetries} failed: ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
