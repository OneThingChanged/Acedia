// A GUI app can outlive the terminal which launched it. A closed log pipe
// must not become an Electron uncaught-exception dialog; other errors still fail.
export function guardConsoleOutput({ stdout = process.stdout, stderr = process.stderr, logger = console } = {}) {
  const cleanup = [];
  const disconnected = error => error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED";
  for (const [stream, methods] of [[stdout, ["log", "info", "debug"]], [stderr, ["warn", "error"]]]) {
    if (!stream?.on) continue;
    let closed = false;
    const onError = error => {
      if (disconnected(error)) closed = true;
      else throw error;
    };
    stream.on("error", onError);
    cleanup.push(() => stream.removeListener("error", onError));
    for (const method of methods) {
      const original = logger[method];
      if (typeof original !== "function") continue;
      const guarded = function (...args) {
        if (closed || stream.destroyed || stream.writableEnded) return;
        try { return original.apply(logger, args); }
        catch (error) { if (disconnected(error)) closed = true; else throw error; }
      };
      logger[method] = guarded;
      cleanup.push(() => { if (logger[method] === guarded) logger[method] = original; });
    }
  }
  return () => { for (const restore of cleanup.reverse()) restore(); };
}
