# Troubleshooting Guide

## Startup Failures

### `Redis is required in production mode`

**Cause:** `NODE_ENV=production` but no Redis configured.

**Fix:**
```bash
# Set Redis URL
REDIS_URL=redis://your-redis-host:6379

# Or set host/port
REDIS_HOST=your-redis-host
REDIS_PORT=6379
```

---

### `Failed to connect to MongoDB after N attempts`

**Cause:** MongoDB unreachable or wrong connection string.

**Fix:**
1. Verify `MONGO_URI` is correct
2. Check network connectivity: `ping your-mongo-host`
3. Check MongoDB is running: `mongosh "$MONGO_URI" --eval "db.adminCommand('ping')"`
4. Increase timeout: `MONGO_CONNECT_TIMEOUT_MS=30000`

---

### `Invalid PROCESS_ROLE value`

**Cause:** `PROCESS_ROLE` set to an unsupported value.

**Fix:** Use one of: `api`, `worker`, `scheduler`, `all`

---

### `JWT_SECRET must be overridden in production`

**Cause:** `JWT_SECRET` is set to a default/placeholder value in production.

**Fix:** Generate a strong secret:
```bash
openssl rand -base64 32
```

---

## Runtime Issues

### Health check returns 503

**Cause:** A dependency (MongoDB or Redis) is unhealthy.

**Diagnose:**
```bash
curl http://your-api/health/ready
# Check the "checks" object for which dependency is DOWN
```

**Fix:** Restore the failing dependency. The readiness probe will automatically recover.

---

### Scheduler jobs running multiple times

**Cause:** Multiple scheduler instances without Redis (distributed locking requires Redis).

**Fix:**
1. Ensure Redis is configured for scheduler role
2. Verify only one scheduler instance is running (or Redis is available for locking)
3. Check logs for: `Distributed lock unavailable, executing without lock`

---

### Queue jobs not being processed

**Cause:** Worker process not running, or Redis disconnected.

**Diagnose:**
```bash
# Check worker health
curl http://your-worker:9090/health/ready

# Check Redis connectivity
redis-cli -u "$REDIS_URL" ping
```

**Fix:**
1. Ensure worker process is running with `PROCESS_ROLE=worker`
2. Verify `REDIS_URL` is the same for API and worker
3. Check worker logs for connection errors

---

### Signed URL upload failing

**Cause:** Cloudinary credentials missing or invalid.

**Diagnose:**
```bash
curl -X POST http://your-api/api/media/upload-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entityType":"product","folder":"products"}'
# Should return 503 if Cloudinary not configured
```

**Fix:** Set all three Cloudinary variables:
```bash
CLOUDINARY_CLOUD_NAME=your-cloud
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret
```

---

### Graceful shutdown taking too long

**Cause:** Long-running requests or stuck jobs exceeding `SHUTDOWN_TIMEOUT_MS`.

**Fix:**
1. Increase timeout: `SHUTDOWN_TIMEOUT_MS=30000`
2. Check for stuck Bull jobs in the queue dashboard
3. Check for long-running HTTP requests in logs

---

### Logs not appearing as JSON

**Cause:** The new logger uses `require()` (CommonJS) but the file uses ES modules.

**Fix:** Ensure `logger.js` is imported correctly:
```javascript
// In ES module files
const logger = require('../services/logger');

// Or if using dynamic import
const { info, error } = await import('../services/logger.js');
```

---

## Diagnostic Commands

```bash
# Check all service health
curl http://localhost:7000/health/ready   # API
curl http://localhost:9090/health/ready   # Worker/Scheduler

# View Prometheus metrics
curl http://localhost:7000/metrics

# Check Redis
redis-cli -u "$REDIS_URL" ping
redis-cli -u "$REDIS_URL" info server

# Check MongoDB
mongosh "$MONGO_URI" --eval "db.adminCommand('ping')"

# View structured logs (pretty-print)
node index.js 2>&1 | jq '.'

# Filter error logs
node index.js 2>&1 | jq 'select(.level == "error")'

# Filter by correlation ID
node index.js 2>&1 | jq 'select(.correlationId == "your-id")'
```

## Error Code Reference

| Code | Meaning | Action |
|------|---------|--------|
| `REDIS_REQUIRED` | Redis not configured in production | Set `REDIS_URL` |
| `MONGO_TIMEOUT` | MongoDB connection timeout | Check connectivity |
| `INVALID_PROCESS_ROLE` | Bad `PROCESS_ROLE` value | Use valid role |
| `CLOUDINARY_CONFIG_MISSING` | Cloudinary not configured | Set credentials |
| `INVALID_PUBLIC_ID` | Bad media public_id format | Check upload flow |
| `SCHEDULER_LOCK_HELD` | Another scheduler has the lock | Normal — skip |
