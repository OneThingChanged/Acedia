// Comparison baseline, not a subscription charge or a reconstruction of an API bill.
export const PRICE_BASIS = Object.freeze({
  date: '2026-09-13', currency: 'USD',
  source: 'https://developers.openai.com/api/docs/pricing',
  label: '표준·짧은 문맥 단가 기준 환산액',
});
// USD per million uncached input / cached input / output (including reasoning).
const rates = new Map(Object.entries({
  'gpt-6-astra': [10, 1, 50],
  'gpt-5.6-sol': [4, 0.4, 20],
  'gpt-5.6-terra': [2, 0.2, 12],
  'gpt-5.6-luna': [0.2, 0.02, 1.2],
  'gpt-5.5': [5, 0.5, 30],
  'gpt-5.4': [2.5, 0.25, 15],
  'gpt-5.3-codex': [1.75, 0.175, 14],
}));
export function baselineCost(event) {
  const rate = event.provider === 'codex' && rates.get(event.model);
  if (!rate) return null;
  // Missing breakdowns are not zero. Codex output excludes its reasoning count.
  if (![event.input, event.cacheRead, event.output, event.reasoning].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  // The collector cannot identify cache-write billing or long-context/tier premiums.
  // Keep the baseline comparable by valuing only the three stated token categories.
  return (event.input * rate[0] + event.cacheRead * rate[1] + (event.output + event.reasoning) * rate[2]) / 1e6;
}

export function costTimeline(records) {
  const groups = new Map();
  for (const record of records) {
    const day = Math.floor((record.occurredAt + 32400000) / 86400000) * 86400000;
    const key = JSON.stringify([day, record.accountId, record.employeeId, record.deviceId]);
    let group = groups.get(key);
    if (!group) { group = { day, accountId: record.accountId, employeeId: record.employeeId, deviceId: record.deviceId, usd: 0, priced: 0, unpriced: 0 }; groups.set(key, group); }
    const cost = baselineCost(JSON.parse(record.json));
    if (cost == null) group.unpriced++; else { group.usd += cost; group.priced++; }
  }
  return [...groups.values()];
}

export function modelUsage(records) {
  const groups = new Map();
  for (const row of records) {
    const event = JSON.parse(row.json), model = event.model || null, effort = event.effort || null;
    const day = Math.floor((row.occurredAt + 32400000) / 86400000) * 86400000;
    const key = JSON.stringify([day,row.employeeId,row.accountId,row.provider,model,effort]);
    let group = groups.get(key);
    if (!group) { group = {day,employeeId:row.employeeId,accountId:row.accountId,provider:row.provider,model,effort,requests:0,tokens:0,usd:0,priced:0,unpriced:0};groups.set(key,group); }
    group.requests++; group.tokens += row.total;
    const cost = baselineCost({...event,provider:row.provider});
    if (cost == null) group.unpriced++; else {group.priced++;group.usd+=cost;}
  }
  return [...groups.values()];
}
