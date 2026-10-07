export function tunnelConfigurationIssue(config) {
  if (!String(config?.client_id || "").trim() || !String(config?.owner || "").trim()) return "oauth";
  if (String(config?.tunnel_token || "").trim()) {
    if (!String(config?.public_hostname || "").trim()) return "hostname";
    const port = Number(config.server_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "port";
  }
  return null;
}

export function assertTunnelConfigured(config) {
  const issue = tunnelConfigurationIssue(config);
  if (issue === "oauth") throw new Error("Enter and save GitHub Client ID and Owner GitHub username before starting a tunnel.");
  if (issue === "hostname") throw new Error("Enter and save Public hostname for the named tunnel.");
  if (issue === "port") throw new Error("Enter and save a fixed local server port (1–65535) for the named tunnel.");
}

export function assertRemoteConfigured(config) {
  if (tunnelConfigurationIssue({ client_id: config?.client_id, owner: config?.owner })) {
    throw new Error("Enter and save GitHub Client ID and Owner GitHub username before starting Remote.");
  }
}
