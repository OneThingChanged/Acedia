import { expect, it, vi } from "vitest";
import { TunnelService } from "./web-services.mjs";
import { tunnelConfigurationIssue, assertRemoteConfigured } from "../shared/tunnel-config.mjs";

it("requires saved identity settings for Remote even without starting a tunnel", () => {
  expect(() => assertRemoteConfigured({})).toThrow("before starting Remote");
  expect(() => assertRemoteConfigured({ client_id: "client", owner: " " })).toThrow();
  expect(() => assertRemoteConfigured({ client_id: "client", owner: "owner" })).not.toThrow();
});

it.each([
  {}, { client_id: " ", owner: "owner" }, { client_id: "client", owner: " " },
  { client_id: "client", owner: "owner", tunnel_token: "token", public_hostname: " " },
  { client_id: "client", owner: "owner", tunnel_token: "token", public_hostname: "host", server_port: 0 },
])("blocks incomplete tunnel settings before downloads or process startup: %j", async config => {
  const fetchImpl = vi.fn();
  const spawnImpl = vi.fn();
  const service = new TunnelService({ baseDir: "unused", getConfig: () => config, getLocalUrl: () => "http://localhost:18800", fetchImpl, spawnImpl });
  const ensure = vi.spyOn(service, "ensureExecutable");
  expect(() => service.validateConfiguration()).toThrow("Enter and save");
  await expect(service.start()).rejects.toThrow("Enter and save");
  expect(ensure).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(spawnImpl).not.toHaveBeenCalled();
  expect(service.status().running).toBe(false);
});

it("allows quick tunnels without a token, secret or fixed hostname and requires a fixed port only for named tunnels", () => {
  const config = { client_id: "client", owner: "owner", server_port: 0 };
  expect(tunnelConfigurationIssue(config)).toBe(null);
  expect(tunnelConfigurationIssue({ ...config, tunnel_token: "token", public_hostname: "host", server_port: 18800 })).toBe(null);
  expect(tunnelConfigurationIssue({ ...config, tunnel_token: "token", public_hostname: "host", server_port: 1.5 })).toBe("port");
});
