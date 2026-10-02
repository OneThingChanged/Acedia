const nativeUserAgents = new WeakMap();

export function compatibleBrowserUserAgent(userAgent, applicationName) {
  // Some sites serve a different, unusable verification response when the
  // browser advertises Electron. Keep the real Chromium version and platform.
  if (!/\sElectron\//.test(userAgent) || !/\sChrome\//.test(userAgent)) return userAgent;
  const products = [...new Set(["Electron", "app", applicationName].filter(Boolean))]
    .map(name => String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return userAgent.replace(new RegExp(`\\s+(?:${products.join("|")})/[^\\s]+`, "g"), "");
}

export function applyBrowserCompatibility(contents, enabled, applicationName) {
  if (!nativeUserAgents.has(contents)) nativeUserAgents.set(contents, contents.getUserAgent());
  const original = nativeUserAgents.get(contents);
  contents.setUserAgent(enabled ? compatibleBrowserUserAgent(original, applicationName) : original);
}
