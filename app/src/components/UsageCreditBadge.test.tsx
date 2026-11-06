import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UsageCreditBadge } from './UsageStatusBar';
import { AppLanguageProvider } from '../lib/appLanguage';
import type { UsageRateLimit } from '../lib/usageRateLimits';

const limit: UsageRateLimit = { limitId: 'codex', limitName: 'Codex', planType: 'pro', updatedAt: 0,
  primary: { usedPercent: 100, windowMinutes: 300, resetsAt: 5000 }, secondary: null,
  credits: { hasCredits: true, unlimited: false, balance: '25' } };
const render = (value: UsageRateLimit) => renderToStaticMarkup(<UsageCreditBadge limit={value} now={2_000_000}/>);

describe('included limit and extra credit status in the desktop footer', () => {
  it('shows available credit fallback without changing the actual 100% usage', () => {
    expect(render(limit)).toContain('크레딧 가능');
    expect(renderToStaticMarkup(<AppLanguageProvider><UsageCreditBadge limit={limit} now={2_000_000}/></AppLanguageProvider>)).toContain('Credits available');
    expect(limit.primary?.usedPercent).toBe(100);
    expect(render({ ...limit, credits: { ...limit.credits, hasCredits: false, unlimited: true } })).toContain('usage-credit-badge');
  });
  it('does not promise fallback without server credit flags, before exhaustion or after reset', () => {
    expect(render({ ...limit, credits: { ...limit.credits, hasCredits: false } })).toBe('');
    expect(render({ ...limit, primary: { ...limit.primary!, usedPercent: 99 } })).toBe('');
    expect(render({ ...limit, primary: { ...limit.primary!, resetsAt: 2000 } })).toBe('');
  });
});
