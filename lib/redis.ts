// lib/redis.ts
import "server-only";
import Redis from "ioredis";

let client: Redis | null = null;
let redisDisabled = false;

export function getRedisClient(): Redis | null {
  if (redisDisabled) {
    return null;
  }

  const url = process.env.REDIS_URL;

  if (!url) {
    console.warn("REDIS_URL not set, running without Redis cache");
    redisDisabled = true;
    return null;
  }

  if (!client) {
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableAutoPipelining: true,
      connectTimeout: 5000,
      retryStrategy: () => null,
    });

    client.on("error", (err) => {
      console.error("Redis error:", err?.message ?? err);
    });
  }

  return client;
}

export async function safeGetCache(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }

    return await redis.get(key);
  } catch (err) {
    console.warn("Redis GET failed, skipping cache:", err);
    redisDisabled = true;

    try {
      redis.disconnect();
    } catch {}

    client = null;
    return null;
  }
}

export async function safeSetCache(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }

    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(key, value, "EX", ttlSeconds);
    } else {
      await redis.set(key, value);
    }
  } catch (err) {
    console.warn("Redis SET failed, continuing without cache:", err);
    redisDisabled = true;

    try {
      redis.disconnect();
    } catch {}

    client = null;
  }
}