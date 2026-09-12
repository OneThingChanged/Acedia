import { describe, it, expect } from 'vitest';
import { usagePeriods } from './periods.mjs';
const accounts = [{ id: 's', kind: 'shared' }, { id: 'p', kind: 'personal' }];
const day = value => Date.parse(value + 'T00:00:00Z');
describe('calendar usage analysis', () => {
  it('groups Monday weeks across years and preserves totals when switching units', () => {
    const entries = [{ day: day('2025-12-31'), accountId: 's', total: 140, events: 1 }, { day: day('2026-01-01'), accountId: 'p', total: 420, events: 3 }];
    for (const unit of ['day', 'week', 'month']) {
      const rows = usagePeriods(entries, unit, day('2025-12-30'), day('2026-01-02'), accounts);
      expect(rows.reduce((s, r) => s + r.total, 0)).toBe(560);
      expect(rows.reduce((s, r) => s + r.events, 0)).toBe(4);
    }
    expect(usagePeriods(entries, 'week', day('2025-12-30'), day('2026-01-02'), accounts)).toEqual([{ day: day('2025-12-29'), label: '2025-12-29 ~ 2026-01-04', total: 560, shared: 140, personal: 420, events: 4 }]);
    const filtered = usagePeriods(entries, 'month', day('2025-12-30'), day('2026-01-02'), [accounts[0]]);
    expect(filtered.map(r => r.total)).toEqual([0, 140]);
  });
  it('uses Korean midnight, fills empty dates, and handles leap February', () => {
    const rows = usagePeriods([], 'day', Date.parse('2024-02-28T15:00:00Z'), Date.parse('2024-02-29T15:00:00Z'), accounts);
    expect(rows.map(r => r.label)).toEqual(['2024-03-01', '2024-02-29']);
    expect(rows.every(r => r.total === 0)).toBe(true);
  });
});
