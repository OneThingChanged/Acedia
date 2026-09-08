const captures = new WeakMap();

// The native display-surface API cannot capture hidden WebContentsViews on
// Windows. CDP can capture the viewport without showing or focusing any window.
export async function captureBrowserPng(contents, rect = null) {
  const previous = captures.get(contents) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const debuggerApi = contents.debugger;
    const attachedHere = !debuggerApi.isAttached();
    let timeout;
    try {
      if (attachedHere) debuggerApi.attach("1.3");
      return await Promise.race([
        (async () => {
          const metrics = await debuggerApi.sendCommand("Page.getLayoutMetrics");
          const viewport = metrics.cssVisualViewport || metrics.visualViewport;
          const clip = {
            x: (viewport.pageX || 0) + (rect?.x || 0),
            y: (viewport.pageY || 0) + (rect?.y || 0),
            width: rect?.width || viewport.clientWidth,
            height: rect?.height || viewport.clientHeight,
            scale: 1,
          };
          const result = await debuggerApi.sendCommand("Page.captureScreenshot", {
            format: "png", fromSurface: true, captureBeyondViewport: true, clip,
          });
          return Buffer.from(result.data, "base64");
        })(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Background screenshot timed out")), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (attachedHere && !contents.isDestroyed() && debuggerApi.isAttached()) debuggerApi.detach();
    }
  });
  captures.set(contents, operation);
  try { return await operation; }
  finally { if (captures.get(contents) === operation) captures.delete(contents); }
}
