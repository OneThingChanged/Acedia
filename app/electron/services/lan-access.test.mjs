import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanAccess, dashboardClient, dashboardSameOrigin, lanInterfaces, normalizeLanNetworks } from "./lan-access.mjs";
import { LocalDashboardService } from "./web-services.mjs";

// Each probe uses a new connection: reset/disable deliberately closes existing
// sockets, including connections held in a client's keep-alive pool.
const fetch = (url, options = {}) => globalThis.fetch(url, { ...options, headers: { ...options.headers, connection: "close" } });

const network = [{ name: "Ethernet", address: "192.168.10.20", netmask: "255.255.255.0" }];
function request(peer = "192.168.10.21", host = "192.168.10.20:4421", headers = {}) {
  const socket = Object.assign(new EventEmitter(), { remoteAddress: peer, localAddress: "192.168.10.20", destroy: vi.fn() });
  return { socket, headers: { host, ...headers } };
}

describe("LAN connection boundary", () => {
  it("allows explicitly added private subnets as code-authenticated LAN clients while keeping direct host and interface checks", () => {
    const allowed = ["172.28.37.0/24"];
    expect(dashboardClient(request("172.28.37.188"), 4421, true, network)).toBe("blocked");
    expect(dashboardClient(request("172.28.37.188"), 4421, true, network, allowed)).toBe("lan");
    expect(dashboardClient(request("172.28.38.188"), 4421, true, network, allowed)).toBe("blocked");
    expect(dashboardClient(request("172.28.37.188"), 4421, false, network, allowed)).toBe("blocked");
    expect(dashboardClient(request("172.28.37.188", "127.0.0.1:4421"), 4421, true, network, allowed)).toBe("blocked");
    expect(dashboardClient(request("172.28.37.188", undefined, { "x-forwarded-for": "172.28.37.188" }), 4421, true, network, allowed)).toBe("blocked");
    expect(dashboardClient(request("172.28.37.188"), 4421, true, [], allowed)).toBe("blocked");
  });

  it("normalizes private CIDRs and rejects public, loopback, invalid and overbroad networks", () => {
    expect(normalizeLanNetworks([" 172.28.37.188/24 ", "172.28.37.0/24", "10.1.2.3/32", ""])).toEqual(["172.28.37.0/24", "10.1.2.3/32"]);
    for (const value of ["0.0.0.0/0", "172.0.0.0/8", "127.0.0.0/8", "203.0.113.0/24", "192.168.1.0/33", "192.168.1.1", "garbage"]) {
      expect(() => normalizeLanNetworks([value])).toThrow();
    }
  });

  it("persists added networks, preserves them during other saves, and revokes authenticated clients when they change", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-lan-networks-"));
    const access = new LanAccess();
    const service = new LocalDashboardService({ title: "test", defaultPort: 4421, baseDir: root, configName: "config.json", allowLan: true, lanAccess: access });
    try {
      access.reset(true);
      const paired = access.pair(request(), access.code);
      const browser = request(undefined, undefined, { cookie: paired.cookie.split(";")[0] });
      expect(access.authenticated(browser)).toBe(true);
      await service.setLanNetworks(["172.28.37.188/24"]);
      expect(access.authenticated(browser)).toBe(false);
      await service.setConfig({ enabled: true, serverPort: 4421 });
      const restored = new LocalDashboardService({ title: "test", defaultPort: 4421, baseDir: root, configName: "config.json", allowLan: true });
      expect(restored.status().lan.allowedNetworks).toEqual(["172.28.37.0/24"]);
      await expect(service.setLanNetworks(["0.0.0.0/0"])).rejects.toThrow();
      expect(service.status().lan.allowedNetworks).toEqual(["172.28.37.0/24"]);
      await service.setLanNetworks([]);
      expect(service.status().lan.allowedNetworks).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true }); }
  });
  it("advertises private IPv4 interfaces and excludes public, loopback and IPv6 addresses", () => {
    expect(lanInterfaces({
      Ethernet: [network[0], { address: "203.0.113.5", netmask: "255.255.255.0" }],
      Loopback: [{ address: "127.0.0.1", netmask: "255.0.0.0", internal: true }],
      IPv6: [{ address: "fe80::1", netmask: "ffff:ffff:ffff:ffff::" }],
    })).toEqual(network);
  });

  it("accepts only direct local owners or the destination interface's private subnet", () => {
    expect(dashboardClient(request("127.0.0.1", "127.0.0.1:4421"), 4421, false, network)).toBe("local");
    expect(dashboardClient(request(), 4421, true, network)).toBe("lan");
    expect(dashboardClient(request("::ffff:192.168.10.21"), 4421, true, network)).toBe("lan");
    for (const candidate of [
      request("192.168.11.21"), request("10.0.0.1"), request("203.0.113.1"),
      request("192.168.10.21", "localhost:4421"), request("192.168.10.21", "attacker.example:4421"),
      request("192.168.10.21", "192.168.10.20:9999"), request("192.168.10.21", "192.168.10.20:4421/path"),
      request("127.0.0.1", "127.0.0.1:4421", { "x-forwarded-for": "192.168.10.21" }),
      request("127.0.0.1", "127.0.0.1:4421", { "x-forwarded-host": "localhost:4421" }),
      request("127.0.0.1", "127.0.0.1:4421", { forwarded: "for=127.0.0.1" }),
    ]) expect(dashboardClient(candidate, 4421, true, network)).toBe("blocked");
    expect(dashboardClient(request(), 4421, false, network)).toBe("blocked");
  });

  it("does not let forwarded hosts, cross-site requests or opaque origins authorize writes", () => {
    expect(dashboardSameOrigin(request(undefined, undefined, { origin: "http://192.168.10.20:4421" }))).toBe(true);
    expect(dashboardSameOrigin(request(undefined, undefined, { origin: "null" }))).toBe(false);
    expect(dashboardSameOrigin(request(undefined, undefined, { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(dashboardSameOrigin(request(undefined, undefined, { "x-forwarded-host": "attacker.test", origin: "http://attacker.test" }))).toBe(false);
  });

  it("requires the exact code and throttles failed guesses per client and globally", () => {
    let now = 1000;
    const access = new LanAccess({ now: () => now }); access.reset(true);
    expect(access.code).toMatch(/^\d{8}$/);
    for (let n = 0; n < 5; n++) expect(access.pair(request(), "invalid").status).toBe(401);
    expect(access.pair(request(), access.code).status).toBe(429);
    expect(access.pair(request("192.168.10.22"), access.code).status).toBe(200);
    now += 60_001;
    expect(access.pair(request(), access.code).status).toBe(200);
    for (let n = 0; n < 30; n++) expect(access.pair(request(`192.168.10.${n + 30}`), "invalid").status).toBe(401);
    expect(access.pair(request("192.168.10.99"), access.code).status).toBe(429);
    access.reset(false);
  });

  it("expires and revokes cookies and closes already authenticated streams on reset", () => {
    let now = 1000;
    const access = new LanAccess({ now: () => now }); access.reset(true);
    const paired = access.pair(request(), access.code);
    expect(paired.cookie).toContain("HttpOnly; SameSite=Strict");
    const browser = request(undefined, undefined, { cookie: paired.cookie.split(";")[0] });
    expect(access.authenticated(browser)).toBe(true);
    expect(access.authenticated(request(undefined, undefined, { cookie: "acedia_lan=" + "A".repeat(43) }))).toBe(false);
    access.reset(true);
    expect(browser.socket.destroy).toHaveBeenCalled();
    expect(access.authenticated(browser)).toBe(false);
    const second = access.pair(request(), access.code);
    browser.headers.cookie = second.cookie.split(";")[0];
    expect(access.authenticated(browser)).toBe(true);
    now += 7 * 24 * 60 * 60_000 + 1;
    expect(access.authenticated(browser)).toBe(false);
    expect(access.sessions.size).toBe(0);
  });
});

const services = [];
const roots = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-lan-test-")) throw new Error("Invalid cleanup path");
    fs.rmSync(root, { recursive: true });
  }
});
function fixture(allowLan = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-lan-test-")); roots.push(root);
  const writes = [];
  const service = new LocalDashboardService({ title: "Fixture", defaultPort: 0, baseDir: root, configName: "monitor.json", allowLan,
    providers: { writePty: (id, data) => { writes.push({ id, data }); return true; }, chatProvider: () => ({ blocks: [] }) },
  });
  service.sync({ language: "ko", agents: [{ id: "fixture", name: "Private session" }] });
  services.push(service);
  return { service, writes, root };
}
const actualNetwork = lanInterfaces()[0];
const lanTest = actualNetwork ? it : it.skip;

