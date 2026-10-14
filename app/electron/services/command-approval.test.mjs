import { describe, expect, it } from 'vitest';
import { CommandApprovalResponder, codexCommandApprovalFrame } from './command-approval.mjs';
import { parseChatPrompt } from '../shared/chat-prompt.mjs';
import { QuestionResponder } from './question-responder.mjs';

function frame(selected = 1, command = 'echo fixture') {
  return ['Earlier conversation', 'Would you like to run the following command?', 'Environment: local',
    'Reason: Inspect fixture', `$ ${command}`, '',
    `${selected === 1 ? '›' : ' '} 1. Yes, proceed (y)`,
    `${selected === 2 ? '›' : ' '} 2. Yes, and don't ask again for commands that start with \`${command}\` (p)`,
    `${selected === 3 ? '›' : ' '} 3. No, and tell Codex what to do differently (esc)`, '',
    'Press enter to confirm or esc to cancel', '', ''].join('\n');
}
function fixture(selected = 1, stuck = false) {
  let screen = frame(selected), session = 'session-a'; const writes = [];
  let entry = { aiToolId: 'codex', process: { write: data => {
    writes.push(data);
    if (stuck) return;
    if (data === '\r') screen = 'Command finished\n› Ask Codex\ngpt-6-sol high · folder';
    else { selected += data === '\x1b[B' ? 1 : -1; screen = frame(selected); }
  } } };
  const responder = new CommandApprovalResponder({ entry: () => entry, snapshot: () => screen,
    sessionId: () => session, wait: async () => {} });
  const pending = responder.read('agent');
  return { responder, pending, writes, request: choice => ({ sessionId: session, questionId: pending.question.id, approvalChoice: choice }),
    change: value => { screen = value; }, account: () => { session = 'session-b'; }, replace: () => { entry = { ...entry }; } };
}

describe('native command approval', () => {
  it('recognizes the complete live selector and projects exact command/scope choices into Chat', () => {
    const f = fixture(3);
    expect(codexCommandApprovalFrame(frame(3)).selectedIndex).toBe(2);
    const prompt = parseChatPrompt('waiting', f.pending.question.question, '', 'codex');
    expect(prompt).toMatchObject({ kind: 'permission', answerStyle: 'codex-approval' });
    expect(prompt.text).toContain('$ echo fixture');
    expect(prompt.options[1].label).toContain('commands that start with `echo fixture`');
    expect(codexCommandApprovalFrame(frame() + '\n› Ask Codex\ngpt-6-sol low · folder')).toBeNull();
    expect(codexCommandApprovalFrame(frame().replace('Press enter to confirm or esc to cancel', 'enter to submit answer'))).toBeNull();
    expect(codexCommandApprovalFrame(frame().replace('› 1.', '  1.'))).toBeNull();
  });
  it.each([0, 1, 2])('verifies the selected row before Enter and never invents digit commands (%s)', async choice => {
    const f = fixture(3);
    await expect(f.responder.answer('agent', f.request(choice))).resolves.toEqual({ status: 'sent' });
    expect(f.writes).toEqual([...Array(2 - choice).fill('\x1b[A'), '\r']);
    expect(f.responder.read('agent')).toBeNull();
    await expect(f.responder.answer('agent', f.request(choice))).resolves.toEqual({ status: 'sent' });
    expect(f.writes).toHaveLength(3 - choice);
  });
  it.each(['command', 'session', 'process'])('rejects a changed %s without writing an approval', async change => {
    const f = fixture(); const request = f.request(0);
    if (change === 'command') f.change(frame(1, 'different-command'));
    else if (change === 'session') f.account(); else f.replace();
    await expect(f.responder.answer('agent', request)).rejects.toThrow('changed');
    expect(f.writes).toEqual([]);
  });
  it('does not repeat keys after an uncertain partial answer', async () => {
    const f = fixture(3, true);
    await expect(f.responder.answer('agent', f.request(0))).rejects.toThrow('did not update');
    await expect(f.responder.answer('agent', f.request(0))).rejects.toThrow('outcome unknown');
    expect(f.writes).toEqual(['\x1b[A']);
  });
  it('gives consecutive identical commands separate approval IDs and excludes SSH', () => {
    const f = fixture(); f.change('› Ask Codex'); expect(f.responder.read('agent')).toBeNull();
    f.change(frame()); expect(f.responder.read('agent').question.id).not.toBe(f.pending.question.id);
    const ssh = new CommandApprovalResponder({ entry: () => ({ aiToolId: 'codex', ssh: {}, process: {} }),
      snapshot: () => frame(), sessionId: () => 's' });
    expect(ssh.read('agent')).toBeNull();
  });
  it('preserves multiline commands and wrapped permission scope without truncation', () => {
    const command = 'git status --short\n  --branch';
    const screen = frame(2, command).replace('commands that start with', 'commands that\n  start with');
    const parsed = codexCommandApprovalFrame(screen);
    expect(parsed.text).toContain('$ ' + command);
    expect(parsed.options[1].label).toContain('commands that start with `git status --short --branch`');
    expect(parsed.selectedIndex).toBe(1);
  });
  it('rejects a different decision on an already answered approval', async () => {
    const f = fixture(); await f.responder.answer('agent', f.request(0));
    await expect(f.responder.answer('agent', f.request(2))).rejects.toThrow('decision changed');
    expect(f.writes).toEqual(['\r']);
  });
  it('shares the existing answer lock and rejects simultaneous approval submissions', async () => {
    const f = fixture();
    let release;
    f.responder.wait = () => new Promise(resolve => { release = resolve; });
    const questions = new QuestionResponder({ approvals: f.responder });
    const answer = questions.answer('agent', f.request(0));
    expect(questions.isBusy('agent')).toBe(true);
    await expect(questions.answer('agent', f.request(0))).rejects.toThrow('already');
    release(); await expect(answer).resolves.toEqual({ status: 'sent' });
    expect(questions.isBusy('agent')).toBe(false);
    expect(f.writes).toEqual(['\r']);
  });
});
