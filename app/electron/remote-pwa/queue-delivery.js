// A queue may advance only after the host has observed the previous accepted
// turn and an empty composer. Browser status polls can lag behind terminal input.
export function createQueueInputGate({ inspect, now = Date.now, intervalMs = 1000 }) {
  const entries = new Map();
  const waiting = { supported: true, ready: false, reason: 'checking' };
  function store(id, record) { entries.delete(id); entries.set(id, record); if (entries.size > 512) entries.delete(entries.keys().next().value); }
  return {
    async check(id, sessionId) {
      const old = entries.get(id);
      if (old && old.sessionId === sessionId) {
        if (old.pending) return old.pending;
        if (now() - old.at < intervalMs) return old.result;
      }
      const record = { sessionId, at: now(), result: waiting };
      store(id, record);
      record.pending = Promise.resolve().then(() => inspect(id, sessionId)).then(result => {
        // An intervening send invalidates any older readiness response.
        if (entries.get(id) !== record) return waiting;
        record.result = result; return result;
      }).catch(() => ({ supported: true, ready: false, reason: 'status-unavailable' })).finally(() => { record.pending = null; record.at = now(); });
      return record.pending;
    },
    sent(id, sessionId) { store(id, { sessionId, at: now(), result: waiting }); },
    clear(id) { entries.delete(id); },
  };
}
