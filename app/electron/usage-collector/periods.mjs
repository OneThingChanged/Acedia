const DAY = 86400000;
const label = day => new Date(day).toISOString().slice(0, 10);

// day is a calendar date encoded as UTC midnight; the server groups in Asia/Seoul.
export function usagePeriods(entries, unit, from, to, accounts) {
  const start = day => {
    const date = new Date(day);
    if (unit === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    if (unit === 'week') return day - ((date.getUTCDay() + 6) % 7) * DAY;
    return day;
  };
  const advance = day => unit === 'month' ? Date.UTC(new Date(day).getUTCFullYear(), new Date(day).getUTCMonth() + 1, 1) : day + (unit === 'week' ? 7 : 1) * DAY;
  const first = Math.floor((from + 9 * 3600000) / DAY) * DAY, last = Math.floor((to + 9 * 3600000) / DAY) * DAY;
  const buckets = new Map(), kinds = new Map(accounts.map(a => [a.id, a.kind]));
  for (let day = start(first); day <= last; day = advance(day)) buckets.set(day, { day, label: unit === 'month' ? label(day).slice(0, 7) : unit === 'week' ? `${label(day)} ~ ${label(day + 6 * DAY)}` : label(day), total: 0, shared: 0, personal: 0, events: 0 });
  for (const entry of entries) {
    const bucket = buckets.get(start(entry.day));
    if (!bucket || !kinds.has(entry.accountId)) continue;
    bucket.total += entry.total; bucket.events += entry.events;
    bucket[kinds.get(entry.accountId) === 'shared' ? 'shared' : 'personal'] += entry.total;
  }
  return [...buckets.values()].reverse();
}
