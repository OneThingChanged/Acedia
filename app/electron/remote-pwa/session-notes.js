import { SessionNoteClient } from './session-notes-client.js';
import { make, copyText } from './dom.js';
import { requestJson } from './requests.js';
import { t } from './i18n.js';

export function createSessionNotes({ getAgent, selectedId }) {
  let storage = null;
  try { storage = localStorage; } catch {}
  const client = new SessionNoteClient({ storage,
    read: async (id, revision) => {
      const {response,data} = await requestJson(`/api/session/notes?id=${encodeURIComponent(id)}${revision == null ? '' : `&revision=${revision}`}`, { cache:'no-store', credentials:'same-origin' });
      if (!response.ok) throw Error(data.error || t('메모를 불러오지 못했습니다.'));
      return data;
    },
    save: async args => {
      const {response,data} = await requestJson('/api/session/notes', {method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(args)});
      if (!response.ok && !(response.status === 409 && data.saved === false && data.note)) throw Error(data.error || t('메모를 저장하지 못했습니다.'));
      return data;
    },
  });
  const view = document.getElementById('sessionView'), trigger = document.getElementById('sessionNoteButton');
  const content = view.querySelector('.session-content');
  const workspace = make('div','session-note-workspace');
  content.replaceWith(workspace); workspace.append(content);
  const panel = make('aside','remote-session-note'); panel.hidden = true;
  const head = make('header','remote-note-head'), heading = make('h3','',t('세션 메모'));
  const actions = make('div'), copy = make('button','icon-button','⧉'), closeButton = make('button','icon-button','×');
  copy.type = closeButton.type = 'button'; copy.setAttribute('aria-label',t('메모 복사')); closeButton.setAttribute('aria-label',t('메모 닫기'));
  actions.append(copy,closeButton); head.append(heading,actions);
  const ownerName = make('strong','remote-note-owner');
  const editor = make('textarea','remote-note-editor'); editor.spellcheck = false;
  editor.placeholder = t('다음에 이어서 할 일이나 기억할 내용을 적어 보세요.');
  const conflict = make('div','remote-note-conflict'); conflict.hidden = true;
  conflict.setAttribute('role','alert');
  const conflictMessage = make('p','',t('다른 곳에서 수정했습니다. 내 입력은 보관했습니다.'));
  const details = make('details'), summary = make('summary','',t('저장된 내용 보기')), latest = make('pre'); details.append(summary,latest);
  const choices = make('div'), useLatest = make('button','small-button',t('저장된 내용 사용')), useLocal = make('button','small-button',t('내 메모로 저장'));
  useLatest.type = useLocal.type = 'button'; choices.append(useLatest,useLocal); conflict.append(conflictMessage,details,choices);
  const footer = make('footer'), status = make('span','remote-note-status'), retry = make('button','small-button',t('다시 시도'));
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); retry.type = 'button'; retry.hidden = true;
  const backupMessage = make('p','remote-note-backup-error',t('이 기기에 임시 보관하지 못했습니다. 저장 상태를 확인해 주세요.')); backupMessage.hidden = true;
  footer.append(status,retry,backupMessage,make('p','',t('AI 대화에 자동으로 전달되지 않아요.')));
  panel.append(head,ownerName,editor,conflict,footer); workspace.append(panel);
  const overlay = make('div','remote-note-overlay'); overlay.hidden = true;
  const backdrop = make('button','remote-note-backdrop'); backdrop.type = 'button'; backdrop.setAttribute('aria-label',t('메모 닫기'));
  overlay.append(backdrop); document.body.append(overlay);
  let owner = null, selected = null, unsubscribe = null, selectedUnsubscribe = null, poll = null, copyTimer = null;
  function render() {
    if (!owner) return;
    const agent = getAgent(owner); if (!agent) { close(); return; }
    const state = client.snapshot(owner);
    ownerName.textContent = agent.name || owner;
    panel.setAttribute('aria-label',`${agent.name || owner} · ${t('세션 메모')}`);
    editor.setAttribute('aria-label',`${agent.name || owner} · ${t('개인 메모')}`);
    if (editor.value !== state.text) editor.value = state.text;
    editor.disabled = !state.note && state.status === 'loading'; copy.disabled = !state.text;
    conflict.hidden = !state.conflict; latest.textContent = state.conflict?.text || t('(빈 메모)');
    const labels = { loading:t('불러오는 중…'),dirty:t('저장 대기'),saving:t('저장 중…'),conflict:t('다른 곳에서 수정됨'),error:t('저장 상태를 확인하지 못했습니다.'),'too-large':t('메모는 64 KB까지 저장할 수 있습니다.') };
    status.textContent = labels[state.status] || (state.note?.updatedAt ? `${t('저장됨')} · ${new Date(state.note.updatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : t('입력하면 자동 저장됩니다.'));
    status.dataset.state = state.status; retry.hidden = state.status !== 'error'; backupMessage.hidden = !state.backupFailed;
    trigger.setAttribute('aria-expanded',String(!panel.hidden));
  }
  function refresh() { if (owner && !document.hidden) void client.load(owner); }
  function close() {
    if (owner) { client.setComposing(owner,false); void client.flush(owner); }
    unsubscribe?.(); unsubscribe = null; clearInterval(poll); poll = null; owner = null;
    panel.hidden = true; overlay.hidden = true; workspace.append(panel); trigger.setAttribute('aria-expanded','false');
  }
  function open(id) {
    if (!getAgent(id)) return;
    close(); owner = id; selected = selectedId();
    if (selected) { overlay.hidden = true; workspace.append(panel); }
    else { overlay.append(panel); overlay.hidden = false; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); }
    unsubscribe = client.subscribe(id,render); panel.hidden = false; render();
    void client.load(id).then(() => { if(owner === id) editor.focus({preventScroll:true}); });
    poll = setInterval(refresh,10000);
  }
  function update() {
    const id = selectedId();
    if (id !== selected) {
      const wasOpen = !!owner; selected = id;
      if (wasOpen) { if(id) open(id); else close(); }
      selectedUnsubscribe?.(); selectedUnsubscribe = null;
      if (id) { selectedUnsubscribe = client.subscribe(id,renderTrigger); void client.load(id); }
    }
    renderTrigger(); if (owner) render();
  }
  function renderTrigger() {
    trigger.setAttribute('aria-expanded',String(!!owner));
    trigger.classList.toggle('has-note',!!selectedId() && !!client.snapshot(selectedId()).text.trim());
    trigger.classList.toggle('on',!!owner);
  }
  trigger.addEventListener('click',() => { if(owner) close(); else open(selectedId()); });
  closeButton.addEventListener('click',() => { close(); trigger.focus({preventScroll:true}); }); backdrop.addEventListener('click',close);
  editor.addEventListener('input',() => { if(owner) client.edit(owner,editor.value); });
  editor.addEventListener('compositionstart',() => { if(owner) client.setComposing(owner,true); });
  editor.addEventListener('compositionend',() => { if(owner) client.setComposing(owner,false); });
  editor.addEventListener('blur',() => { if(owner) { client.setComposing(owner,false); void client.flush(owner); } });
  panel.addEventListener('keydown',event => {
    event.stopPropagation();
    if(event.key === 'Escape' && !event.isComposing) { event.preventDefault(); close(); trigger.focus({preventScroll:true}); }
    if((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if(owner) void client.flush(owner); }
  });
  retry.addEventListener('click',() => { if(owner) void client.retry(owner); });
  useLatest.addEventListener('click',() => { if(owner) void client.resolve(owner,'latest'); });
  useLocal.addEventListener('click',() => { if(owner) void client.resolve(owner,'local'); });
  copy.addEventListener('click',async () => {
    if(!owner) return;
    try { await copyText(editor.value); status.textContent = t('메모를 복사했습니다.'); }
    catch { editor.focus(); editor.select(); status.textContent = t('선택한 내용을 복사해 주세요.'); }
    clearTimeout(copyTimer); copyTimer=setTimeout(render,1800);
  });
  addEventListener('focus',refresh); addEventListener('online',refresh); document.addEventListener('visibilitychange',refresh);
  addEventListener('pagehide',() => { void client.flushAll(); });
  return {open,close,update};
}
