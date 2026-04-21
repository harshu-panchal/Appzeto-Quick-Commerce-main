# Quick Commerce Backend

Production-grade MERN quick-commerce API with multi-process architecture, structured observability, and horizontal scalability.

## Quick Start

```bash
cd backend
cp .env.example .env
# Edit .env with your values
npm install
npm start
```

## Process Roles

The app supports four roles via `PROCESS_ROLE`:

| Role | Starts | Use for |
|------|--------|---------|
| `all` (default) | Everything | Development only (not allowed in `NODE_ENV=production`) |
| `api` | HTTP + WebSocket | Production API replicas |
| `worker` | Bull queue processor | Background job processing |
| `scheduler` | Scheduled jobs | Cron-like recurring tasks |

```bash
# Run as separate processes
PROCESS_ROLE=api node index.js
PROCESS_ROLE=worker node index.js
PROCESS_ROLE=scheduler node index.js
```

## Key Features (Phase 1)

- **Multi-process architecture** — API, Worker, Scheduler run independently
- **Redis mandatory in production** — distributed queues, locking, caching
- **Signed URL media uploads** — frontend uploads directly to Cloudinary
- **Structured JSON logging** — correlation IDs, sensitive field redaction
- **Prometheus metrics** — HTTP, queue, system metrics at `/metrics`
- **Health probes** — `/health` (liveness) and `/health/ready` (readiness)
- **Graceful shutdown** — SIGTERM/SIGINT handled cleanly

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness probe |
| `GET /health/ready` | Readiness probe |
| `GET /metrics` | Prometheus metrics |
| `POST /api/media/upload-url` | Get signed Cloudinary upload URL |
| `POST /api/media/confirm` | Confirm upload and persist metadata |
| `DELETE /api/media/:publicId` | Soft-delete media |
| `POST /api/tickets/create` | Create support ticket (chat) |
| `GET /api/tickets/my-tickets` | List my support tickets |
| `POST /api/tickets/reply/:id` | Reply to a support ticket |

Socket.IO events (auth required): `ticket:created`, `ticket:message`.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment instructions.

**Docker Compose (quickest):**
```bash
docker-compose up -d
```

**Kubernetes:**
```bash
kubectl apply -f k8s/
```

**Render.com:** Push `render.yaml` — services are created automatically.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide (Docker, K8s, Render, PM2) |
| [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) | All environment variables |
| [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md) | Migrating from single to multi-process |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [docs/MONITORING.md](docs/MONITORING.md) | Prometheus, Grafana, alerting |

## Environment

Copy `.env.example` to `.env`. Key variables:

```bash
PROCESS_ROLE=all          # api | worker | scheduler | all
NODE_ENV=development      # production requires Redis and role separation
MONGO_URI=...             # MongoDB connection string
REDIS_URL=...             # Required in production
JWT_SECRET=...            # Strong random secret
CLOUDINARY_CLOUD_NAME=... # For media uploads
```

## Testing

```bash
npm test                  # Run all tests
npm test -- --run         # Single run (no watch)
```
