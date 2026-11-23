import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function openLogin(hash, { status = 200, hasCookie = false, acceptsCookie = true, directAccess = false } = {}) {
  vi.resetModules();
  const fields = {
    "#lanHelp": { hidden: false },
    "#lanConnecting": { hidden: true },
    "#lanError": { hidden: true },
  };
  const location = { hash, pathname: "/lan-login", search: "?agent=fixture", replace: vi.fn(), reload: vi.fn() };
  const history = { replaceState: vi.fn(() => { location.hash = ""; }) };
  const window = { addEventListener: vi.fn() };
  let authenticated = hasCookie;
  const fetch = vi.fn(async (url) => {
    expect(location.hash).toBe("");
    if (url === "/auth/mode") return Response.json({ lan: true, language: "en", authenticated, directAccess });
    authenticated = status === 200 && acceptsCookie;
    return new Response(null, { status });
  });
  vi.stubGlobal("document", {
    createTreeWalker: () => ({ nextNode: () => false }),
    querySelectorAll: () => [],
    querySelector: selector => fields[selector],
    documentElement: {},
  });
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", history);
  vi.stubGlobal("window", window);
  vi.stubGlobal("fetch", fetch);
  await import("./lan-login.js");
  return { fields, fetch, history, location, window };
}

it("authenticates automatically, strips the access key and preserves the selected session", async () => {
  const accessKey = "A".repeat(43);
  const { fetch, history, location } = await openLogin(`#access=${accessKey}`);
  expect(history.replaceState).toHaveBeenCalledWith(undefined, "", "/lan-login?agent=fixture");
  expect(fetch).toHaveBeenNthCalledWith(2, "/auth/lan", expect.objectContaining({
    method: "POST", credentials: "same-origin", body: JSON.stringify({ accessKey }),
  }));
  expect(fetch).toHaveBeenNthCalledWith(3, "/auth/mode", expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
  expect(location.replace).toHaveBeenCalledWith("/?agent=fixture");
});

it("shows how to connect from a plain URL and handles links pasted on the help page", async () => {
  const { fields, fetch, location, window } = await openLogin("");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fields["#lanHelp"].hidden).toBe(false);
  const [, onHashChange] = window.addEventListener.mock.calls.find(([event]) => event === "hashchange");
  location.hash = "#access=fixture";
  onHashChange();
  expect(location.reload).toHaveBeenCalledOnce();
});

it("offers a new link when authentication fails", async () => {
  const { fields, location } = await openLogin("#access=revoked", { status: 401 });
  expect(location.replace).not.toHaveBeenCalled();
  expect(fields["#lanConnecting"].hidden).toBe(true);
  expect(fields["#lanError"].hidden).toBe(false);
  expect(fields["#lanHelp"].hidden).toBe(false);
});

it("opens the dashboard when reopening a login page with a valid cookie", async () => {
  const { fetch, location } = await openLogin("", { hasCookie: true });
  expect(fetch).toHaveBeenCalledOnce();
  expect(location.replace).toHaveBeenCalledWith("/?agent=fixture");
});

it("sends an old login-page bookmark to the dashboard after address access is enabled", async () => {
  const { fetch, location } = await openLogin("", { directAccess: true });
  expect(fetch).toHaveBeenCalledOnce();
  expect(location.replace).toHaveBeenCalledWith("/?agent=fixture");
});

it("shows a cookie error instead of navigating back to login after a successful POST", async () => {
  const { fields, location } = await openLogin(`#access=${"A".repeat(43)}`, { acceptsCookie: false });
  expect(location.replace).not.toHaveBeenCalled();
  expect(fields["#lanConnecting"].hidden).toBe(true);
  expect(fields["#lanHelp"].hidden).toBe(false);
  expect(fields["#lanError"]).toMatchObject({ hidden: false, textContent: expect.stringContaining("sign-in cookie") });
});
