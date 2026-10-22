import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { ActiveQuestions, AsyncQuestionNotifier, QUESTION_TAIL_BYTES } from './active-questions.mjs';
import { hasQueuedCodexQuestion, codexQuestionFrame } from './question-responder.mjs';
import { CommandApprovalResponder } from './command-approval.mjs';
import { normalizeTranscriptPath, isTranscriptInsideRoot } from './transcript-path.mjs';

const line = payload => JSON.stringify({ type: 'response_item', payload }) + '\n';
const call = { type: 'function_call', call_id: 'q1', name: 'functions.request_user_input', arguments: '{"questions":[{"id":"color","question":"Which?","options":[{"label":"Blue"}]}]}' };
describe('active question tail monitor', () => {
  it('wires the real main-process reader to the resumed conversation binding without a hook path', async () => {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-active-question-'));
    const root=path.join(directory,'selected'),other=path.join(directory,'other');
    await fs.mkdir(root);await fs.mkdir(other);
    const transcriptPath=path.join(root,'session-resumed.jsonl'),foreign=path.join(other,'session-resumed.jsonl');
    try {
      const content=JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type:'task_complete',turn_id:'previous'}})+'\n';
      await fs.writeFile(transcriptPath,content);await fs.writeFile(foreign,content);
      const source=await fs.readFile(new URL('../main.mjs',import.meta.url),'utf8');
      const setup=source.match(/const activeQuestions = new ActiveQuestions\(\{[\s\S]*?\r?\n\}\);/)?.[0];
      const readSource=source.match(/async function currentQuestion\(id\) \{[\s\S]*?\r?\n\}/)?.[0];
      expect(setup).toBeTruthy();expect(readSource).toBeTruthy();
      const resolve=vi.fn(()=>({path:transcriptPath,tool:'codex'}));
      const env={ActiveQuestions,ptys:new Map([['target',{id:'target',aiToolId:'codex',startedAt:0}]]),agentSessionIds:new Map(),
        accountBindings:new Map([['target',{toolId:'codex',accountId:'selected',sessionId:'session-resumed'}]]),
        agentTranscripts:new Map(),agentTranscriptTool:new Map(),transcriptMissUntil:new Map(),normalizeTranscriptPath,isTranscriptInsideRoot,
        resolveChatTranscriptBySession:resolve,selectedAccountId:()=> 'selected',accountTranscriptRoot:()=>root,
        commandApprovals:{read:()=>null},hasQueuedCodexQuestion,codexQuestionFrame};
      const reader=vm.runInNewContext(`(function(){${setup}; return ${readSource};})()`,env);
      expect(await reader('target')).toMatchObject({sessionId:'session-resumed',lifecycle:'idle',question:null});
      expect(resolve).toHaveBeenCalledWith('codex','session-resumed',{toolId:'codex',accountId:'selected'});
      expect(env.agentTranscripts.get('target')).toBe(transcriptPath);
      await reader('target');expect(resolve).toHaveBeenCalledTimes(1);
      env.agentTranscripts.clear();resolve.mockReturnValue({path:foreign,tool:'codex'});
      expect(await reader('target')).toBeNull();expect(env.agentTranscripts.size).toBe(0);
      await reader('target');expect(resolve).toHaveBeenCalledTimes(2);
    } finally {await fs.rm(directory,{recursive:true});}
  });
  it('resolves an exact account-scoped resumed transcript before any hook or Chat lookup', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-active-question-'));
    const transcriptPath = path.join(root, 'session-resumed.jsonl');
    try {
      await fs.writeFile(transcriptPath, JSON.stringify({ timestamp: new Date().toISOString(), type:'event_msg', payload:{type:'task_complete',turn_id:'previous-turn'} })+'\n');
      const resolveTranscript = vi.fn(() => transcriptPath);
      const monitor = new ActiveQuestions({ resolveTranscript });
      const args = { id:'background', tool:'codex', root, sessionId:'session-resumed', startedAt:0 };
      const read = await monitor.read(args);
      expect(read).toMatchObject({ sessionId:'session-resumed', question:null, lifecycle:'idle', turn:{id:'previous-turn',status:'done'} });
      expect(resolveTranscript).toHaveBeenCalledWith({ id:'background', tool:'codex', root, sessionId:'session-resumed' });
      expect(await monitor.read({...args,transcriptPath})).toBe(read);
      expect(resolveTranscript).toHaveBeenCalledTimes(1);
      // Scope, identity and launch freshness remain required after resolution.
      expect(await monitor.read({...args,root:path.join(root,'other')})).toBeNull();
      expect(await monitor.read({...args,sessionId:'wrong-session'})).toBeNull();
      expect(await monitor.read({...args,startedAt:Date.now()+1000})).toBeNull();
      expect(await new ActiveQuestions().read(args)).toBeNull();
    } finally { await fs.rm(root,{recursive:true}); }
  });
  it('retains a live Claude form when its earlier user prompt is flushed after the assistant call', async () => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-active-question-'));
    const transcriptPath=path.join(root,'claude-session.jsonl');
    const ask={type:'assistant',timestamp:'2026-10-15T02:49:04.309Z',message:{stop_reason:'tool_use',content:[{type:'tool_use',id:'call-claude',name:'AskUserQuestion',input:{questions:[{question:'Which?',options:[{label:'One'},{label:'Both'}]}]}}]}};
    const prompt={type:'user',timestamp:'2026-10-15T02:49:04.226Z',message:{role:'user',content:'Review first.'}};
    try{
      await fs.writeFile(transcriptPath,[ask,prompt].map(value=>JSON.stringify(value)+'\n').join(''));
      const monitor=new ActiveQuestions(),args={id:'fixture',tool:'claude',root,transcriptPath,sessionId:'claude-session'};
      expect((await monitor.read(args)).question?.id).toBe('call-claude');
      await fs.appendFile(transcriptPath,JSON.stringify({type:'user',timestamp:'2026-10-15T02:49:05.000Z',message:{content:[{type:'tool_result',tool_use_id:'call-claude',content:'One'}]}})+'\n');
      expect((await monitor.read(args)).question).toBeNull();
      await fs.appendFile(transcriptPath,JSON.stringify({...ask,timestamp:'2026-10-15T02:49:06.000Z'})+'\n'+JSON.stringify({...prompt,timestamp:'2026-10-15T02:49:07.000Z'})+'\n');
      expect((await monitor.read(args)).question).toBeNull();
    }finally{await fs.rm(root,{recursive:true});}
  });
  it('keeps working async questions visible through the live host guard with either CLI shortcut', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-active-question-'));
    const transcriptPath = path.join(root, 'session-one.jsonl');
    try {
      const asyncCall = { ...call, name: 'request_user_input_async', arguments: JSON.stringify({ questions: [
        { title: 'Which body bones?', options: ['Existing bones', 'Custom bones'] },
        { title: 'Which input meshes?', options: ['All meshes', 'Body only'] },
      ] }) };
      await fs.writeFile(transcriptPath, line(asyncCall) + line({ type: 'function_call_output', call_id: 'q1', output: '{"accepted":true}' }));
      let screen = '';
      const source = await fs.readFile(new URL('../main.mjs', import.meta.url), 'utf8');
      const currentQuestionSource = source.match(/async function currentQuestion\(id\) \{[\s\S]*?\r?\n\}/)?.[0];
      expect(currentQuestionSource).toBeTruthy();
      const ptys = new Map([['a', { aiToolId: 'codex', startedAt: 0, filter: { viewportText: () => screen } }]]);
      const agentSessionIds = new Map([['a', 'session-one']]);
      const currentQuestion = vm.runInNewContext(`(${currentQuestionSource})`, {
        ptys, agentSessionIds, accountBindings: new Map(),
        commandApprovals: new CommandApprovalResponder({ entry: id => ptys.get(id),
          snapshot: () => screen, sessionId: id => agentSessionIds.get(id) }),
        accountTranscriptRoot: () => root, selectedAccountId: () => 'default',
        agentTranscripts: new Map([['a', transcriptPath]]), activeQuestions: new ActiveQuestions(),
        hasQueuedCodexQuestion, codexQuestionFrame,
      });
      for (const hint of ['shift+tab', 'shift+↑']) {
        screen = `Working (2m 21s · esc to interrupt)\nQueued follow-up inputs\n  ? 2 questions\n    ${hint} to answer\n› Ask Codex to do anything`;
        expect((await currentQuestion('a')).question).toMatchObject({ id: 'q1', async: true, question: asyncCall.arguments });
      }
      screen = 'Question 1/2 (2 unanswered)\nWhich body bones?\n› 1. Existing bones\nenter to submit all';
      expect((await currentQuestion('a')).question?.id).toBe('q1');
      screen = 'Working · Browsing\nQueued follow-up inputs\n› Continue';
      expect((await currentQuestion('a')).question).toBeNull();
      // An execution approval is absent from JSONL; only the current native
      // selector can supply it. It must take priority over an old async call.
      screen = ['Would you like to run the following command?', 'Environment: local', '$ git status --short',
        '› 1. Yes, proceed (y)', "  2. Yes, and don't ask again for commands that start with `git status --short` (p)",
        '  3. No, and tell Codex what to do differently (esc)', 'Press enter to confirm or esc to cancel'].join('\n');
      const approval = await currentQuestion('a');
      expect(approval.question.toolName).toBe('command-approval');
      expect(approval.sessionId).toBe('session-one');
      expect(approval.question.question).toContain('git status --short');
      screen = '› Ask Codex to do anything';
      expect((await currentQuestion('a')).question).toBeNull();
    } finally { await fs.rm(root, { recursive: true }); }
  });
  it('reads a bounded tail, retains unanswered calls across large output, and resolves only matching results', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-active-question-'));
    const file = path.join(root, 'session-one.jsonl');
    try {
      await fs.writeFile(file, 'x'.repeat(QUESTION_TAIL_BYTES * 3) + '\n' + line(call));
      const monitor = new ActiveQuestions();
      const request = { id: 'a', tool: 'codex', root, transcriptPath: file, sessionId: 'session-one' };
      const first = await monitor.read(request);
      expect(first.question.id).toBe('q1');
      expect(await monitor.read(request)).toBe(first);
      await fs.appendFile(file, 'x'.repeat(QUESTION_TAIL_BYTES + 1) + '\n' + line({ type: 'function_call_output', call_id: 'another', output: 'ok' }));
      expect((await monitor.read(request)).question.id).toBe('q1');
      await fs.appendFile(file, '{"type":');
      expect((await monitor.read(request)).question.id).toBe('q1');
      await fs.appendFile(file, '"ignored"}\n' + line({ type: 'function_call_output', call_id: 'q1', output: '{}' }));
      expect((await monitor.read(request)).question).toBeNull();
      expect(await monitor.read({ ...request, root: path.join(root, 'other') })).toBeNull();
      expect(await monitor.read({ ...request, sessionId: 'wrong' })).toBeNull();
      expect(await monitor.read({ ...request, startedAt: Date.now() + 1000 })).toBeNull();
      monitor.prune([]); expect(monitor.cache.size).toBe(0);
      await fs.writeFile(file, line({ ...call, name: 'functions.request_user_input_async' }));
      expect((await monitor.read(request)).question).toMatchObject({ async: true, id: call.call_id });
    } finally { await fs.rm(root, { recursive: true }); }
  });
});

