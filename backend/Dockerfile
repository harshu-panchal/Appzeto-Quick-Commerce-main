# Production Dockerfile for Quick Commerce Backend
# Supports multi-process architecture (API, Worker, Scheduler)

FROM node:18-alpine

# Install system dependencies for health checks
RUN apk add --no-cache \
    curl \
    wget \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
# 7000: API HTTP server
# 9090: Health check server (worker/scheduler)
EXPOSE 7000 9090

# Health check (works for all process roles)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${HEALTH_CHECK_PORT:-7000}/health || exit 1

# Start command (process role determined by PROCESS_ROLE env var)
CMD ["node", "index.js"]
