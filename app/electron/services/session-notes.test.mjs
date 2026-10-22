import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionNotes, MAX_SESSION_NOTE_BYTES } from './session-notes.mjs';

const roots = [], stores = [];
const make = directory => { const store=new SessionNotes(directory); stores.push(store); return store; };
const root = () => { const directory=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-session-notes-')); roots.push(directory); return directory; };
afterEach(() => {
  for(const store of stores.splice(0)) store.close();
  for(const directory of roots.splice(0)) {
    if(path.dirname(directory)!==path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('acedia-session-notes-')) throw Error('Unexpected cleanup target');
    fs.rmSync(directory,{recursive:true});
  }
});
describe('human session notes', () => {
  it('persists exact Unicode text by Acedia ID, keeping blank notes and other sessions independent', () => {
    const directory=root(), store=make(directory), text='다음 작업 ✨\n\n공백과 경로 C:\\work\\shader 보존\n';
    expect(store.read('a')).toEqual({id:'a',text:'',revision:0,updatedAt:null});
    const saved=store.save({id:'a',text,revision:0}); expect(saved.saved).toBe(true);
    expect(saved.note.revision).toBe(1); expect(saved.note.updatedAt).toBeGreaterThan(0);
    expect(store.read('b').text).toBe(''); store.close();
    expect(make(directory).read('a')).toEqual(saved.note);
    expect(make(directory).save({id:'a',text:'',revision:1}).note.revision).toBe(2);
    expect(store.read('a').text).toBe('');
  });
  it('uses a transaction to reject stale writers even from separate database connections', () => {
    const directory=root(), first=make(directory), second=make(directory);
    first.save({id:'a',text:'first',revision:0});
    const rejected=second.save({id:'a',text:'second',revision:0});
    expect(rejected.saved).toBe(false); expect(rejected.note.text).toBe('first');
    expect(second.save({id:'a',text:'reviewed second',revision:1}).saved).toBe(true);
    expect(first.read('a').text).toBe('reviewed second');
  });
  it('acknowledges a retried completed write without increasing the revision', () => {
    const store=make(root()), body={id:'a',text:'finished',revision:0};
    const result=store.save(body); expect(store.save(body)).toEqual(result);
  });
  it('checks UTF-8 size, malformed IDs and revisions before changing stored data', () => {
    const store=make(root()); store.save({id:'a',text:'keep',revision:0});
    expect(() => store.save({id:'a',text:'가'.repeat(Math.ceil(MAX_SESSION_NOTE_BYTES/3)),revision:1})).toThrow('64 KB');
    for(const id of ['../a','a/b','a\u0000b','',null]) expect(() => store.read(id)).toThrow('session id');
    for(const revision of [-1,NaN,0.5,'1']) expect(() => store.save({id:'a',text:'discard',revision})).toThrow('revision');
    expect(store.read('a').text).toBe('keep');
  });
});
