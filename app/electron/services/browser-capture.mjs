const captures = new WeakMap();

// Native capture retains the compositor surface for repeated hidden captures.
// A new hidden Windows view may not have a surface yet; CDP initializes it
// without showing/focusing any window or changing the view's visibility.
export async function captureBrowserPng(contents, rect = null) {
  const previous = captures.get(contents) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const debuggerApi = contents.debugger;
    let attachedHere = false;
    let throttled;
    let timeout;
    let stopped = false;
    try {
      return await Promise.race([
        (async () => {
          if (typeof contents.capturePage === "function") {
            try {
              const image = await contents.capturePage(rect || undefined, { stayHidden: true, stayAwake: false });
              if (!image.isEmpty()) return image.toPNG();
            } catch (error) {
              if (!/display surface not available/i.test(error.message)) throw error;
            }
          }
          if (stopped || contents.isDestroyed()) throw new Error("Browser capture stopped");
          attachedHere = !debuggerApi.isAttached();
          if (attachedHere) debuggerApi.attach("1.3");
          throttled = contents.getBackgroundThrottling?.();
          if (typeof throttled === "boolean") contents.setBackgroundThrottling(true);
          const metrics = await debuggerApi.sendCommand("Page.getLayoutMetrics");
          if (stopped || contents.isDestroyed()) throw new Error("Browser capture stopped");
          const viewport = metrics.cssVisualViewport || metrics.visualViewport;
          const clip = {
            x: (viewport.pageX || 0) + (rect?.x || 0),
            y: (viewport.pageY || 0) + (rect?.y || 0),
            width: rect?.width || viewport.clientWidth,
            height: rect?.height || viewport.clientHeight,
            scale: 1,
          };
          // Hiding a WebContentsView can suspend its compositor even when
          // throttling was already disabled. Resume hidden painting after CDP
          // attachment/layout, without showing the view or changing focus.
          if (typeof throttled === "boolean") {
            contents.setBackgroundThrottling(false);
          }
          const result = await debuggerApi.sendCommand("Page.captureScreenshot", {
            format: "png", fromSurface: true, captureBeyondViewport: true, clip,
          });
          return Buffer.from(result.data, "base64");
        })(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => { stopped = true; reject(new Error("Background screenshot timed out")); }, 5000);
        }),
      ]);
    } finally {
      stopped = true;
      clearTimeout(timeout);
      if (typeof throttled === "boolean" && !contents.isDestroyed()) contents.setBackgroundThrottling(throttled);
      if (attachedHere && !contents.isDestroyed() && debuggerApi.isAttached()) debuggerApi.detach();
    }
  });
  captures.set(contents, operation);
  try { return await operation; }
  finally { if (captures.get(contents) === operation) captures.delete(contents); }
}
