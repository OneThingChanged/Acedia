export function validGitHubOwner(value: unknown): boolean;
export function tunnelConfigurationIssue(config: { client_id?: string; owner?: string; tunnel_token?: string; public_hostname?: string; server_port?: number }): "oauth" | "owner" | "hostname" | "port" | null;
export function assertTunnelConfigured(config: { client_id?: string; owner?: string; tunnel_token?: string; public_hostname?: string; server_port?: number }): void;
export function assertRemoteConfigured(config: { client_id?: string; owner?: string }): void;
