import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedInAppNavigation,
  mobileAuthCompleteUrl,
  normalizeRemoteUrl,
  remoteAppUrl,
} from "../src/lib/remoteUrl.ts";

test("normalizes a public Remote host to HTTPS", () => {
  assert.equal(
    normalizeRemoteUrl("agent.example.com/acedia"),
    "https://agent.example.com/acedia/",
  );
});

test("allows cleartext only for loopback and private IPv4 hosts", () => {
  assert.equal(normalizeRemoteUrl("http://10.0.2.2:18900"), "http://10.0.2.2:18900/");
  assert.equal(normalizeRemoteUrl("http://192.168.0.25:18900"), "http://192.168.0.25:18900/");
  assert.throws(
    () => normalizeRemoteUrl("http://agent.example.com"),
    /HTTPS/,
  );
});

test("rejects credentials and non-HTTP protocols", () => {
  assert.throws(
    () => normalizeRemoteUrl("https://user:secret@agent.example.com"),
    /계정 정보/,
  );
  assert.throws(() => normalizeRemoteUrl("file:///tmp/remote"), /HTTP/);
});

test("builds the native app URL without changing the Remote origin", () => {
  assert.equal(
    remoteAppUrl("https://agent.example.com/"),
    "https://agent.example.com/?source=mobile-app",
  );
});

test("keeps only the configured Remote origin in-app", () => {
  const base = "https://agent.example.com/";
  assert.equal(isAllowedInAppNavigation(base, `${base}api/state`), true);
  assert.equal(
    isAllowedInAppNavigation(base, "https://github.com/login/device"),
    false,
  );
  assert.equal(
    isAllowedInAppNavigation(base, "https://docs.example.com/guide"),
    false,
  );
});

test("builds a same-origin mobile auth ticket exchange URL", () => {
  assert.equal(
    mobileAuthCompleteUrl("https://agent.example.com/", "ticket_123"),
    "https://agent.example.com/auth/mobile/complete?ticket=ticket_123",
  );
});
test('preserves the configured service path for navigation, app launch and login', () => {
  const base = normalizeRemoteUrl('agent.example.com/tools/Acedia');
  assert.equal(base, 'https://agent.example.com/tools/Acedia/');
  assert.equal(remoteAppUrl(base), base + '?source=mobile-app');
  assert.equal(mobileAuthCompleteUrl(base, 'ticket'), base + 'auth/mobile/complete?ticket=ticket');
  assert.equal(isAllowedInAppNavigation(base, base + 'api/state'), true);
  assert.equal(isAllowedInAppNavigation(base, 'https://agent.example.com/other/'), false);
  for (const address of ['agent.example.com/acedia?x=1', 'agent.example.com/a/../b', 'agent.example.com/a%2fb']) assert.throws(() => normalizeRemoteUrl(address));
});
