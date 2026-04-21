import express from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import setupRoutes from "./app/routes/index.js";
import { initSocket, getIO } from "./app/socket/socketManager.js";
import { registerOrderSocketGetter } from "./app/services/orderSocketEmitter.js";
import { registerTicketSocketGetter } from "./app/services/ticketSocketEmitter.js";
import {
  globalApiRateLimiter,
} from "./app/middleware/securityMiddlewares.js";
import { structuredRequestLogger, correlationIdMiddleware } from "./app/middleware/requestLogger.js";
import { trackInFlightRequests } from "./app/middleware/metricsMiddleware.js";
import { errorHandler, notFoundHandler } from "./app/middleware/errorMiddleware.js";
import { getProcessRole, isComponentEnabled } from "./app/core/processRole.js";
import { startup } from "./app/core/startup.js";
import {
  registerShutdownHandlers,
  registerHttpServer,
  registerSocketIO,
  registerBullQueue,
  registerSchedulerStopper,
} from "./app/core/shutdown.js";
import { registerScheduledJob, startScheduledJobs } from "./app/services/distributedScheduler.js";
import { getOrderAutoCancelJobHandler, getOrderAutoCancelJobInterval } from "./app/jobs/orderAutoCancelJob.js";
import { getReturnWindowReleaseJobHandler, getReturnWindowReleaseJobInterval } from "./app/jobs/returnWindowReleaseJob.js";
import {
  getPayoutBatchJobHandler,
  getPayoutBatchJobInterval,
  isPayoutBatchJobEnabled
} from "./app/jobs/payoutBatchJob.js";
import logger from "./app/services/logger.js";
import { stopScheduledJobs } from "./app/services/distributedScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

const PORT = parseInt(process.env.PORT || '7000', 10);
const HEALTH_CHECK_PORT = parseInt(process.env.HEALTH_CHECK_PORT || '9090', 10);
const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Parse allowed origins from environment
 */
function parseAllowedOrigins() {
  const raw =
    process.env.CORS_ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173,http://localhost:3000";
  const parsed = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const expanded = new Set(parsed);
  for (const origin of parsed) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost") {
        expanded.add(`${url.protocol}//127.0.0.1${url.port ? `:${url.port}` : ""}`);
      } else if (url.hostname === "127.0.0.1") {
        expanded.add(`${url.protocol}//localhost${url.port ? `:${url.port}` : ""}`);
      }
    } catch {
      // Ignore invalid origin entries; startup validation handles env quality elsewhere.
    }
  }

  return [...expanded];
}

/**
 * Parse trust proxy configuration
 */
function parseTrustProxy(value) {
  if (value == null || value === "") return false;
  if (value === "true") return 1;
  if (value === "false") return false;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return value;
}

/**
 * Create Express app with middleware
 */
function createApp() {
  const app = express();
  const allowedOrigins = parseAllowedOrigins();
  
  app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

  const corsOptions = {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Correlation-Id",
      "X-Request-Id",
      "X-Admin-Bootstrap-Secret",
    ],
  };

  // Middleware
  app.use(correlationIdMiddleware);
  app.use(structuredRequestLogger);
  app.use(trackInFlightRequests);
  app.use(compression({
    threshold: 1024, // only compress responses > 1KB
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }));
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(globalApiRateLimiter);

  // PhonePe webhook needs raw body for signature verification
  app.use(
    "/api/payments/webhook/phonepe",
    express.raw({
      type: "application/json",
      limit: process.env.PAYMENT_WEBHOOK_MAX_PAYLOAD || "1mb",
    }),
  );

  app.use(express.json({ limit: process.env.API_JSON_LIMIT || "1mb" }));
  app.use(express.urlencoded({ limit: process.env.API_URLENCODED_LIMIT || "1mb", extended: true }));

  // Root endpoint
  app.get("/", (req, res) => {
    res.status(200).json({
      success: true,
      error: false,
      message: "Quick Commerce API",
      result: {
        version: "1.0.0",
        status: "running",
        role: getProcessRole(),
        environment: NODE_ENV,
        correlationId: req.correlationId,
      },
    });
  });

  app.get("/ready", async (req, res) => {
    try {
      const { getReadinessStatus } = await import("./app/services/healthCheck.js");
      const status = await getReadinessStatus();
      if (status.ready) {
        return res.status(200).json({ success: true, error: false, result: status });
      }
      return res.status(503).json({ success: false, error: true, result: status });
    } catch (error) {
      return res.status(503).json({
        success: false,
        error: true,
        message: "Readiness check failed",
        result: { message: error.message },
      });
    }
  });

  // Setup all routes (includes /health, /metrics, /api/*)
  setupRoutes(app);
  
  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Start HTTP server (API role)
 */
