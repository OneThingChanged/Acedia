// Included subscription windows and server-reported extra credits are separate.
// A displayed balance alone is not authorization to use additional credits.
export function codexQuotaInfo(limits, now = Date.now()) {
  const bucket = limits?.rateLimitsByLimitId?.codex || limits?.rateLimits || limits;
  const includedExhausted = [bucket?.primary, bucket?.secondary]
    .some(window => window?.usedPercent >= 100 && (!window.resetsAt || window.resetsAt * 1000 > now));
  const creditsAvailable = bucket?.credits?.hasCredits === true || bucket?.credits?.unlimited === true;
  return { includedExhausted, creditsAvailable, creditFallbackAvailable: includedExhausted && creditsAvailable };
}
