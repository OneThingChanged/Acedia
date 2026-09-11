import { describe, it, expect } from 'vitest';
import { allowNotification, NOTIFICATION_DEFAULTS, WorkPowerPolicy, TerminalBellParser } from './notification-policy.mjs';

describe('notification and power policy', () => {
  it('applies completion, bell and focus conditions independently', () => {
    expect(allowNotification(NOTIFICATION_DEFAULTS, 'completion', true)).toBe(true);
    expect(allowNotification(NOTIFICATION_DEFAULTS, 'bell', false)).toBe(false);
    expect(allowNotification({...NOTIFICATION_DEFAULTS, bell:true, suppressFocused:true}, 'bell', true)).toBe(false);
    expect(allowNotification({...NOTIFICATION_DEFAULTS, bell:true, suppressFocused:true}, 'bell', false)).toBe(true);
  });
  it('releases a shared blocker only when all work ends, cancels or exits', () => {
    const tokens = new Set(); let counter = 0;
    const policy = new WorkPowerPolicy({start: () => {tokens.add(++counter); return counter;}, stop: id => tokens.delete(id), isStarted:id => tokens.has(id)});
    policy.sessions(['a','b']); policy.setMode('working'); expect(tokens.size).toBe(0);
    policy.hook({id:'a',event:'working'}); policy.hook({id:'b',event:'waiting'}); expect(tokens.size).toBe(1);
    policy.hook({id:'a',event:'done'}); expect(tokens.size).toBe(1);
    policy.hook({id:'b',event:'cancelled'}); expect(tokens.size).toBe(0);
    policy.hook({id:'b',event:'working'}); policy.sessions([]); expect(tokens.size).toBe(0);
    policy.hook({id:'b',event:'working'}); expect(tokens.size).toBe(0);
    policy.setMode('always'); expect(tokens.size).toBe(1);
    policy.setMode('off'); expect(tokens.size).toBe(0);
    policy.setMode('always'); policy.dispose(); expect(tokens.size).toBe(0);
  });
  it('ignores split OSC title and hyperlink terminators but detects real bells', () => {
    const parser = new TerminalBellParser();
    expect(parser.push('\x1b]0;ti')).toBe(false);
    expect(parser.push('tle\x07')).toBe(false);
    expect(parser.push('\x1b]8;;https://example.test\x1b')).toBe(false);
    expect(parser.push('\\text\x1b]8;;\x07')).toBe(false);
    expect(parser.push('text\x07')).toBe(true);
  });
});
