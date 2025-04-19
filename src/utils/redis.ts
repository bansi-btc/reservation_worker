import { createClient } from "redis";

export const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
  },
});

redis.on("error", (err) => console.error("Redis error:", err));
