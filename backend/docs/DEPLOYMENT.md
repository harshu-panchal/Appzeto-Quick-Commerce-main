# Deployment Guide

This guide covers deploying the Quick Commerce backend across different platforms using the multi-process architecture introduced in Phase 1.

## Process Roles

The application supports four process roles controlled by `PROCESS_ROLE`:

| Role | Description | HTTP Port | Health Port |
|------|-------------|-----------|-------------|
| `api` | HTTP server + WebSocket | 7000 | 7000 |
| `worker` | Bull queue processor | — | 9090 |
| `scheduler` | Scheduled jobs | — | 9090 |
| `all` | All components (development only; not allowed in production) | 7000 | 7000 |

## Prerequisites

- Node.js 18+
- MongoDB 6+
- Redis 7+ (**required in production**)
- Cloudinary account (for media uploads)

---

## Option 1: Docker Compose (Recommended for local production-like setup)

### Setup

```bash
cd backend

# Copy and configure environment
cp .env.example .env.docker
# Edit .env.docker with your values

# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f scheduler

# Check health
curl http://localhost:7000/health/ready
```

### Services started

- `redis` — Redis 7 on port 6379
- `mongodb` — MongoDB 7 on port 27017
- `api` — API server on port 7000
- `api-2` — API replica on port 7001
- `worker` — Queue worker
- `scheduler` — Job scheduler

### Scaling

```bash
# Scale API instances
docker-compose up -d --scale api=3

# Scale workers
docker-compose up -d --scale worker=2
```

### Stopping

```bash
# Graceful stop (sends SIGTERM)
docker-compose stop

# Remove containers
docker-compose down

# Remove containers + volumes
docker-compose down -v
```

---

## Option 2: Kubernetes

### Prerequisites

- `kubectl` configured for your cluster
- Container registry access

### Build and push image

```bash
cd backend

# Build image
docker build -t your-registry/quickcommerce:latest .

# Push to registry
docker push your-registry/quickcommerce:latest
```

### Create secrets

```bash
# Copy secrets template
cp k8s/secrets.yaml.example k8s/secrets.yaml

# Edit k8s/secrets.yaml with base64-encoded values
# Encode a value: echo -n "your-value" | base64

# Apply secrets
kubectl apply -f k8s/secrets.yaml
```

### Deploy

```bash
# Apply all manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# Watch rollout
kubectl rollout status deployment/quickcommerce-api
kubectl rollout status deployment/quickcommerce-worker
kubectl rollout status deployment/quickcommerce-scheduler
```

### Verify deployment

```bash
# Check pods
kubectl get pods -l app=quickcommerce

# Check services
kubectl get services -l app=quickcommerce

# Check HPA
kubectl get hpa quickcommerce-api-hpa

# View logs
kubectl logs -l component=api -f
kubectl logs -l component=worker -f
kubectl logs -l component=scheduler -f

# Health check
kubectl exec -it <api-pod> -- wget -qO- http://localhost:7000/health/ready
```

### Rolling update

```bash
# Update image
kubectl set image deployment/quickcommerce-api api=your-registry/quickcommerce:v2

# Monitor rollout
kubectl rollout status deployment/quickcommerce-api

# Rollback if needed
kubectl rollout undo deployment/quickcommerce-api
```

---

## Option 3: Render.com

### Setup

1. Push `render.yaml` to your repository root (or `backend/render.yaml`)
2. Connect your GitHub repo to Render
3. Render auto-detects `render.yaml` and creates services

### Configure secrets

In the Render dashboard, set these environment variables for each service (marked `sync: false` in render.yaml):

**All services:**
- `MONGO_URI` — MongoDB connection string
- `REDIS_URL` — Redis connection URL
- `JWT_SECRET` — Strong random secret

**API service only:**
- `ADMIN_SECRET_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `FRONTEND_URL`
- `CORS_ALLOWED_ORIGINS`

### Add Redis

1. In Render dashboard → New → Redis
2. Name: `quickcommerce-redis`
3. Plan: Starter or higher
4. Copy the internal Redis URL
5. Add as `REDIS_URL` to all services

### Deploy

```bash
# Push to trigger auto-deploy
git push origin main
```

---

## Option 4: PM2 (Traditional VPS)

### Install PM2

```bash
npm install -g pm2
```

### Create ecosystem file

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'qc-api-1',
      script: 'index.js',
      cwd: '/app/backend',
      env: {
        PROCESS_ROLE: 'api',
        NODE_ENV: 'production',
        PORT: 7000
      }
    },
    {
      name: 'qc-api-2',
      script: 'index.js',
      cwd: '/app/backend',
      env: {
        PROCESS_ROLE: 'api',
        NODE_ENV: 'production',
        PORT: 7001
      }
    },
    {
      name: 'qc-worker',
      script: 'index.js',
      cwd: '/app/backend',
      env: {
        PROCESS_ROLE: 'worker',
        NODE_ENV: 'production',
        HEALTH_CHECK_PORT: 9090
      }
    },
    {
      name: 'qc-scheduler',
      script: 'index.js',
      cwd: '/app/backend',
      env: {
        PROCESS_ROLE: 'scheduler',
        NODE_ENV: 'production',
        HEALTH_CHECK_PORT: 9091,
        ENABLE_PAYOUT_BATCH_JOB: 'true'
      }
    }
  ]
};
```

### Start

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Auto-start on reboot
```

### Monitor

```bash
pm2 status
pm2 logs qc-api-1
pm2 monit
```

---

## Health Endpoints

All roles expose health endpoints:

| Endpoint | Purpose | Returns 200 when |
|----------|---------|-----------------|
| `GET /health` | Liveness probe | Process is running |
| `GET /health/ready` | Readiness probe | All dependencies healthy |
| `GET /metrics` | Prometheus metrics | Always |

### Example readiness response

```json
{
  "success": true,
  "result": {
    "ready": true,
    "checks": {
      "mongodb": { "status": "UP", "responseTime": 3 },
      "redis": { "status": "UP", "responseTime": 1 }
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Production Checklist

- [ ] `NODE_ENV=production` set on all services
- [ ] `REDIS_URL` configured (Redis is mandatory in production)
- [ ] `JWT_SECRET` is a strong random value (not default)
- [ ] `ADMIN_SECRET_KEY` is set
- [ ] Cloudinary credentials configured
- [ ] `TRUST_PROXY=true` if behind load balancer
- [ ] `CORS_ALLOWED_ORIGINS` set to your frontend domain(s)
- [ ] Health checks passing on all services
- [ ] Logs flowing to aggregation system
- [ ] Metrics endpoint accessible to Prometheus
- [ ] Graceful shutdown tested (SIGTERM → clean exit)
