export function submissionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${Date.now()}-${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
}

// Include body reading in the deadline, not only receipt of response headers.
export async function requestJson(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const data = await response.json();
        return { response, data };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("서버 응답 시간이 초과되었습니다."));
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export class LatestRequest {
  sequence = 0;
  async run(load, apply, failed) {
    const sequence = ++this.sequence;
    try {
      const result = await load();
      if (sequence === this.sequence) apply(result);
    } catch (error) {
      if (sequence === this.sequence) failed(error);
    }
  }
}
