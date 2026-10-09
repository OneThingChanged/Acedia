// Keep native objects alive for Action Center clicks and report the OS result,
// rather than treating a call to show() as proof of successful delivery.
export class NativeNotifications {
  constructor({ Notification, icon, timeoutMs = 5000, retentionMs = 60 * 60 * 1000, onError = error => console.warn('[electron] native notification failed', error.message) }) {
    Object.assign(this, { Notification, icon, timeoutMs, retentionMs, onError });
    this.active = new Set();
  }

  show({ title, body, silent, onClick }) {
    if (!this.Notification.isSupported()) return Promise.reject(new Error('Native notifications are not supported.'));
    return new Promise((resolve, reject) => {
      const notification = new this.Notification({ title, body, silent, icon: this.icon });
      let settled = false;
      let timeout, retention;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        error ? reject(error) : resolve(true);
      };
      const release = () => {
        clearTimeout(retention);
        this.active.delete(notification);
      };
      notification.once('show', () => finish());
      notification.on('failed', (_event, detail) => {
        const error = new Error(String(detail || 'Native notification delivery failed.'));
        this.onError(error);
        finish(error);
        release();
      });
      notification.once('click', () => { try { onClick?.(); } finally { release(); } });
      notification.on('close', (event, details) => {
        // A timed-out banner can still be clicked in Windows Action Center.
        const reason = event?.reason || details?.reason || details;
        if (reason !== 'timedOut') release();
      });
      this.active.add(notification);
      retention = setTimeout(release, this.retentionMs);
      retention.unref?.();
      timeout = setTimeout(() => {
        const error = new Error('Native notification delivery was not confirmed. Check Windows notification settings.');
        this.onError(error);
        finish(error);
        // Retain the click handler if Windows eventually delivers the toast.
      }, this.timeoutMs);
      try { notification.show(); }
      catch (error) { this.onError(error); finish(error); release(); }
    });
  }
}
