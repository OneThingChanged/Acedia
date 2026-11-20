import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function openLogin(hash, status = 200) {
  vi.resetModules();
  const fields = {
    "#lanHelp": { hidden: false },
    "#lanConnecting": { hidden: true },
    "#lanError": { hidden: true },
  };
  const location = { hash, pathname: "/lan-login", search: "?agent=fixture", replace: vi.fn(), reload: vi.fn() };
  const history = { replaceState: vi.fn(() => { location.hash = ""; }) };
  const window = { addEventListener: vi.fn() };
  const fetch = vi.fn(async (url) => {
    expect(location.hash).toBe("");
    return url === "/auth/mode" ? Response.json({ lan: true, language: "en" }) : new Response(null, { status });
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
  const { fields, location } = await openLogin("#access=revoked", 401);
  expect(location.replace).not.toHaveBeenCalled();
  expect(fields["#lanConnecting"].hidden).toBe(true);
  expect(fields["#lanError"].hidden).toBe(false);
  expect(fields["#lanHelp"].hidden).toBe(false);
});
