import crypto from "node:crypto";
import os from "node:os";
import { isIP } from "node:net";

const COOKIE = "acedia_lan";
const SESSION_MS = 7 * 24 * 60 * 60_000;
const address = value => String(value || "").replace(/^::ffff:/i, "");
const ipv4 = value => value.split(".").reduce((result, part) => (result << 8) | Number(part), 0) >>> 0;

export function isPrivateIPv4(value) {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function privateNetwork(value) {
  const match = String(value).trim().match(/^([^/]+)\/(\d{1,2})$/);
  if (!match || isIP(match[1]) !== 4 || Number(match[2]) > 32) throw new Error("Enter a private IPv4 CIDR, for example 172.28.37.0/24.");
  const prefix = Number(match[2]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const start = (ipv4(match[1]) & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  const format = number => [24, 16, 8, 0].map(shift => (number >>> shift) & 255).join(".");
  if (!isPrivateIPv4(format(start)) || !isPrivateIPv4(format(end))) throw new Error("Only private IPv4 networks are allowed (10/8, 172.16/12, 192.168/16).");
  return { mask, start, cidr: `${format(start)}/${prefix}` };
}

export function normalizeLanNetworks(values) {
  if (!Array.isArray(values) || values.length > 32 || values.some(value => typeof value !== "string")) throw new Error("Enter up to 32 private IPv4 networks.");
  return [...new Set(values.map(value => value.trim()).filter(Boolean).map(value => privateNetwork(value).cidr))];
}

export function lanInterfaces(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, entries]) => (entries || []).flatMap(entry => (
    !entry.internal && isPrivateIPv4(entry.address) && isIP(entry.netmask) === 4
      ? [{ name, address: entry.address, netmask: entry.netmask }] : []
  )));
}

// Direct connections to an advertised interface can pair from its subnet or
// explicitly allowed private CIDRs. Proxy headers never create a local owner.
export function dashboardClient(request, port, enabled, interfaces, allowedNetworks = []) {
  const peer = address(request.socket.remoteAddress);
  const local = address(request.socket.localAddress);
  if (Object.keys(request.headers).some(key => /^(forwarded|x-forwarded-|cf-connecting-ip|true-client-ip)/i.test(key))) return "blocked";
  let host;
  try {
    const raw = String(request.headers.host || "").toLowerCase();
    host = new URL(`http://${raw}`);
    if (host.host !== raw || Number(host.port || 80) !== port) return "blocked";
  } catch { return "blocked"; }
  if ((peer === "127.0.0.1" || peer === "::1") && ["127.0.0.1", "localhost", "[::1]"].includes(host.hostname)) return "local";
  if (!enabled || !isPrivateIPv4(peer) || host.hostname !== local) return "blocked";
  if (!interfaces.some(entry => entry.address === local)) return "blocked";
  const sameSubnet = interfaces.some(entry => entry.address === local &&
    (ipv4(peer) & ipv4(entry.netmask)) === (ipv4(local) & ipv4(entry.netmask)));
  const explicitlyAllowed = allowedNetworks.some(value => {
    try { const { mask, start } = privateNetwork(value); return ((ipv4(peer) & mask) >>> 0) === start; }
    catch { return false; }
  });
  return sameSubnet || explicitlyAllowed ? "lan" : "blocked";
}

export function dashboardSameOrigin(request) {
  if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
  const origin = request.headers.origin;
  return !origin || origin === `http://${request.headers.host}`;
}

export class LanAccess {
  constructor({ interfaces = () => lanInterfaces(), now = Date.now } = {}) {
    this.interfaces = interfaces;
    this.now = now;
    this.code = null;
    this.sessions = new Map();
    this.attempts = new Map();
  }

  reset(enabled, savedCode = null) {
    for (const entry of this.sessions.values()) for (const socket of entry.sockets) socket.destroy();
    this.sessions.clear();
    this.attempts.clear();
    this.code = enabled ? savedCode || String(crypto.randomInt(100_000_000)).padStart(8, "0") : null;
  }

  status(port, enabled, running) {
    return {
      enabled, running,
      addresses: running ? this.interfaces().map(entry => ({ name: entry.name, url: `http://${entry.address}:${port}` })) : [],
      code: running ? this.code : null,
      clients: this.clients(),
    };
  }

