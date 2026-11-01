// OS settings are the source of truth. Never re-enable a startup entry during
// app launch: Windows Task Manager may have intentionally disabled it.
export class WindowsLoginStartup {
  constructor({ app, platform = process.platform, executable = process.execPath, variant, isolated = false, windowsStore = false }) {
    Object.assign(this, { app, platform, executable, variant, isolated, windowsStore });
  }
  reason() {
    if (this.platform !== 'win32') return 'windows-only';
    if (this.windowsStore || this.variant.id === 'store') return 'store';
    if (!this.app.isPackaged || this.isolated) return 'development';
    return null;
  }
  read() {
    const reason = this.reason();
    if (reason) return { supported: false, enabled: false, registered: false, windowsDisabled: false, reason };
    const options = { path: this.executable, args: [] };
    const result = this.app.getLoginItemSettings(options);
    const item = result.launchItems?.find(item => item.name === this.variant.appUserModelId);
    const registered = result.openAtLogin === true;
    const windowsDisabled = registered && (item?.enabled === false || result.executableWillLaunchAtLogin === false);
    return { supported: true, enabled: registered && !windowsDisabled, registered, windowsDisabled, reason: null };
  }
  set(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid Windows startup setting');
    if (this.reason()) throw new Error('Windows startup is available in an installed EXE build.');
    this.app.setLoginItemSettings({ openAtLogin: enabled, enabled, path: this.executable, args: [], name: this.variant.appUserModelId });
    const state = this.read();
    if (enabled ? !state.enabled : state.registered) throw new Error('Windows did not apply the startup setting. Check Startup apps in Windows Settings.');
    return state;
  }
}

export class RemoteAppStartup {
  constructor({ enabled, config, validate, startServer, startTunnel }) {
    Object.assign(this, { enabled, config, validate, startServer, startTunnel });
    this.state = { phase: 'idle', error: null };
    this.pending = null;
    this.cancelled = false;
  }
  status() { return { ...this.state }; }
  clear() { this.state = { phase: 'idle', error: null }; }
  cancel() { this.cancelled = true; this.clear(); }
  run() {
    if (this.pending) return this.pending;
    if (!this.enabled || this.config().auto_start !== true) return Promise.resolve(this.status());
    this.state = { phase: 'starting', error: null };
    this.pending = (async () => {
      try {
        this.validate(this.config());
        await this.startServer();
        // Only reconnect an explicitly saved named tunnel. Never create a new
        // public quick-tunnel URL just because the desktop app started.
        if (!this.cancelled && this.config().auto_start === true && this.config().auto_start_tunnel === true) {
          const config = this.config();
          if (!String(config.tunnel_token || '').trim() || !String(config.public_hostname || '').trim()
            || !Number.isInteger(Number(config.server_port)) || Number(config.server_port) < 1 || Number(config.server_port) > 65535) throw new Error('Named tunnel configuration required');
          await this.startTunnel();
        }
        if (!this.cancelled) this.state = { phase: 'started', error: null };
      } catch {
        // Never reflect a provider error containing credentials into the UI.
        if (!this.cancelled) this.state = { phase: 'failed', error: 'Remote automatic startup failed. Check saved GitHub settings, port and tunnel connection, then use Start to retry.' };
      }
      return this.status();
    })();
    return this.pending;
  }
}
