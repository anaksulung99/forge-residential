// PM2 ecosystem — deploy Ubuntu (lihat docs/DEPLOY.md)
// Jalankan: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
//
// .env di-load di sini lalu diteruskan ke semua app (Nitro build TIDAK
// auto-load .env; worker & gateway load sendiri via `import "dotenv/config"`,
// tapi kita teruskan eksplisit agar konsisten).
require("dotenv").config();

const baseEnv = { ...process.env, NODE_ENV: "production" };

module.exports = {
  apps: [
    {
      // Web + API (hasil `pnpm build` → .output/server/index.mjs)
      // fork mode + instances:1 — WAJIB untuk WebSocket (cluster memecah koneksi WS).
      name: "proxy-web",
      script: ".output/server/index.mjs",
      exec_mode: "fork",
      instances: 1,
      env: {
        ...baseEnv,
        NITRO_PORT: 3001,
        NITRO_HOST: "127.0.0.1", // bind localhost; Nginx yang fronting
        PORT: 3001,
        HOST: "127.0.0.1",
      },
      max_memory_restart: "700M",
      time: true,
    },
    {
      // Worker BullMQ: check + scrape + classify
      name: "proxy-worker",
      script: "server/jobs/proxy-check.worker.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      instances: 1,
      env: {
        ...baseEnv,
        PROXY_CHECK_CONCURRENCY: 10,
        PROXY_SCRAPE_CONCURRENCY: 2,
      },
      max_memory_restart: "800M",
      time: true,
    },
    {
      // Rotating gateway (proxy-chain) — forward proxy untuk client.
      // PENTING: port gateway diekspos LANGSUNG via firewall (ufw allow 10000),
      // BUKAN lewat Nginx (trafik CONNECT/SOCKS bukan HTTP yang bisa di-reverse-proxy).
      name: "proxy-gateway",
      script: "server/gateway/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      instances: 1,
      env: {
        ...baseEnv,
        GATEWAY_PORT: 10000,
        GATEWAY_HOST_BIND: "0.0.0.0",
      },
      max_memory_restart: "500M",
      time: true,
    },
  ],
};