describe("LAN dashboard HTTP", () => {
  it("keeps loopback as the default and prevents unavailable editions from enabling LAN", async () => {
    const { service } = fixture(false);
    const status = await service.start();
    expect(service.server.address().address).toBe("127.0.0.1");
    expect((await fetch(`${status.url}/api/state`)).status).toBe(200);
    await expect(service.setLanEnabled(true)).rejects.toThrow("unavailable");
    expect(service.status().lan.available).toBe(false);
  });

  lanTest("pairs over the actual LAN interface, protects every data route, and revokes access", async () => {
    const { service, writes, root } = fixture();
    const local = await service.start();
    expect((await fetch(`${local.url}/api/state`)).status).toBe(200);
    const status = await service.setLanEnabled(true);
    expect(status.port).toBe(local.port);
    expect(service.server.address().address).toBe("0.0.0.0");
    const base = `http://${actualNetwork.address}:${status.port}`;
    const landing = await fetch(`${base}/?agent=fixture`, { redirect: "manual" });
    expect(landing.status).toBe(302);
    expect(landing.headers.get("location")).toBe("/lan-login?agent=fixture");
    expect((await fetch(`${base}/lan-login`)).status).toBe(200);
    const mode = await fetch(`${base}/auth/mode`).then(response => response.json());
    expect(mode).toEqual({ lan: true, language: "ko" });
    for (const route of ["/api/state", "/api/chat?id=fixture", "/api/stream?id=fixture", "/api/docs", "/api/account-pool", "/hosting-preview/unknown", "/preview/unknown"]) {
      expect((await fetch(base + route)).status, route).toBe(401);
    }
    expect((await fetch(`${local.url}/api/state`, { headers: { "x-forwarded-for": "127.0.0.1" } })).status).toBe(403);
    const pair = code => fetch(`${base}/auth/lan`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ code }) });
    expect((await pair("wrong")).status).toBe(401);
    const paired = await pair(status.lan.code);
    expect(paired.status).toBe(200);
    const cookie = paired.headers.get("set-cookie").split(";")[0];
    const headers = { cookie, "content-type": "application/json", origin: base };
    const state = await fetch(`${base}/api/state`, { headers }).then(response => response.json());
    expect(state.agents[0].name).toBe("Private session");
    expect(JSON.stringify(state)).not.toContain(status.lan.code);
    expect((await fetch(`${base}/api/input`, { method: "POST", headers, body: JSON.stringify({ id: "fixture", data: "hello\r" }) })).status).toBe(200);
    expect((await fetch(`${base}/api/input`, { method: "POST", headers: { ...headers, origin: "https://attacker.test" }, body: JSON.stringify({ id: "fixture", data: "blocked\r" }) })).status).toBe(403);
    expect(writes).toEqual([{ id: "fixture", data: "hello\r" }]);
    await service.setConfig({ enabled: true, serverPort: 0, lanEnabled: false });
    expect(service.config.lanEnabled).toBe(true);
    expect(fs.readFileSync(path.join(root, "monitor.json"), "utf8")).not.toContain(status.lan.code);
    const logout = await fetch(`${base}/auth/logout`, { method: "POST", headers });
    expect(logout.status).toBe(200);
    expect((await fetch(`${base}/api/state`, { headers: { cookie } })).status).toBe(401);
    const pairedAgain = await pair(service.status().lan.code);
    const oldCookie = pairedAgain.headers.get("set-cookie").split(";")[0];
    service.resetLanCode();
    expect((await fetch(`${base}/api/state`, { headers: { cookie: oldCookie } })).status).toBe(401);
    const disabled = await service.setLanEnabled(false);
    expect(disabled.lan.code).toBeNull();
    expect(service.server.address().address).toBe("127.0.0.1");
    expect((await fetch(`${disabled.url}/api/state`)).status).toBe(200);
  });

  lanTest("restores the LAN preference after restart while requiring a new connection code", async () => {
    const { service, root } = fixture();
    const status = await service.setLanEnabled(true);
    const base = `http://${actualNetwork.address}:${status.port}`;
    const paired = await fetch(`${base}/auth/lan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: status.lan.code }) });
    const cookie = paired.headers.get("set-cookie").split(";")[0];
    await service.stop();
    const restored = new LocalDashboardService({ title: "Restored", defaultPort: 0, baseDir: root, configName: "monitor.json", allowLan: true });
    services.push(restored);
    const next = await restored.start();
    expect(next.lan.enabled).toBe(true);
    expect((await fetch(`http://${actualNetwork.address}:${next.port}/api/state`, { headers: { cookie } })).status).toBe(401);
  });
});
