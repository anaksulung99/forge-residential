// =====================================================================
// Proxy list parser (Fase 1)
// Mengubah teks mentah / baris CSV menjadi entri proxy ternormalisasi.
// Format yang didukung per baris:
//   host:port
//   host:port:user:pass
//   user:pass@host:port
//   protocol://host:port
//   protocol://user:pass@host:port
// Baris kosong & yang diawali '#' diabaikan.
// =====================================================================

export type ParsedProtocol = "http" | "https" | "socks5";

export interface ParsedProxy {
  host: string;
  port: number;
  protocol: ParsedProtocol;
  username: string | null;
  password: string | null;
  raw: string;
}

export interface InvalidProxy {
  raw: string;
  reason: string;
}

export interface ParseResult {
  valid: ParsedProxy[];
  invalid: InvalidProxy[];
  /** jumlah duplikat yang dibuang dalam batch yang sama */
  duplicates: number;
}

/** key unik selaras dengan constraint DB: (host, port, protocol) */
export function proxyKey(p: {
  host: string;
  port: number;
  protocol: string;
}): string {
  return `${p.protocol}://${p.host.toLowerCase()}:${p.port}`;
}

function normalizeProtocol(raw: string | undefined): ParsedProtocol | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "http") return "http";
  if (v === "https") return "https";
  if (v === "socks5" || v === "socks" || v === "socks5h") return "socks5";
  if (v === "socks4" || v === "socks4a") return "socks5"; // best-effort fallback
  return null;
}

function isValidPort(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function isValidHost(host: string): boolean {
  if (!host || /\s/.test(host)) return false;
  // IPv4 atau hostname/domain sederhana
  return /^[a-zA-Z0-9.\-_]+$/.test(host);
}

/** Parse satu baris menjadi ParsedProxy atau lempar pesan error. */
function parseLine(rawLine: string, fallbackProtocol: ParsedProtocol): ParsedProxy {
  const raw = rawLine.trim();
  let work = raw;
  let protocol: ParsedProtocol = fallbackProtocol;

  // 1) protocol://...
  const schemeMatch = work.match(/^([a-zA-Z0-9]+):\/\/(.+)$/);
  if (schemeMatch) {
    const proto = normalizeProtocol(schemeMatch[1]);
    if (!proto) throw new Error(`Protokol tidak dikenal: ${schemeMatch[1]}`);
    protocol = proto;
    work = schemeMatch[2]!;
  }

  let username: string | null = null;
  let password: string | null = null;
  let hostPort = work;

  // 2) user:pass@host:port
  if (work.includes("@")) {
    const at = work.lastIndexOf("@");
    const creds = work.slice(0, at);
    hostPort = work.slice(at + 1);
    const ci = creds.indexOf(":");
    if (ci === -1) {
      username = creds || null;
    } else {
      username = creds.slice(0, ci) || null;
      password = creds.slice(ci + 1) || null;
    }
  }

  const parts = hostPort.split(":");

  // 3) host:port  (paling umum)
  if (parts.length === 2) {
    const host = parts[0]!.trim();
    const port = Number(parts[1]!.trim());
    if (!isValidHost(host)) throw new Error(`Host tidak valid: ${host}`);
    if (!isValidPort(port)) throw new Error(`Port tidak valid: ${parts[1]}`);
    return { host, port, protocol, username, password, raw };
  }

  // 4) host:port:user:pass  (hanya jika belum ada creds dari '@')
  if (parts.length === 4 && username === null) {
    const host = parts[0]!.trim();
    const port = Number(parts[1]!.trim());
    if (!isValidHost(host)) throw new Error(`Host tidak valid: ${host}`);
    if (!isValidPort(port)) throw new Error(`Port tidak valid: ${parts[1]}`);
    return {
      host,
      port,
      protocol,
      username: parts[2]!.trim() || null,
      password: parts[3]!.trim() || null,
      raw,
    };
  }

  throw new Error("Format tidak dikenali");
}

/**
 * Parse blok teks mentah (multi-baris) menjadi daftar proxy.
 * Juga mendeteksi pemisah CSV (koma/semicolon/tab) → diubah jadi ':' kalau cocok.
 */
export function parseProxyList(
  rawText: string,
  fallbackProtocol: ParsedProtocol = "http",
): ParseResult {
  const valid: ParsedProxy[] = [];
  const invalid: InvalidProxy[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Normalisasi pemisah CSV → ':' bila belum pakai ':'
    let candidate = trimmed;
    if (!candidate.includes(":") && /[;,\t]/.test(candidate)) {
      candidate = candidate.replace(/[;,\t]+/g, ":");
    }

    try {
      const parsed = parseLine(candidate, fallbackProtocol);
      const key = proxyKey(parsed);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      valid.push(parsed);
    } catch (err) {
      invalid.push({
        raw: trimmed,
        reason: err instanceof Error ? err.message : "Parse error",
      });
    }
  }

  return { valid, invalid, duplicates };
}
