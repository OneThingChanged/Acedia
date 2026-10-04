import { describe, expect, it } from 'vitest';
import { sessionCostLabel, sessionUsageCsv, sumSessionUsage } from './usage-sessions.js';
describe('session usage display and export', () => {
  it('does not turn missing pricing into a zero dollar charge', () => {
    expect(sessionCostLabel({ events: 0 })).toBe('—');
    expect(sessionCostLabel({ events: 1, pricedEvents: 0 })).not.toBe('$0.00');
    expect(sessionCostLabel({ events: 1, pricedEvents: 1, baselineUsd: 0 })).toBe('$0.00');
  });
  it('sums unrounded values and all token dimensions once', () => {
    const total = sumSessionUsage([{ baselineUsd: .004, totalTokens: 10, cacheReadTokens: 7 }, { baselineUsd: .004, totalTokens: 20, reasoningOutputTokens: 2 }]);
    expect(total).toMatchObject({ baselineUsd: .008, totalTokens: 30, cacheReadTokens: 7, reasoningOutputTokens: 2 });
  });
  it('exports precise costs, unknown cells and spreadsheet-safe user names', () => {
    const rows = [{ id: '1', name: '=HYPERLINK("bad")', projectName: '@formula', provider: 'codex', models: [], totals: { events: 0, pricedEvents: 0, unpricedEvents: 0 } },
      { id: '2', name: 'Normal', projectName: 'Project', provider: 'codex', models: [{ model: 'gpt-5.5' }], totals: { events: 1, pricedEvents: 1, unpricedEvents: 0, baselineUsd: .004, totalTokens: 10 } }];
    const csv = sessionUsageCsv(rows, 'today');
    expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain("'@formula");
    expect(csv).toContain('"0.004000"'); expect(csv).toContain('"", ""'.replace(' ', ''));
    expect(csv.startsWith('\ufeff')).toBe(true);
  });
});
