import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizePushSubscription,
  RemotePushService,
} from "./remote-push-service.mjs";

const roots = [];
afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-push-"));
  roots.push(root);
  return root;
}

function subscription(endpoint = "https://push.example.test/device-1") {
  return { endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } };
}

describe("RemotePushService", () => {
  it("validates HTTPS push subscriptions", () => {
    expect(normalizePushSubscription(subscription())).toEqual(subscription());
    expect(() => normalizePushSubscription({ endpoint: "http://example.test", keys: {} }))
      .toThrow("invalid push subscription");
  });

  it("persists VAPID keys and subscriptions without exposing the private key or legacy native tokens", () => {
    const root = createRoot();
    fs.writeFileSync(path.join(root, "remote-push.json"), JSON.stringify({
      version: 2,
      vapid: { publicKey: "public-vapid", privateKey: "private-vapid" },
      nativeSubscriptions: [{
        login: "owner",
        token: "ExponentPushToken[legacy_device_token]",
        platform: "android",
      }],
    }));
    const webPushImpl = {
      generateVAPIDKeys: () => ({ publicKey: "public-vapid", privateKey: "private-vapid" }),
      sendNotification: async () => {},
    };
    const first = new RemotePushService({ baseDir: root, webPushImpl, now: () => 100 });
    first.subscribe("Owner", subscription());

    const second = new RemotePushService({ baseDir: root, webPushImpl, now: () => 200 });
    expect(second.publicKey()).toBe("public-vapid");
    expect(second.subscriptions).toHaveLength(1);
    expect(second.subscriptions[0]).toMatchObject({ login: "owner", ...subscription() });
    expect(second.publicKey()).not.toContain("private");
    const saved = fs.readFileSync(path.join(root, "remote-push.json"), "utf8");
    expect(saved).not.toContain("nativeSubscriptions");
    expect(saved).not.toContain("legacy_device_token");
  });

  it("sends completion pushes, deduplicates hook bursts, and prunes expired endpoints", async () => {
    const root = createRoot();
    let now = 1_000;
    const sent = [];
    const webPushImpl = {
      generateVAPIDKeys: () => ({ publicKey: "public-vapid", privateKey: "private-vapid" }),
      async sendNotification(target, payload, options) {
        sent.push({ target, payload: JSON.parse(payload), options });
        if (target.endpoint.endsWith("expired")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      },
    };
    const service = new RemotePushService({ baseDir: root, webPushImpl, now: () => now });
    service.subscribe("owner", subscription());
    service.subscribe("owner", subscription("https://push.example.test/expired"));

    const result = await service.notifyDone({
      agentId: "agent-1",
      sessionId: "session-1",
      title: "ProjectA / Build",
    });
    expect(result).toEqual({
      sent: 1,
      removed: 1,
      duplicate: false,
    });
    expect(sent[0].payload).toMatchObject({
      type: "agent-done",
      title: "ProjectA / Build",
      agentId: "agent-1",
      url: "/?agent=agent-1",
    });
    expect(sent[0].options.vapidDetails.privateKey).toBe("private-vapid");
    expect(service.subscriptions).toHaveLength(1);

    now += 1_000;
    expect(await service.notifyDone({ agentId: "agent-1", sessionId: "session-1" }))
      .toEqual({
        sent: 0,
        removed: 0,
        duplicate: true,
      });
  });

  it('revokes only the selected browser and preserves the subscription if saving fails', async () => {
    const baseDir = createRoot();
    const deliveries = [];
    const webPushImpl = {
      generateVAPIDKeys: () => ({ publicKey: 'public', privateKey: 'private' }),
      async sendNotification(target) { deliveries.push(target.endpoint); },
    };
    const service = new RemotePushService({ baseDir, webPushImpl });
    const browser = subscription();
    const other = subscription('https://push.example.test/device-2');
    service.subscribe('owner', browser);
    service.subscribe('owner', other);
    service.unsubscribe('another-login', browser.endpoint);
    const failingWrite = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw Error('disk'); });
    try {
      expect(() => service.unsubscribe('owner', browser.endpoint)).toThrow('disk');
      expect(service.subscriptions.map(item => item.endpoint)).toEqual([browser.endpoint, other.endpoint]);
    } finally { failingWrite.mockRestore(); }
    expect(service.unsubscribe('owner', browser.endpoint)).toEqual({ subscribed: false });
    await new RemotePushService({ baseDir, webPushImpl }).notifyDone({ agentId: 'agent' });
    expect(deliveries).toEqual([other.endpoint]);
  });
});
