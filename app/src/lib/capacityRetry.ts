export type CapacityRetryState = {
  id: string;
  sessionId?: string;
  status: "scheduled" | "retrying" | "working" | "failed" | "cancelled" | "resolved";
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: number;
  reason?: string;
  at: number;
};

export function capacityRetryMessage(state: CapacityRetryState, english: boolean, now = Date.now()) {
  if (state.status === "scheduled") {
    const seconds = Math.max(0, Math.ceil(((state.nextRetryAt || now) - now) / 1000));
    return english ? `Model at capacity · retry ${state.attempt + 1}/${state.maxAttempts} in ${seconds}s with the same model`
      : `모델 용량 부족 · ${seconds}초 후 같은 모델로 재시도 ${state.attempt + 1}/${state.maxAttempts}`;
  }
  if (state.status === "retrying" || state.status === "working") {
    return english ? `Continuing with the same model · retry ${state.attempt}/${state.maxAttempts}`
      : `같은 모델로 이어서 진행 중 · 재시도 ${state.attempt}/${state.maxAttempts}`;
  }
  if (state.reason === "exhausted") {
    return english ? `The model is still at capacity after ${state.attempt} retries. Automatic retries stopped. Check this session.`
      : `같은 모델에 ${state.attempt}회 재시도했지만 용량 부족이 계속됩니다. 자동 재시도를 멈췄습니다. 세션을 확인해 주세요.`;
  }
  return english ? "Automatic retry could not be completed safely. Check this session before continuing."
    : "자동 재시도를 안전하게 완료하지 못했습니다. 이어서 진행하기 전에 세션을 확인해 주세요.";
}
