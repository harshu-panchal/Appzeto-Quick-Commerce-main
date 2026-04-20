# Monitoring and Observability Guide

## Metrics Endpoint

All API instances expose Prometheus-compatible metrics at `GET /metrics`.

```bash
curl http://your-api:7000/metrics
```

> **Security note:** Restrict `/metrics` access by network policy in production. It should not be publicly accessible.

---

## Prometheus Setup

### scrape_configs

```yaml
# prometheus.yml
scrape_configs:
  - job_name: quickcommerce-api
    static_configs:
      - targets:
          - api-1:7000
          - api-2:7000
    metrics_path: /metrics
    scrape_interval: 15s

  - job_name: quickcommerce-worker
    static_configs:
      - targets:
          - worker:9090
    metrics_path: /metrics
    scrape_interval: 30s

  - job_name: quickcommerce-scheduler
    static_configs:
      - targets:
          - scheduler:9090
    metrics_path: /metrics
    scrape_interval: 30s
```

---

## Available Metrics

### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `path`, `status` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `path` | Request latency |
| `http_requests_in_flight` | Gauge | — | Active requests |

### Queue Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `queue_jobs_total` | Counter | `queue`, `status` | Jobs processed |
| `queue_job_duration_seconds` | Histogram | `queue` | Job processing time |

### System Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `process_uptime_seconds` | Gauge | — | Process uptime |
| `process_memory_bytes` | Gauge | `type` | Memory usage |
| `process_cpu_usage_seconds` | Gauge | — | CPU usage |

---

## Grafana Dashboards

### Key panels to create

**Request Rate:**
```promql
rate(http_requests_total[5m])
```

**Error Rate:**
```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**p95 Latency:**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Queue Job Failure Rate:**
```promql
rate(queue_jobs_total{status="failed"}[5m])
```

**Memory Usage:**
```promql
process_memory_bytes{type="heapUsed"}
```

---

## Recommended Alerts

```yaml
# alerts.yml
groups:
  - name: quickcommerce
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 1%"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "p95 latency above 500ms"

      - alert: ServiceDown
        expr: up{job="quickcommerce-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API service is down"

      - alert: HighMemoryUsage
        expr: process_memory_bytes{type="heapUsed"} / process_memory_bytes{type="heapTotal"} > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Heap memory usage above 80%"

      - alert: QueueJobFailures
        expr: rate(queue_jobs_total{status="failed"}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Queue job failure rate elevated"
```

---

## Structured Logs

All logs are emitted as JSON to stdout. Configure your log aggregator to parse them.

### Log format

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "HTTP request completed",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "api",
  "environment": "production",
  "context": {
    "method": "POST",
    "path": "/api/orders",
    "statusCode": 201,
    "duration": 145,
    "userId": "user-id"
  }
}
```

### CloudWatch (AWS)

```json
{
  "logGroupName": "/quickcommerce/api",
  "filterPattern": "{ $.level = \"error\" }"
}
```

### Datadog

```yaml
# datadog-agent.yaml
logs:
  - type: docker
    service: quickcommerce-api
    source: nodejs
    log_processing_rules:
      - type: multi_line
        name: json_logs
        pattern: '^\{'
```

### Querying logs

```bash
# Filter errors
cat app.log | jq 'select(.level == "error")'

# Filter by correlation ID
cat app.log | jq 'select(.correlationId == "your-id")'

# Filter by user
cat app.log | jq 'select(.context.userId == "user-id")'

# Filter slow requests (> 1s)
cat app.log | jq 'select(.context.duration > 1000)'
```

---

## Health Check Integration

### Kubernetes liveness/readiness

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 7000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 7000
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Load balancer health check

Configure your load balancer to use `GET /health/ready` — it returns 503 when dependencies are unhealthy, automatically removing the instance from rotation.
