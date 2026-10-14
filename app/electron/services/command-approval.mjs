import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';

// A complete, current Codex dialog, not a line found in tool scrollback or a
// quoted question. Choice text and scope come from the native CLI itself.
export function codexCommandApprovalFrame(raw) {
  if (typeof raw !== 'string' || raw.length > 64 * 1024) return null;
  const lines = stripVTControlCharacters(raw).trimEnd().split(/\r?\n/).map(line => line.trimEnd());
  if (lines.at(-1)?.trim() !== 'Press enter to confirm or esc to cancel') return null;
  const header = lines.findLastIndex(line => line.trim() === 'Would you like to run the following command?');
  if (header < 0 || !lines.slice(header + 1).some(line => /^\s*\$\s+\S/.test(line))) return null;
  const choices = [];
  for (let i = header + 1; i < lines.length - 1; i++) {
    const match = /^\s*([›❯])?\s*(\d+)\.\s+(.+)$/.exec(lines[i]);
    if (match) choices.push({ row: i, selected: !!match[1], number: Number(match[2]), label: match[3].trim() });
    else if (choices.length && lines[i].trim()) choices.at(-1).label += ' ' + lines[i].trim();
  }
  if (choices.length !== 3 || choices.some((choice, i) => choice.number !== i + 1)) return null;
  if (choices[0].label !== 'Yes, proceed (y)'
    || !/^Yes, and don['’]t ask again for commands that start with `.+` \(p\)$/.test(choices[1].label)
    || choices[2].label !== 'No, and tell Codex what to do differently (esc)') return null;
  const selected = choices.flatMap((choice, i) => choice.selected ? [i] : []);
  if (selected.length !== 1) return null;
  const text = lines.slice(header, choices[0].row).join('\n').trim();
  const options = choices.map((choice, i) => ({ label: choice.label, send: String(i + 1) }));
  return { text, options, selectedIndex: selected[0], signature: JSON.stringify([text, options]) };
}

export class CommandApprovalResponder {
  constructor({ entry, snapshot, sessionId, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    this.entry = entry; this.snapshot = snapshot; this.sessionId = sessionId; this.wait = wait;
    this.records = new Map(); this.busy = new Set(); this.submitted = new Map();
  }
  isBusy(id) { return this.busy.has(id); }
  forget(id) { this.records.delete(id); }
  read(id, fallbackSessionId) {
    const entry = this.entry(id);
    const frame = entry?.aiToolId === 'codex' && !entry.ssh ? codexCommandApprovalFrame(this.snapshot(id)) : null;
    if (!frame) { this.records.delete(id); return null; }
    let record = this.records.get(id);
    const sessionId = this.sessionId(id) || fallbackSessionId || (record?.entry === entry ? record.sessionId : null);
    if (!sessionId) return null;
    if (record?.entry !== entry || record.sessionId !== sessionId || record.signature !== frame.signature) {
      record = { entry, sessionId, signature: frame.signature, id: `approval-${randomUUID()}` };
      this.records.set(id, record);
      if (this.records.size > 256) this.records.delete(this.records.keys().next().value);
    }
    return { sessionId, question: { id: record.id, toolName: 'command-approval',
      question: JSON.stringify({ approval: { type: 'codex-command', text: frame.text, options: frame.options } }) }, frame };
  }
  async answer(id, request) {
    const choice = request.approvalChoice;
    if (!Number.isInteger(choice) || choice < 0 || choice > 2 || typeof request.questionId !== 'string'
      || !request.questionId || request.questionId.length > 200 || typeof request.sessionId !== 'string'
      || !request.sessionId || request.sessionId.length > 200) throw new TypeError('Invalid approval choice or identity');
    if (this.busy.has(id)) throw new Error('An approval is already being submitted');
    const key = JSON.stringify([id, request.sessionId, request.questionId]);
    const previous = this.submitted.get(key);
    if (previous) {
      if (previous.state === 'sent' && previous.choice === choice) return { status: 'sent' };
      throw new Error('Approval outcome unknown or decision changed. Review the terminal.');
    }
    this.busy.add(id); let wrote = false;
    try {
      const entry = this.entry(id);
      const current = () => {
        const live = this.read(id);
        if (!entry?.process || this.entry(id) !== entry || live?.sessionId !== request.sessionId
          || live.question.id !== request.questionId) throw new Error('The command approval changed or was answered');
        return live.frame;
      };
      for (let step = 0; step < 3; step++) {
        const before = current().selectedIndex;
        if (before === choice) break;
        wrote = true; entry.process.write(before < choice ? '\x1b[B' : '\x1b[A');
        let moved = false;
        for (let attempt = 0; attempt < 15; attempt++) {
          await this.wait(60);
          if (current().selectedIndex !== before) { moved = true; break; }
        }
        if (!moved) throw new Error('Approval selection did not update. Review the terminal.');
      }
      if (current().selectedIndex !== choice) throw new Error('Approval selection changed');
      wrote = true; entry.process.write('\r');
      let confirmed = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        await this.wait(60);
        if (this.entry(id) !== entry) throw new Error('Terminal changed while submitting approval');
        const live = this.read(id);
        if (!live || live.question.id !== request.questionId) { confirmed = true; break; }
      }
      if (!confirmed) throw new Error('Approval outcome unknown. Review the terminal before retrying.');
      this.submitted.set(key, { state: 'sent', choice }); return { status: 'sent' };
    } catch (error) {
      if (wrote) this.submitted.set(key, { state: 'unknown', choice });
      throw error;
    } finally {
      this.busy.delete(id);
      if (this.submitted.size > 256) this.submitted.delete(this.submitted.keys().next().value);
    }
  }
}
