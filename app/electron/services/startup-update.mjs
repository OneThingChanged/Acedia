// One background check and one prompt owner for each application process.
// Dismissal lasts until the next launch, rather than suppressing a release.
export class StartupUpdateService {
  constructor({ enabled, check, record = () => {} }) {
    this.enabled = enabled;
    this.check = check;
    this.record = record;
    this.owner = null;
    this.pending = null;
    this.dismissed = false;
  }

  async claim(windowId) {
    if (!this.enabled || this.dismissed) return null;
    if (this.owner === null) this.owner = windowId;
    if (this.owner !== windowId) return null;
    this.pending ??= Promise.resolve().then(this.check).catch(error => {
      this.record("startup-check-failed", error);
      return null;
    });
    const update = await this.pending;
    return this.dismissed ? null : update;
  }

  dismiss(windowId) {
    if (this.owner === windowId) this.dismissed = true;
  }
}