const pendingAsync = (id = 'q1', sessionId = 'session-one') => ({ sessionId,
  question: { async: true, id, toolName: 'functions.request_user_input_async',
    question: '{"questions":[{"title":"Continue?","options":["Yes","No"]}]}', answeredIndices: [] } });
describe('async question notifications', () => {
  it('alerts once per call, retaining dedupe across partial answers and queued forms', async () => {
    const sent = [];
    const notifier = new AsyncQuestionNotifier(async payload => { sent.push(payload); });
    const result = pendingAsync();
    expect(await notifier.publish('a', result)).toBe(true);
    expect(await notifier.publish('a', { ...result, question: { ...result.question, answeredIndices: [0] } })).toBe(false);
    expect(await notifier.publish('a', pendingAsync('q2'))).toBe(true);
    expect(await notifier.publish('a', result)).toBe(false);
    expect(await notifier.publish('a', pendingAsync('q1', 'session-two'))).toBe(true);
    expect(sent.map(p => [p.session_id, p.question_id])).toEqual([
      ['session-one', 'q1'], ['session-one', 'q2'], ['session-two', 'q1'],
    ]);
    expect(sent[0]).toMatchObject({ id: 'a', event: 'waiting', tool_name: result.question.toolName,
      interactive_question: result.question.question });
    expect(result.question.answeredIndices).toEqual([]);
  });

  it('rejects missing and synchronous questions and prunes stopped sessions', async () => {
    const sent = [];
    const notifier = new AsyncQuestionNotifier(async payload => { sent.push(payload); });
    expect(await notifier.publish('a', null)).toBe(false);
    expect(await notifier.publish('a', { ...pendingAsync(), question: { ...pendingAsync().question, async: false } })).toBe(false);
    expect(await notifier.publish('a', { ...pendingAsync(), sessionId: '' })).toBe(false);
    expect(await notifier.publish('a', pendingAsync())).toBe(true);
    expect(await notifier.publish('b', pendingAsync())).toBe(true);
    notifier.prune(['b']);
    expect(notifier.seen.has('a')).toBe(false);
    expect(await notifier.publish('b', pendingAsync())).toBe(false);
    expect(await notifier.publish('a', pendingAsync())).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it('guards concurrent delivery and retries a failed notification', async () => {
    let fail;
    const notifier = new AsyncQuestionNotifier(() => new Promise((_, reject) => { fail = reject; }));
    const first = notifier.publish('a', pendingAsync());
    const rejected = expect(first).rejects.toThrow('transport unavailable');
    expect(await notifier.publish('a', pendingAsync())).toBe(false);
    fail(new Error('transport unavailable'));
    await rejected;
    let delivered = 0;
    notifier.notify = async () => { delivered++; };
    expect(await notifier.publish('a', pendingAsync())).toBe(true);
    expect(delivered).toBe(1);
  });
});
