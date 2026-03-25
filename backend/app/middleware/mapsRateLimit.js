import { getRedisClient } from "../config/redis.js";
import crypto from "crypto";

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// Minimal in-memory fallback (per-process). Not perfect in multi-instance,
// but helps protect billing if Redis is disabled.
const mem = new Map();

function memKey(parts) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex");
}

/**
 * Rate limit maps endpoints to protect Google Maps billing.
 * Default: 30 requests/min per user, plus 60/min per IP.
 *
 * Env overrides:
 * MAPS_RL_USER_PER_MIN
 * MAPS_RL_IP_PER_MIN
 */
export function mapsRateLimit(req, res, next) {
  const userId = req.user?.id ? String(req.user.id) : "anon";
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");

  const userLimit = parseInt(process.env.MAPS_RL_USER_PER_MIN || "30", 10);
  const ipLimit = parseInt(process.env.MAPS_RL_IP_PER_MIN || "60", 10);
  const windowSec = 60;

  const bucket = Math.floor(nowSec() / windowSec);
  const redis = getRedisClient();

  const userK = `rl:maps:u:${userId}:${bucket}`;
  const ipK = `rl:maps:ip:${ip}:${bucket}`;

  const over = () => {
    res.status(429).json({
      success: false,
      error: true,
      message: "Too many map requests. Please try again in a moment.",
      errorCode: "RATE_LIMITED",
    });
  };

  if (redis) {
    Promise.all([
      redis.incr(userK),
      redis.incr(ipK),
      redis.expire(userK, windowSec),
      redis.expire(ipK, windowSec),
    ])
      .then(([uCount, ipCount]) => {
        if (uCount > userLimit || ipCount > ipLimit) return over();
        next();
      })
      .catch(() => {
        // If Redis errors, fall back to memory
        const k1 = memKey(["u", userId, String(bucket)]);
        const k2 = memKey(["ip", ip, String(bucket)]);
        const u = (mem.get(k1) || 0) + 1;
        const p = (mem.get(k2) || 0) + 1;
        mem.set(k1, u);
        mem.set(k2, p);
        if (u > userLimit || p > ipLimit) return over();
        next();
      });
    return;
  }

  const k1 = memKey(["u", userId, String(bucket)]);
  const k2 = memKey(["ip", ip, String(bucket)]);
  const u = (mem.get(k1) || 0) + 1;
  const p = (mem.get(k2) || 0) + 1;
  mem.set(k1, u);
  mem.set(k2, p);
  if (u > userLimit || p > ipLimit) return over();
  next();
}

