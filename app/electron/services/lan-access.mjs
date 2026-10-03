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

export function lanInterfaces(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, entries]) => (entries || []).flatMap(entry => (
    !entry.internal && isPrivateIPv4(entry.address) && isIP(entry.netmask) === 4
      ? [{ name, address: entry.address, netmask: entry.netmask }] : []
  )));
}

// Only direct connections to an advertised interface on the same IPv4 subnet
// can pair. Forwarded headers never turn a proxy request into a local owner.
export function dashboardClient(request, port, enabled, interfaces) {
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
  return interfaces.some(entry => entry.address === local &&
    (ipv4(peer) & ipv4(entry.netmask)) === (ipv4(local) & ipv4(entry.netmask))) ? "lan" : "blocked";
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

  reset(enabled) {
    for (const entry of this.sessions.values()) for (const socket of entry.sockets) socket.destroy();
    this.sessions.clear();
    this.attempts.clear();
    this.code = enabled ? String(crypto.randomInt(100_000_000)).padStart(8, "0") : null;
  }

  status(port, enabled, running) {
    return {
      enabled, running,
      addresses: running ? this.interfaces().map(entry => ({ name: entry.name, url: `http://${entry.address}:${port}` })) : [],
      code: running ? this.code : null,
    };
  }

  classify(request, port, enabled) { return dashboardClient(request, port, enabled, this.interfaces()); }

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
    if (!entry.sockets.has(request.socket)) {
      entry.sockets.add(request.socket);
      request.socket.once("close", () => entry.sockets.delete(request.socket));
    }
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
    this.sessions.set(key, { expires: now + SESSION_MS, sockets: new Set() });
    this.attempts.delete(keys[0]);
    return { status: 200, cookie: this.cookie(token) };
  }
}
