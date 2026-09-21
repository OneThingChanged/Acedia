import { requestJson } from './requests.js';
import { t } from './i18n.js';
export function createHostingView(root) {
  let entries = [], busy = false, selectedId = null, previewUrl = '', sequence = 0;
  const heading = document.createElement('h2'); heading.textContent = 'Hosting';
  const help = document.createElement('p'); help.textContent = t('개발 PC에서 실행 중인 로컬 웹페이지를 여기에서 엽니다. 원본 서버와 Acedia가 켜져 있어야 합니다.');
  const form = document.createElement('form'); form.className = 'hosting-form';
  function field(label, type, placeholder) {
    const wrapper = document.createElement('label'); wrapper.textContent = t(label);
    const input = document.createElement('input'); input.type = type; input.placeholder = placeholder; input.required = true; wrapper.append(input); form.append(wrapper); return input;
  }
  const name = field('이름', 'text', 'DNF Exporter'); name.maxLength = 100;
  const url = field('로컬 URL', 'url', 'http://127.0.0.1:4410/docs/ux-dnf-exporter/dnf-exporter-draft.html');
  const add = document.createElement('button'); add.type = 'submit'; add.textContent = t('추가'); form.append(add);
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = t('목록 새로고침'); form.append(refresh);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'hosting-status';
  const list = document.createElement('div'); list.className = 'hosting-list';
  const tools = document.createElement('div'); tools.className = 'hosting-toolbar'; tools.hidden = true;
  const title = document.createElement('strong');
  const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = t('페이지 다시 열기');
  const external = document.createElement('a'); external.textContent = t('새 창으로 열기'); external.target = '_blank'; external.rel = 'noopener noreferrer';
  tools.append(title, reload, external);
  const frame = document.createElement('iframe'); frame.title = 'Hosted page'; frame.className = 'hosting-frame'; frame.hidden = true; frame.setAttribute('sandbox', 'allow-scripts'); frame.referrerPolicy = 'no-referrer';
  const note = document.createElement('p'); note.className = 'hosting-note'; note.textContent = t('HTML·이미지·CSS·JS 미리보기를 지원합니다. 로그인·폼 전송·API·WebSocket 앱은 지원하지 않습니다. 링크는 30분 후 다시 열어주세요.');
  root.append(heading, help, form, status, list, tools, frame, note);
  const staticText = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) staticText.push([walker.currentNode, walker.currentNode.nodeValue]);
  const translate = () => { for (const [node, source] of staticText) if (node.isConnected) node.nodeValue = t(source); };
  async function api(body) {
    const {response, data} = await requestJson('/api/hosting', body ? { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) } : {});
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  async function run(task) {
    if (busy) return; busy = true; root.setAttribute('aria-busy', 'true'); status.textContent = t('처리 중…'); render();
    try { await task(); status.textContent = ''; } catch(error) { status.textContent = error.message; }
    finally { busy = false; root.setAttribute('aria-busy', 'false'); render(); }
  }
  function render() {
    for (const node of form.querySelectorAll('input,button')) node.disabled = busy;
    reload.disabled = busy; list.replaceChildren();
    if (!entries.length) { const empty = document.createElement('p'); empty.textContent = t('등록한 페이지가 없습니다. 이름과 로컬 URL을 추가하세요.'); list.append(empty); }
    for (const entry of entries) {
      const row = document.createElement('div'); row.className = 'hosting-entry';
      const open = document.createElement('button'); open.textContent = entry.name; open.disabled = busy; open.setAttribute('aria-pressed', String(selectedId === entry.id));
      const address = document.createElement('span'); address.textContent = entry.url;
      const remove = document.createElement('button'); remove.textContent = t('제거'); remove.disabled = busy; remove.setAttribute('aria-label', entry.name + ' ' + t('제거'));
      open.onclick = () => void run(() => show(entry));
      remove.onclick = () => void run(async () => { entries = (await api({action:'remove',id:entry.id})).entries; if (selectedId === entry.id) clearPreview(); });
      row.append(open,address,remove); list.append(row);
    }
  }
  function clearPreview() { ++sequence; selectedId = null; previewUrl = ''; frame.removeAttribute('src'); frame.hidden = true; tools.hidden = true; external.removeAttribute('href'); }
  async function show(entry) {
    const generation = ++sequence;
    const result = await api({action:'open',id:entry.id});
    // Probe the page before embedding so offline servers produce readable errors.
    const response = await fetch(result.url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(t('페이지에 연결할 수 없습니다. 개발 PC의 서버와 URL을 확인하세요.'));
    if (generation !== sequence) return;
    selectedId = entry.id; previewUrl = result.url; title.textContent = entry.name; external.href = previewUrl; tools.hidden = false;
    frame.src = previewUrl; frame.hidden = false;
  }
  const load = () => run(async () => { entries = (await api()).entries; if (selectedId && !entries.some(e => e.id === selectedId)) clearPreview(); });
  form.onsubmit = event => { event.preventDefault(); void run(async () => { entries = (await api({action:'add',name:name.value,url:url.value})).entries; name.value = ''; url.value = ''; }); };
  refresh.onclick = () => void load();
  reload.onclick = () => { const entry = entries.find(e => e.id === selectedId); if (entry) void run(() => show(entry)); };
  render(); return { load, translate };
}
