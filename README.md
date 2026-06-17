# Deploy ke Ubuntu (PM2 + Nginx)

Topologi single-node, **3 proses PM2**:

| Proses                        | Port             | Akses                                   |
| ----------------------------- | ---------------- | --------------------------------------- |
| `proxy-web` (Nitro)           | `127.0.0.1:3000` | lewat Nginx (443)                       |
| `proxy-worker` (BullMQ)       | —                | internal                                |
| `proxy-gateway` (proxy-chain) | `0.0.0.0:10000`  | **langsung via firewall** (bukan Nginx) |

> Kenapa gateway tidak lewat Nginx? Trafik client ke gateway adalah forward-proxy
> (HTTP `CONNECT` + SOCKS) — bukan request HTTP yang bisa di-reverse-proxy.
> Client connect ke `http://user:pass@<server>:10000` langsung.

---

## 1. Prasyarat server

```bash
# Node 22 + pnpm + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm i -g pnpm pm2

# (PostgreSQL & Redis — pakai yang sudah ada / managed. Pastikan reachable.)
```

## 2. Kode + dependency + env

```bash
git clone <repo> /var/www/proxy-platform
cd /var/www/proxy-platform

pnpm install           # FULL install (jangan --prod; worker/gateway butuh tsx)

cp .env.example .env   # lalu edit (lihat bagian Env di bawah)
```

## 3. GeoIP & Playwright

```bash
# GeoIP MaxMind (opsional, klasifikasi mobile/residential lebih akurat & tanpa rate-limit)
mkdir -p geoip   # taruh GeoLite2-City.mmdb & GeoLite2-ASN.mmdb di sini

# Browser Playwright (untuk deep-check). Salah satu:
npx playwright install --with-deps chromium      # ke cache default
# atau set PLAYWRIGHT_BROWSERS_PATH ke folder ./browsers di .env
```

## 4. Database + build

```bash
pnpm exec prisma migrate deploy   # apply semua migration
pnpm exec prisma generate
pnpm build                        # → .output/server/index.mjs
```

## 5. Jalankan dengan PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup            # jalankan perintah yang dicetak (auto-start saat reboot)

pm2 status             # cek 3 proses: proxy-web / proxy-worker / proxy-gateway
pm2 logs proxy-gateway # harus muncul: ✅ Rotating gateway listening di 0.0.0.0:10000
```

## 6. Nginx + SSL

```bash
sudo cp deploy/nginx/proxy-platform.conf /etc/nginx/sites-available/
sudo nano /etc/nginx/sites-available/proxy-platform.conf   # ganti proxy.example.com
sudo ln -s /etc/nginx/sites-available/proxy-platform.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d proxy.example.com
```

## 7. Firewall (PENTING)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 10000/tcp     # ← port gateway (diekspos langsung)
sudo ufw enable
```

---

## Env (`.env`) penting untuk produksi

```ini
NODE_ENV=production

# URL publik web (dashboard)
NUXT_PUBLIC_SITE_URL=https://proxy.example.com
NUXT_SESSION_PASSWORD=<random 32+ char>

# Database & Redis (gateway/worker butuh ini)
DATABASE_URL=postgres://...
REDIS_HOST=...
REDIS_PORT=6379
REDIS_USER=...
REDIS_PASSWORD=...
REDIS_DB=0
# (TLS Redis: taruh cert di certs/redis/ {ca.crt, redis.crt, redis.key})

# GATEWAY — host publik yang dipakai client (untuk connection string di UI)
GATEWAY_PORT=10000
NUXT_PUBLIC_GATEWAY_HOST=proxy.example.com   # atau IP publik server
NUXT_PUBLIC_GATEWAY_PORT=10000

# Tuning opsional
GATEWAY_FAILOVER_ATTEMPTS=5
GATEWAY_PROBE_TIMEOUT_MS=1500
GATEWAY_FAIL_THRESHOLD=3
PROXY_CHECK_CONCURRENCY=10
# PLAYWRIGHT_BROWSERS_PATH=./browsers
```

> `NUXT_PUBLIC_GATEWAY_HOST` membuat halaman **/app/pools** menampilkan endpoint
> yang benar (mis. `http://user:pass@proxy.example.com:10000`) — bukan `localhost`.
> Inilah yang memperbaiki masalah "exit terbaca localhost" saat test lokal.

---

## Update / redeploy

```bash
cd /var/www/proxy-platform
git pull
pnpm install
pnpm exec prisma migrate deploy && pnpm exec prisma generate
pnpm build
pm2 reload ecosystem.config.cjs   # zero-downtime reload ketiga proses
```

## Operasional

```bash
pm2 restart proxy-gateway      # restart 1 proses
pm2 logs proxy-worker          # lihat log worker (check/scrape)
pm2 monit                      # monitor resource
```

## Smoke test setelah deploy

```bash
# Dashboard
curl -I https://proxy.example.com

# Gateway (ambil kredensial dari /app/pools)
curl -x "http://res_xxx:pass@proxy.example.com:10000" https://httpbin.org/get
# origin harus = IP exit proxy (bukan IP server)
```

Lihat **docs/INTEGRATION.md** untuk pola pemakaian Playwright/Crawlee + rotasi IP.
