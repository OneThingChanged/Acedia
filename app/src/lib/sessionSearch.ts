export function normalizeSessionSearch(value: string): string {
  return value.trim().replace(/\\/g, "/").toLocaleLowerCase();
}
export function matchesSessionSearch(query: string, ...values: (string | undefined)[]): boolean {
  const term = normalizeSessionSearch(query);
  return values.some(value => value != null && normalizeSessionSearch(value).includes(term));
}
