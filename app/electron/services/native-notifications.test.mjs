import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeNotifications } from './native-notifications.mjs';

function fixture() {
  const notifications = [];
  class Notification extends EventEmitter {
    static isSupported() { return true; }
    constructor(options) { super(); this.options = options; notifications.push(this); }
    show() {}
  }
  const onError = vi.fn();
  const service = new NativeNotifications({ Notification, icon: 'acedia.png', onError });
  return { Notification, notifications, service, onError };
}

describe('native notification delivery', () => {
  afterEach(() => vi.useRealTimers());
  it('waits for OS delivery and retains the native object for its click handler', async () => {
    vi.useFakeTimers();
    const { service, notifications } = fixture();
    const onClick = vi.fn();
    const promise = service.show({ title: 'Project / Session', body: 'Done', silent: true, onClick });
    const n = notifications[0];
    expect(n.options).toEqual({ title: 'Project / Session', body: 'Done', silent: true, icon: 'acedia.png' });
    expect(service.active.has(n)).toBe(true);
    n.emit('show');
    await expect(promise).resolves.toBe(true);
    n.emit('close', { reason: 'timedOut' });
    expect(service.active.has(n)).toBe(true);
    n.emit('click'); n.emit('click');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(service.active.size).toBe(0);
  });
  it('rejects and releases an OS failure instead of returning success', async () => {
    vi.useFakeTimers();
    const { service, notifications, onError } = fixture();
    const promise = service.show({ title: 'Acedia' });
    const rejection = expect(promise).rejects.toThrow('Windows error');
    notifications[0].emit('failed', {}, 'Windows error');
    await rejection;
    expect(service.active.size).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it('reports an unconfirmed request and bounds retained click handlers', async () => {
    vi.useFakeTimers();
    const { service, notifications } = fixture();
    const promise = service.show({ title: 'Acedia' });
    const rejection = expect(promise).rejects.toThrow('not confirmed');
    await vi.advanceTimersByTimeAsync(5000);
    await rejection;
    expect(service.active.has(notifications[0])).toBe(true);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(service.active.size).toBe(0);
  });
  it('handles unsupported platforms and synchronous native errors', async () => {
    const f = fixture();
    f.Notification.isSupported = () => false;
    await expect(f.service.show({})).rejects.toThrow('not supported');
    expect(f.notifications).toHaveLength(0);
    f.Notification.isSupported = () => true;
    f.Notification.prototype.show = () => { throw Error('Native construction failure'); };
    await expect(f.service.show({})).rejects.toThrow('Native construction failure');
    expect(f.service.active.size).toBe(0);
  });
  it('keeps separate notifications and releases only the dismissed one', async () => {
    vi.useFakeTimers();
    const { service, notifications } = fixture();
    const a = vi.fn(), b = vi.fn();
    const first = service.show({ title: 'Same title', onClick: a });
    const second = service.show({ title: 'Same title', onClick: b });
    notifications.forEach(n => n.emit('show'));
    await Promise.all([first, second]);
    notifications[0].emit('close', {}, { reason: 'userCanceled' });
    expect(service.active.size).toBe(1);
    notifications[1].emit('click');
    expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledTimes(1);
  });
});
