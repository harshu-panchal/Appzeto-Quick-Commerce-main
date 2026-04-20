# Migration Guide: Phase 1 Production Hardening

This guide walks through migrating from the single-process setup to the Phase 1 multi-process architecture.

## Overview

Phase 1 introduces:
- Separate API, Worker, and Scheduler process roles
- Mandatory Redis in production
- Signed URL media uploads
- Structured JSON logging
- Prometheus metrics
- Graceful shutdown

In development, the default `PROCESS_ROLE=all` keeps existing behavior.

---

## Phase 1: Deploy Updated Code (No Behavior Change)

**Goal:** Deploy new code without changing any behavior.

### Steps

In production (`NODE_ENV=production`), do not use `PROCESS_ROLE=all`. Deploy separate services with `PROCESS_ROLE=api`, `PROCESS_ROLE=worker`, and `PROCESS_ROLE=scheduler`.

1. **Deploy with `PROCESS_ROLE=all`** (default — no change needed)

2. **Verify health endpoints work:**
   ```bash
   curl http://your-api/health
   curl http://your-api/health/ready
   ```

3. **Verify metrics endpoint:**
   ```bash
   curl http://your-api/metrics
   ```

4. **Check logs are structured JSON** — your log aggregator should now parse them automatically.

### Rollback

Simply redeploy the previous version. No state changes.

---

## Phase 2: Enable New Features

**Goal:** Opt into new features with feature flags.

### Enable Signed URL Uploads

```bash
ENABLE_SIGNED_UPLOADS=true
```

Test the flow:
1. `POST /api/media/upload-url` — get signed URL
2. Upload directly to Cloudinary using the signed URL
3. `POST /api/media/confirm` — confirm and persist metadata

**Rollback:** Set `ENABLE_SIGNED_UPLOADS=false` to revert to legacy uploads.

### Enable Structured Logging

Logs are already structured JSON. Configure your log aggregator (CloudWatch, Datadog, etc.) to parse JSON.

Set log level:
```bash
LOG_LEVEL=info  # error | warn | info | debug
```

### Enable Metrics Collection

Configure Prometheus to scrape `/metrics`:
```yaml
scrape_configs:
  - job_name: quickcommerce
    static_configs:
      - targets: ['your-api:7000']
```

---

## Phase 3: Multi-Process Deployment

**Goal:** Run API, Worker, and Scheduler as separate processes.

### Prerequisites

- Redis instance provisioned and accessible
- Load balancer configured for API instances

### Step 1: Provision Redis

**Render.com:** Add Redis service via dashboard, copy internal URL.

**AWS:** Use ElastiCache (Redis engine).

**Self-hosted:**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### Step 2: Update Environment

Add to all services:
```bash
REDIS_URL=redis://your-redis-host:6379
NODE_ENV=production
```

### Step 3: Deploy Separate Services

**Docker Compose:**
```bash
docker-compose up -d
```

**Kubernetes:**
```bash
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```

**Render.com:** Push `render.yaml` — services are created automatically.

**PM2:**
```bash
pm2 start ecosystem.config.js
```

### Step 4: Verify

```bash
# API health
curl http://your-api/health/ready

# Worker logs (should show queue processing)
# Scheduler logs (should show lock acquisition)
```

### Rollback

Set `PROCESS_ROLE=all` on a single instance to revert to single-process mode.

---

## Phase 4: Optimization

**Goal:** Fine-tune for production load.

### Tune resource limits

Adjust based on actual usage observed in metrics:
- API: 512Mi–1Gi RAM, 250m–500m CPU
- Worker: 256Mi–512Mi RAM, 100m–250m CPU
- Scheduler: 256Mi–512Mi RAM, 100m–250m CPU

### Set up alerting

Key alerts to configure:
- Error rate > 1%
- p95 latency > 500ms
- Health check failures
- Queue depth > 1000 jobs
- Memory usage > 80%

### Scale API instances

```bash
# Kubernetes
kubectl scale deployment quickcommerce-api --replicas=4

# Docker Compose
docker-compose up -d --scale api=4
```

---

## Backward Compatibility Notes

| Feature | Backward Compatible | Notes |
|---------|-------------------|-------|
| `PROCESS_ROLE=all` | ✅ Yes | Default behavior unchanged |
| Legacy uploads | ✅ Yes | Set `ENABLE_SIGNED_UPLOADS=false` |
| Existing routes | ✅ Yes | No routes removed |
| `startOrderAutoCancelJob()` | ✅ Yes | Now a no-op, use distributed scheduler |
| `startPayoutBatchJob()` | ✅ Yes | Now a no-op, use distributed scheduler |
| Console logging | ✅ Yes | Replaced with structured JSON (same output stream) |
| `/health` endpoint | ✅ Yes | Enhanced with more fields |
