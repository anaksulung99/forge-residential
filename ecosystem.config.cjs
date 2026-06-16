// PM2 ecosystem — deploy Ubuntu (lihat docs/ROADMAP.md §11)
// Jalankan: pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      // Web + API (hasil `nuxt build`)
      name: "proxy-web",
      script: ".output/server/index.mjs",
      exec_mode: "cluster",
      instances: 1,
      env: {
        NODE_ENV: "production",
        NITRO_PORT: 3000,
        HOST: "127.0.0.1",
      },
      max_memory_restart: "600M",
    },
    {
      // Worker BullMQ: check + classify (Fase 2/3)
      name: "proxy-worker",
      script: "server/jobs/proxy-check.worker.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PROXY_CHECK_CONCURRENCY: 10,
      },
      max_memory_restart: "800M",
    },
    {
      // Rotating gateway (proxy-chain) — forward proxy untuk client.
      // CATATAN: port gateway diekspos langsung via firewall (ufw), BUKAN Nginx.
      name: "proxy-gateway",
      script: "server/gateway/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      instances: 1,
      env: {
        NODE_ENV: "production",
        GATEWAY_PORT: 10000,
        GATEWAY_HOST_BIND: "0.0.0.0",
      },
      max_memory_restart: "400M",
    },
  ],
};
