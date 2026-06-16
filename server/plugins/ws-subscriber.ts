import { broadcastToClients } from "~~/server/routes/_ws";
import type { RedisValue } from "ioredis";
import fs from "node:fs";
import path from "node:path";

export default defineNitroPlugin(async (nitroApp) => {
  if (import.meta.client) return;
  const config = useRuntimeConfig();

  const certPath = path.resolve(process.cwd(), "certs/redis/ca.crt");
  const keyPath = path.resolve(process.cwd(), "certs/redis/redis.key");
  const caPath = path.resolve(process.cwd(), "certs/redis/redis.crt");

  try {
    const IORedis = (await import("ioredis")).default;
    const sub = new IORedis({
      host: config.RedisHost,
      port: parseInt(config.RedisPort),
      username: config.RedisUser,
      password: config.RedisPassword,
      db: parseInt(config.RedisDb),
      tls: {
        ca: fs.readFileSync(certPath),
        cert: fs.readFileSync(caPath),
        key: fs.readFileSync(keyPath),
        rejectUnauthorized: true,
      },
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error(`Redis connection failed after ${times} attempts`);
          return null; // stop retrying
        }
        return Math.min(times * 100, 3000);
      },
    });

    await sub.subscribe(
      "analytics:update",
      "campaign:update",
      "worker:update",
      "worker:health",
      "worker:alert",
      "queue:update",
      "proxy:update",
      "system:health",
    );

    sub.on("message", (channel: string, message: RedisValue) => {
      try {
        const data = JSON.parse(message as string);
        broadcastToClients(channel, data);
      } catch {
        /* malformed */
      }
    });

    nitroApp.hooks.hook("request", (event) => {
      const redis = useRedis(event);
      redis.setRedis(sub);
    });

    console.log("✅ Redis Pub/Sub subscriber started");
  } catch (err) {
    console.error("Redis subscriber failed to start:", err);
  }
});
