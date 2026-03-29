# Environment Variables Reference

Complete reference for all environment variables. See `.env.example` for a template.

## Process Control

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PROCESS_ROLE` | `all` | No | Process role: `api`, `worker`, `scheduler`, `all` |
| `NODE_ENV` | `development` | No | Environment: `development`, `production`, `test` |
| `PORT` | `7000` | No | HTTP server port (API role only) |
| `HEALTH_CHECK_PORT` | `9090` | No | Health check port (worker/scheduler roles) |

## Database

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MONGO_URI` | — | **Yes** | MongoDB connection string |
| `MONGO_CONNECT_TIMEOUT_MS` | `10000` | No | Connection timeout in ms |
| `MONGO_MAX_RETRIES` | `5` | No | Max connection retry attempts |

## Redis

Redis is **mandatory in production** (`NODE_ENV=production`). Startup fails if not configured.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `REDIS_URL` | — | Prod: **Yes** | Full Redis connection URL (takes priority) |
| `REDIS_HOST` | `127.0.0.1` | No | Redis host (used if `REDIS_URL` not set) |
| `REDIS_PORT` | `6379` | No | Redis port |
| `REDIS_PASSWORD` | — | No | Redis password |
| `REDIS_ENABLED` | — | No | Explicitly enable Redis (`true`/`1`) |
| `REDIS_DISABLED` | `false` | No | Disable Redis (not allowed in production) |
| `REDIS_ERROR_LOG_INTERVAL_MS` | `60000` | No | Rate limit for Redis error logs |

## Authentication

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `JWT_SECRET` | — | **Yes** | JWT signing secret (must be strong in production) |
| `JWT_EXPIRES_IN` | `7d` | No | JWT token expiry |
| `ADMIN_SECRET_KEY` | — | Prod: **Yes** | Admin operations secret |

## Media / Cloudinary

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `CLOUDINARY_CLOUD_NAME` | — | Yes (for uploads) | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | — | Yes (for uploads) | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | — | Yes (for uploads) | Cloudinary API secret |
| `ENABLE_SIGNED_UPLOADS` | `true` | No | Use signed URL upload flow |
| `MEDIA_MAX_FILE_SIZE` | `5242880` | No | Max upload size in bytes (5MB) |
| `MEDIA_ALLOWED_FORMATS` | `jpg,png,webp` | No | Allowed upload formats |
| `MEDIA_SIGNED_URL_EXPIRY` | `900` | No | Signed URL expiry in seconds |

## Logging

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `LOG_LEVEL` | `info` | No | Log level: `error`, `warn`, `info`, `debug` |
| `LOG_FORMAT` | `json` | No | Log format: `json`, `text` |
| `ENABLE_REQUEST_LOGGING` | `true` | No | Log HTTP requests |

## Graceful Shutdown

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SHUTDOWN_TIMEOUT_MS` | `15000` | No | Max shutdown wait time in ms |
| `SHUTDOWN_WAIT_FOR_REQUESTS` | `true` | No | Wait for in-flight requests |

## Scheduled Jobs

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `AUTO_CANCEL_INTERVAL_MS` | `10000` | No | Order auto-cancel check interval |
| `PAYOUT_BATCH_INTERVAL_MS` | `900000` | No | Payout batch run interval |
| `ENABLE_PAYOUT_BATCH_JOB` | `false` | No | Enable payout batch job |
| `PAYOUT_BATCH_LIMIT` | `25` | No | Max payouts per batch run |

## Bull Queues

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ENABLE_INLINE_QUEUE_WORKER` | `false` | No | Process queues in API process (not recommended) |
| `BULL_STALLED_INTERVAL` | `30000` | No | Stalled job check interval |
| `BULL_MAX_STALLED_COUNT` | `2` | No | Max stalled count before failure |

## Server / CORS

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `FRONTEND_URL` | `http://localhost:5173` | No | Frontend URL for CORS |
| `CORS_ALLOWED_ORIGINS` | — | No | Comma-separated allowed origins (overrides `FRONTEND_URL`) |
| `TRUST_PROXY` | — | No | Trust proxy hops (`true` = 1 hop, number = N hops) |
| `API_JSON_LIMIT` | `1mb` | No | JSON body size limit |
| `API_URLENCODED_LIMIT` | `1mb` | No | URL-encoded body size limit |
| `PAYMENT_WEBHOOK_MAX_PAYLOAD` | `1mb` | No | Webhook payload size limit |

## Production Validation Rules

At startup with `NODE_ENV=production`, the following are enforced:

1. `REDIS_URL` or `REDIS_HOST` must be set
2. `REDIS_DISABLED=true` is rejected
3. `JWT_SECRET` must not be a default/placeholder value
4. `MONGO_URI` must be set
5. Worker role requires Redis
6. Scheduler role requires Redis