async function startHttpServer() {
  const app = createApp();
  const server = http.createServer(app);
  
  // Initialize Socket.IO
  const allowedOrigins = parseAllowedOrigins();
  const io = new Server(server, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  
  initSocket(io);
  registerOrderSocketGetter(getIO);
  registerTicketSocketGetter(getIO);
  
  // Register for graceful shutdown
  registerHttpServer(server);
  registerSocketIO(io);
  
  // Optionally enable inline queue workers (not recommended for production)
  if (process.env.ENABLE_INLINE_QUEUE_WORKER === "true") {
    logger.warn('Inline queue worker enabled - not recommended for production');
    const { registerOrderQueueProcessors } = await import("./app/queues/orderQueueProcessors.js");
    registerOrderQueueProcessors();
  }
  
  return new Promise((resolve) => {
    server.listen(PORT, "0.0.0.0", () => {
      logger.info('HTTP server started', {
        port: PORT,
        environment: NODE_ENV,
        role: getProcessRole()
      });
      resolve(server);
    });
  });
}

/**
 * Start queue workers (Worker role)
 */
async function startQueueWorkers() {
  const { registerOrderQueueProcessors } = await import("./app/queues/orderQueueProcessors.js");
  const { sellerTimeoutQueue, deliveryTimeoutQueue } = await import("./app/queues/orderQueues.js");
  
  registerOrderQueueProcessors();
  
  // Register queues for graceful shutdown
  registerBullQueue(sellerTimeoutQueue);
  registerBullQueue(deliveryTimeoutQueue);
  
  logger.info('Queue workers started', {
    queues: ['seller-timeout', 'delivery-timeout'],
    role: getProcessRole()
  });
}

/**
 * Start scheduled jobs (Scheduler role)
 */
async function startScheduler() {
  // Register order auto-cancel job
  registerScheduledJob(
    'orderAutoCancelJob',
    getOrderAutoCancelJobInterval(),
    getOrderAutoCancelJobHandler()
  );

  // Register return window release job (seller payout hold release)
  registerScheduledJob(
    'returnWindowReleaseJob',
    getReturnWindowReleaseJobInterval(),
    getReturnWindowReleaseJobHandler()
  );
  
  // Register payout batch job (if enabled)
  if (isPayoutBatchJobEnabled()) {
    registerScheduledJob(
      'payoutBatchJob',
      getPayoutBatchJobInterval(),
      getPayoutBatchJobHandler()
    );
  }
  
  // Start all registered jobs
  await startScheduledJobs();
  registerSchedulerStopper(stopScheduledJobs);
  
  logger.info('Scheduler started', {
    jobs: isPayoutBatchJobEnabled() 
      ? ['orderAutoCancelJob', 'payoutBatchJob']
      : ['orderAutoCancelJob'],
    role: getProcessRole()
  });
}

/**
 * Start minimal health check server for worker/scheduler roles
 */
async function startHealthCheckServer() {
  const app = express();
  const { getHealthStatus, getReadinessStatus } = await import('./app/services/healthCheck.js');
  
  app.get('/health', async (req, res) => {
    try {
      const status = await getHealthStatus();
      res.status(200).json({ success: true, result: status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.get('/health/ready', async (req, res) => {
    try {
      const status = await getReadinessStatus();
      if (status.ready) {
        res.status(200).json({ success: true, result: status });
      } else {
        res.status(503).json({ success: false, result: status });
      }
    } catch (error) {
      res.status(503).json({ success: false, error: error.message });
    }
  });

  app.get('/ready', async (req, res) => {
    try {
      const status = await getReadinessStatus();
      if (status.ready) {
        res.status(200).json({ success: true, result: status });
      } else {
        res.status(503).json({ success: false, result: status });
      }
    } catch (error) {
      res.status(503).json({ success: false, error: error.message });
    }
  });
  
  return new Promise((resolve) => {
    const server = app.listen(HEALTH_CHECK_PORT, "0.0.0.0", () => {
      logger.info('Health check server started', {
        port: HEALTH_CHECK_PORT,
        role: getProcessRole()
      });
      resolve(server);
    });
    
    registerHttpServer(server);
  });
}

/**
 * Main application bootstrap
 */
async function main() {
  try {
    // Register shutdown handlers first
    registerShutdownHandlers();
    
    // Run startup sequence (validates dependencies, connects to DB/Redis)
    await startup();
    
    const role = getProcessRole();
    
    // Start components based on process role
    if (isComponentEnabled('http')) {
      await startHttpServer();
    }
    
    if (isComponentEnabled('worker')) {
      await startQueueWorkers();
      
      // Start health check server for worker role
      if (!isComponentEnabled('http')) {
        await startHealthCheckServer();
      }
    }
    
    if (isComponentEnabled('scheduler')) {
      await startScheduler();
      
      // Start health check server for scheduler role
      if (!isComponentEnabled('http')) {
        await startHealthCheckServer();
      }
    }
    
    logger.info('Application started successfully', {
      role,
      environment: NODE_ENV,
      components: {
        http: isComponentEnabled('http'),
        worker: isComponentEnabled('worker'),
        scheduler: isComponentEnabled('scheduler')
      }
    });
    
  } catch (error) {
    logger.error('Application startup failed', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the application
main();
