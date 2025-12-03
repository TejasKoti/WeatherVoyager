// lib/redis.ts
import Redis from "ioredis";

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("REDIS_URL not set – running without Redis cache");
    return null;
  }

  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableAutoPipelining: true,
    });

    client.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }

  return client;
}