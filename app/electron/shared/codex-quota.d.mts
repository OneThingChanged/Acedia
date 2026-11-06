export function codexQuotaInfo(limits: unknown, now?: number): {
  includedExhausted: boolean;
  creditsAvailable: boolean;
  creditFallbackAvailable: boolean;
};
