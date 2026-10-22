import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionNoteClient, NOTE_DRAFT_PREFIX } from './session-notes-client.mjs';

const note=(id,text='',revision=0)=>({id,text,revision,updatedAt:revision?1:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
function fixture(extra={}) {
  const notes=new Map(), writes=[];
  const client=new SessionNoteClient({storage:storage(),debounce:1000,
    read:async id=>notes.get(id)||note(id),
    save:async body=>{writes.push(body);const current=notes.get(body.id)||note(body.id);if(current.revision!==body.revision)return {saved:false,note:current};const next=note(body.id,body.text,current.revision+1);notes.set(body.id,next);return {saved:true,note:next};},...extra});
  return {client,notes,writes};
}
afterEach(()=>vi.useRealTimers());
describe('session note drafts and asynchronous saves',()=>{
  it('keeps edits typed during an in-flight save and writes them with the acknowledged revision',async()=>{
    const first=deferred(),writes=[];
    const {client}=fixture({save:async body=>{writes.push(body);return writes.length===1?first.promise:{saved:true,note:note(body.id,body.text,2)};}});
    await client.load('a'); client.edit('a','first'); const saving=client.flush('a');
    client.edit('a','latest'); first.resolve({saved:true,note:note('a','first',1)}); await saving;
    expect(writes.map(value=>[value.text,value.revision])).toEqual([['first',0],['latest',1]]);
    expect(client.snapshot('a')).toMatchObject({text:'latest',status:'saved',note:{revision:2}});
  });
  it('does not lose a deliberate revert while an earlier edit is in flight',async()=>{
    const first=deferred(),backup=storage(),writes=[];
    const {client}=fixture({storage:backup,read:async id=>note(id,'original',1),save:async body=>{writes.push(body);return writes.length===1?first.promise:{saved:true,note:note(body.id,body.text,3)};}});
    await client.load('a');client.edit('a','change');const saving=client.flush('a');client.edit('a','original');
    expect(JSON.parse(backup.getItem(NOTE_DRAFT_PREFIX+'a')).text).toBe('original');
    first.resolve({saved:true,note:note('a','change',2)});await saving;
    expect(writes.map(value=>value.text)).toEqual(['change','original']);
    expect(client.snapshot('a').text).toBe('original');
  });
  it('retains an edited session while another is loaded and refuses stale host data',async()=>{
    const {client,notes}=fixture();await client.load('a');await client.load('b');client.edit('a','mine');notes.set('a',note('a','other window',1));
    await client.load('a');expect(client.snapshot('a')).toMatchObject({text:'mine',status:'conflict',conflict:{text:'other window'}});
    expect(client.snapshot('b').text).toBe('');await client.flush('a');expect(notes.get('a').text).toBe('other window');
    await client.resolve('a','local');expect(notes.get('a').text).toBe('mine');expect(notes.get('a').revision).toBe(2);
  });
  it('offers the saved note without overwriting a conflict until the user chooses it',async()=>{
    const {client,notes}=fixture();await client.load('a');client.edit('a','mine');notes.set('a',note('a','saved',1));await client.flush('a');
    expect(client.snapshot('a').text).toBe('mine');await client.resolve('a','latest');expect(client.snapshot('a')).toMatchObject({text:'saved',status:'saved',conflict:null});
  });
  it('recovers a failed-save draft after reload and reconciles an uncertain successful write',async()=>{
    const backup=storage(),failed=fixture({storage:backup,save:async()=>{throw Error('offline')}}).client;
    await failed.load('a');failed.edit('a','keep across reload');await failed.flush('a');expect(failed.snapshot('a').status).toBe('error');
    const {client,writes}=fixture({storage:backup});expect(client.snapshot('a').text).toBe('keep across reload');await client.load('a');await client.flush('a');
    expect(writes).toHaveLength(1);expect(backup.getItem(NOTE_DRAFT_PREFIX+'a')).toBeNull();
    backup.setItem(NOTE_DRAFT_PREFIX+'b',JSON.stringify({text:'already saved',baseText:'',revision:0}));
    const recovered=fixture({storage:backup,read:async id=>note(id,'already saved',1)});await recovered.client.load('b');
    expect(recovered.client.snapshot('b').status).toBe('saved');expect(recovered.writes).toHaveLength(0);
  });
  it('does not auto-overwrite a newer host note when recovering an older browser draft',async()=>{
    const backup=storage();backup.setItem(NOTE_DRAFT_PREFIX+'a',JSON.stringify({text:'old draft',baseText:'old host',revision:1}));
    const {client,writes}=fixture({storage:backup,read:async id=>note(id,'newer host',4)});await client.load('a');await client.flush('a');
    expect(client.snapshot('a')).toMatchObject({status:'conflict',text:'old draft',conflict:{revision:4}});expect(writes).toHaveLength(0);
  });
  it('debounces changes and waits for IME completion before saving',async()=>{
    vi.useFakeTimers();const {client,writes}=fixture();await client.load('a');client.setComposing('a',true);client.edit('a','한');
    await vi.advanceTimersByTimeAsync(1500);expect(writes).toHaveLength(0);client.edit('a','한국어');client.setComposing('a',false);
    await vi.advanceTimersByTimeAsync(1100);expect(writes.map(item=>item.text)).toEqual(['한국어']);
  });
  it('preserves oversized drafts without sending them and resumes after they are shortened',async()=>{
    const {client,writes}=fixture();await client.load('a');client.edit('a','가'.repeat(22000));await client.flush('a');await client.load('a');await client.flush('a');
    expect(writes).toHaveLength(0);expect(client.snapshot('a').status).toBe('too-large');client.edit('a','short');await client.flush('a');expect(writes).toHaveLength(1);
  });
  it('applies an older pending refresh after a save without rolling back its revision',async()=>{
    const reading=deferred(),saving=deferred();let reads=0;
    const {client}=fixture({read:async id=>++reads===1?note(id,'base',1):reading.promise,save:async()=>saving.promise});
    await client.load('a');const refresh=client.load('a');client.edit('a','new');const flush=client.flush('a');
    reading.resolve(note('a','base',1));saving.resolve({saved:true,note:note('a','new',2)});await Promise.all([refresh,flush]);
    expect(client.snapshot('a')).toMatchObject({text:'new',status:'saved',note:{revision:2}});
  });
  it('continues autosave after a failed write reconnects to an unchanged revision',async()=>{
    vi.useFakeTimers();let failed=true;
    const {client,writes}=fixture({read:async(id,revision)=>revision===0?{unchanged:true}:note(id),save:async body=>{if(failed)throw Error('offline');writes.push(body);return {saved:true,note:note(body.id,body.text,1)}}});
    await client.load('a');client.edit('a','recover');await client.flush('a');expect(client.snapshot('a').status).toBe('error');
    failed=false;await client.load('a');await vi.advanceTimersByTimeAsync(1100);expect(client.snapshot('a').status).toBe('saved');expect(writes).toHaveLength(1);
  });
});
