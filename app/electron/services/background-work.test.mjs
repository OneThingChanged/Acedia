import { afterEach, expect, it, vi } from 'vitest';
import { BackgroundWorkMonitor, claudeBackgroundFrame } from './background-work.mjs';
import { TerminalSessionService } from './terminal-session-service.mjs';
import { TrackedTerminalFilter } from './terminal-stream.mjs';

const screen = (count = 1) => `${count ? `✻ Waiting for ${count} background agent${count === 1 ? '' : 's'} to finish` : '✻ Thinking…'}\n\n─────────────────\n❯ \n─────────────────\nbypass permissions on (shift+tab to cycle) · ↓ to manage`;
function fixture(provider = 'claude') {
  vi.useFakeTimers(); let text = screen();
  const entry = { id: 'a', aiToolId: provider, filter: { viewportText: vi.fn(() => text) } };
  const entries = new Map([['a', entry]]), events = [];
  const monitor = new BackgroundWorkMonitor({ entry: id => entries.get(id), publish: event => events.push(event) });
  return { entry, entries, events, monitor, frame: value => { text = value; }, flush: () => vi.advanceTimersByTime(200) };
}
afterEach(() => vi.useRealTimers());

it('recognizes only a current native waiting row, handles wrapping and ignores history/quotes/partial screens', () => {
  expect(claudeBackgroundFrame(screen(1))).toEqual({ count: 1 });
  expect(claudeBackgroundFrame(screen(12))).toEqual({ count: 12 });
  expect(claudeBackgroundFrame(screen(12).replace('background agents to finish', 'background agents\nto finish'))).toEqual({ count: 12 });
  expect(claudeBackgroundFrame(screen(0))).toEqual({ count: 0, foreground: true });
  expect(claudeBackgroundFrame(`Earlier history: ${screen(1)}\nA newer answer.\n❯ \nbypass permissions on`)).toEqual({ count: 0 });
  expect(claudeBackgroundFrame('✻ Waiting for 1 background agent to finish\n❯ ')).toBeNull();
  expect(claudeBackgroundFrame('Waiting for 1 background agent to finish')).toBeNull();
  expect(claudeBackgroundFrame('Assistant quoted:\n> ✻ Waiting for 1 background agent to finish\n❯ \n? for shortcuts')).toEqual({ count: 0 });
});

it('coalesces native output, emits only changes and restores foreground work without a new user-turn event', () => {
  const f = fixture(); f.monitor.hook({ id: 'a', event: 'working', session_id: 'original' });
  for (let i = 0; i < 100; i++) f.monitor.output(f.entry);
  expect(f.entry.filter.viewportText).not.toHaveBeenCalled();
  f.flush(); expect(f.entry.filter.viewportText).toHaveBeenCalledTimes(1);
  expect(f.events).toMatchObject([{ event: 'background-wait', background_count: 1, session_id: 'original' }]);
  f.monitor.output(f.entry); f.flush(); expect(f.events).toHaveLength(1);
  f.frame(screen(3)); f.monitor.output(f.entry); f.flush(); expect(f.events.at(-1).background_count).toBe(3);
  f.frame('partial'); f.monitor.output(f.entry); f.flush(); expect(f.events).toHaveLength(2);
  f.frame(screen(0)); f.monitor.output(f.entry); f.flush(); expect(f.events.at(-1)).toMatchObject({ event: 'tool-end', background_count: 0 });
});

it('holds a foreground Stop while native background work remains, then releases that exact completion once', () => {
  const f = fixture();
  const done = { id: 'a', event: 'done', hook_event_name: 'Stop', session_id: 'original', assistant_message: '결과 요약' };
  expect(f.monitor.hook(done)).toMatchObject({ event: 'background-wait', background_count: 1 });
  f.frame('partial'); expect(f.monitor.hook(done).event).toBe('background-wait');
  f.frame(screen(0)); f.monitor.output(f.entry); f.flush();
  expect(f.events.at(-1).event).toBe('tool-end'); // Parent resumed thinking: still busy.
  f.frame(screen(1)); f.monitor.output(f.entry); f.flush();
  f.frame(screen(0).replace('✻ Thinking…', '')); f.monitor.output(f.entry); f.flush();
  expect(f.events.at(-1)).toMatchObject({ event: 'done', session_id: 'original', assistant_message: '결과 요약', hook_event_name: 'BackgroundWorkResume' });
  expect(f.events.map(e => e.event)).toEqual(['tool-end', 'background-wait', 'done']);
  f.monitor.output(f.entry); f.flush(); expect(f.events).toHaveLength(3);
});

it('keeps questions/cancellation authoritative and drops timers from closed or replaced PTYs', () => {
  const f = fixture(); f.monitor.output(f.entry);
  f.monitor.hook({ id: 'a', event: 'waiting', interactive_question: '선택?' }); f.flush();
  f.monitor.output(f.entry); f.flush(); expect(f.events).toEqual([]);
  f.monitor.hook({ id: 'a', event: 'working' }); f.monitor.output(f.entry);
  f.monitor.hook({ id: 'a', event: 'cancelled' }); f.flush(); f.monitor.output(f.entry); f.flush(); expect(f.events).toEqual([]);
  f.monitor.hook({ id: 'a', event: 'working' }); f.monitor.output(f.entry); f.entries.delete('a'); f.monitor.prune([]); f.flush();
  expect(f.events).toEqual([]); expect(f.monitor.records.size).toBe(0);
  f.entries.set('a', f.entry); f.monitor.output(f.entry); f.entries.set('a', { ...f.entry }); f.flush(); expect(f.events).toEqual([]);
});

it('leaves other providers alone and contains observer failures with a retry on later output', () => {
  const ignored = fixture('codex'); ignored.monitor.output(ignored.entry); ignored.flush(); expect(ignored.events).toEqual([]);
  const f = fixture(); const publish = vi.spyOn(f.monitor, 'publish').mockImplementationOnce(() => { throw Error('fixture'); });
  f.monitor.output(f.entry); expect(f.flush).not.toThrow(); expect(f.events).toEqual([]);
  f.monitor.output(f.entry); f.flush(); expect(publish).toHaveBeenCalledTimes(2); expect(f.events).toHaveLength(1);
});

it('reads the existing parsed Claude viewport after ANSI repaints without changing delivered terminal bytes', () => {
  vi.useFakeTimers(); let emitData, emitExit;
  const events = [], delivered = [], entries = new Map();
  const monitor = new BackgroundWorkMonitor({ entry: id => entries.get(id), publish: e => events.push(e) });
  const service = new TerminalSessionService({ sessions: entries, onOutput: entry => monitor.output(entry),
    sendDataToView: (_view, event) => delivered.push(event.data), onSessionsChanged: ({ ids }) => monitor.prune(ids) });
  const entry = { id: 'a', aiToolId: 'claude', filter: new TrackedTerminalFilter(16, 90),
    process: { onData: fn => { emitData = fn; }, onExit: fn => { emitExit = fn; }, kill() {} } };
  service.register(entry, service.beginSpawn('a')); service.attach('a', 1);
  const bytes = `\x1b[2J\x1b[H\x1b[35m${screen(2).replaceAll('\n', '\r\n')}\x1b[0m`;
  emitData(bytes); vi.advanceTimersByTime(200);
  expect(events).toMatchObject([{ event: 'background-wait', background_count: 2 }]); expect(delivered.join('')).toBe(bytes);
  emitData('spinner'); emitExit({ exitCode: 0 }); vi.advanceTimersByTime(200); expect(monitor.records.size).toBe(0);
});
