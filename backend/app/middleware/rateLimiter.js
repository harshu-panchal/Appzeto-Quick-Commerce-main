import crypto from "crypto";
import { getRedisClient } from "../config/redis.js";

const localStore = new Map();

function nowMs() {
  return Date.now();
}

function cleanupLocalStore() {
  const now = nowMs();
  for (const [key, value] of localStore.entries()) {
    if (!value || value.expiresAt <= now) {
      localStore.delete(key);
    }
  }
}

function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function incrementCount({ key, windowSec }) {
  const redis = getRedisClient();
  if (redis) {
    try {
      const [count] = await Promise.all([
        redis.incr(key),
        redis.expire(key, windowSec),
      ]);
      return Number(count);
    } catch {
      // fallback below
    }
  }

  cleanupLocalStore();
  const now = nowMs();
  const existing = localStore.get(key);
  if (!existing || existing.expiresAt <= now) {
    localStore.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
    return 1;
  }
  existing.count += 1;
  localStore.set(key, existing);
  return existing.count;
}

export function createRateLimiter({
  namespace,
  windowMs,
  max,
  keyGenerator,
  message = "Too many requests. Please try again later.",
}) {
  const safeWindowMs = Math.max(1000, Number(windowMs || 60000));
  const safeMax = Math.max(1, Number(max || 60));
  const windowSec = Math.ceil(safeWindowMs / 1000);

  return async (req, res, next) => {
    try {
      const keyPart = keyGenerator ? keyGenerator(req) : getClientIp(req);
      const bucket = Math.floor(nowMs() / safeWindowMs);
      const key = `rl:${namespace}:${hash(`${keyPart}:${bucket}`)}`;
      const count = await incrementCount({ key, windowSec });

      res.setHeader("X-RateLimit-Limit", String(safeMax));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, safeMax - count)));
      res.setHeader("X-RateLimit-Reset", String(bucket * safeWindowMs + safeWindowMs));

      if (count > safeMax) {
        return res.status(429).json({
          success: false,
          error: true,
          message,
          result: {
            code: "RATE_LIMITED",
          },
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function byIp(req) {
  return getClientIp(req);
}

export function byUserOrIp(req) {
  return req.user?.id ? `user:${req.user.id}` : `ip:${getClientIp(req)}`;
}
