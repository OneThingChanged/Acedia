// A slow response must remain usable while state polls continue. Only explicit
// latest/file refreshes queue a follow-up; ordinary polls share the pending read.
export function createChatRequests({ timeoutMs = 20000 } = {}) {
  let selected = null;
  const pending = new Map();
  const cancel = () => { selected = null; for (const job of pending.values()) job.controller.abort(); pending.clear(); };
  function run(id, options, read) {
    if (selected !== id) { cancel(); selected = id; }
    const key = options.prepend ? 'older' : 'latest';
    const previous = pending.get(key);
    if (previous) {
      if (!options.prepend && (options.latest || options.refreshFiles)) previous.followup = {
        latest: !!(previous.followup?.latest || options.latest), refreshFiles: !!(previous.followup?.refreshFiles || options.refreshFiles),
      };
      return previous.promise;
    }
    const controller = new AbortController(), job = { controller, followup: null, promise: null };
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    pending.set(key, job);
    job.promise = Promise.resolve().then(() => read(options, controller.signal)).finally(() => {
      clearTimeout(timer);
      if (pending.get(key) !== job) return;
      pending.delete(key);
      if (selected === id && !controller.signal.aborted && job.followup) void run(id, job.followup, read).catch(() => {});
    });
    return job.promise;
  }
  return { run, cancel };
}
