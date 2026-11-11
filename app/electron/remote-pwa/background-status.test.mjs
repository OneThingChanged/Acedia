import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import { resolveSessionWorkStatus, isSleepingSession } from '../shared/session-state.mjs';

it('uses the Remote native background status and holds queued messages until it ends', () => {
  const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const context = vm.createContext({ resolveSessionWorkStatus, isSleepingSession, text: value => String(value || '') });
  vm.runInContext(source.slice(source.indexOf('function statusOf('), source.indexOf('function stripTerminal(')), context);
  const start = source.indexOf('const agentBusy =');
  vm.runInContext(source.slice(start, source.indexOf('const agentInitializing =', start)) + '\nglobalThis.busy = agentBusy;', context);
  const agent = { status: 'working', runtimeStatus: 'running', hook: { event: 'background-wait', background_count: 1 } };
  expect(context.statusOf(agent)).toBe('background'); expect(context.busy(agent)).toBe(true);
  expect(context.displayStatusOf({ ...agent, deferredStart: true, resumeEligible: true })).toBe('sleeping');
  expect(context.busy({ ...agent, hook: { event: 'done' } })).toBe(false);
  expect(context.statusOf({ ...agent, status: 'offline' })).toBe('offline');
});