  classify(request, port, enabled, allowedNetworks = []) { return dashboardClient(request, port, enabled, this.interfaces(), allowedNetworks); }

  clients() {
    const clients = new Map();
    for (const [key, entry] of this.sessions) {
      if (entry.expires <= this.now()) { this.revoke(key); continue; }
      for (const [ip, record] of entry.clients) {
        const active = [...entry.requests.values()].some(request => address(request.socket.remoteAddress) === ip);
        if (!active && this.now() - record.lastSeenAt > 60_000) continue;
        const previous = clients.get(ip);
        clients.set(ip, { ip, connectedAt: Math.min(previous?.connectedAt ?? Infinity, record.connectedAt), lastSeenAt: Math.max(previous?.lastSeenAt ?? 0, record.lastSeenAt), active: active || Boolean(previous?.active) });
      }
    }
    return [...clients.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  revalidate(port, enabled, networks) {
    for (const [key, entry] of this.sessions) {
      // Retain authenticated sessions and streams whose actual addresses still
      // qualify. A removed IP loses its cookie as well as its open streams.
      if ([...entry.clients.values()].some(record => this.classify(record.request, port, enabled, networks) !== "lan")) this.revoke(key);
    }
  }

  track(entry, request) {
    const ip = address(request.socket.remoteAddress);
    const now = this.now();
    const previous = entry.clients.get(ip);
    entry.clients.set(ip, { connectedAt: previous?.connectedAt ?? now, lastSeenAt: now, request: {
      socket: { remoteAddress: request.socket.remoteAddress, localAddress: request.socket.localAddress },
      headers: { host: request.headers.host },
    } });
    if (!entry.sockets.has(request.socket)) {
      entry.sockets.add(request.socket);
      entry.requests.set(request.socket, { socket: { remoteAddress: request.socket.remoteAddress } });
      request.socket.once("close", () => { entry.sockets.delete(request.socket); entry.requests.delete(request.socket); });
    }
  }

  key(request) {
    const token = String(request.headers.cookie || "").match(/(?:^|;\s*)acedia_lan=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
    return token ? crypto.createHash("sha256").update(token).digest("hex") : null;
  }

  revoke(key, except) {
    const entry = this.sessions.get(key);
    this.sessions.delete(key);
    if (entry) for (const socket of entry.sockets) if (socket !== except) socket.destroy();
  }

  authenticated(request) {
    const key = this.key(request);
    const entry = this.sessions.get(key);
    if (!entry) return false;
    if (entry.expires <= this.now()) { this.revoke(key, request.socket); return false; }
    this.track(entry, request);
    return true;
  }

  cookie(token = "", seconds = SESSION_MS / 1000) {
    return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}`;
  }

  pair(request, value) {
    const now = this.now();
    for (const [key, bucket] of this.attempts) if (bucket.until <= now) this.attempts.delete(key);
    const keys = [address(request.socket.remoteAddress), "all"];
    if (keys.some((key, i) => (this.attempts.get(key)?.count || 0) >= (i ? 30 : 5))) {
      return { status: 429, error: "Too many attempts. Try again in a minute." };
    }
    const valid = typeof value === "string" && /^\d{8}$/.test(value) && this.code &&
      crypto.timingSafeEqual(Buffer.from(value), Buffer.from(this.code));
    if (!valid) {
      for (const key of keys) {
        const bucket = this.attempts.get(key) || { count: 0, until: now + 60_000 };
        bucket.count++;
        this.attempts.set(key, bucket);
      }
      return { status: 401, error: "Check the connection code in Acedia on the host PC." };
    }
    for (const [key, session] of this.sessions) if (session.expires <= now) this.revoke(key);
    if (this.sessions.size >= 128) this.revoke(this.sessions.keys().next().value);
    const token = crypto.randomBytes(32).toString("base64url");
    const key = crypto.createHash("sha256").update(token).digest("hex");
    const entry = { expires: now + SESSION_MS, sockets: new Set(), requests: new Map(), clients: new Map() };
    this.sessions.set(key, entry);
    this.track(entry, request);
    this.attempts.delete(keys[0]);
    return { status: 200, cookie: this.cookie(token) };
  }
}
