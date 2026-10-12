import { t } from './i18n.js';
import { make } from './dom.js';
import { chatFileKind, cleanChatFilePath } from './chat-markup.js';
const key = value => String(value).replace(/\\/g, '/').toLowerCase();
export function filesForTurn(files, blocks) {
  const sequences = new Set(blocks.map(block => block.sequence));
  const unique = new Map();
  for (const file of files || []) {
    if (!sequences.has(file.sourceSequence)) continue;
    const previous = unique.get(key(file.path));
    if (previous?.usage === 'output' && file.usage !== 'output') continue;
    if (previous?.change && file.change) {
      const counted = previous.change.additions != null && file.change.additions != null;
      unique.set(key(file.path), { ...file, change: { ...file.change,
        additions: counted ? previous.change.additions + file.change.additions : undefined,
        deletions: counted ? previous.change.deletions + file.change.deletions : undefined,
        diff: [...previous.change.diff, { type: 'meta', text: '@@' }, ...file.change.diff].slice(0, 240) } });
    } else unique.set(key(file.path), previous?.change ? { ...file, change: previous.change } : file);
  }
  return [...unique.values()].sort((a, b) => Number(b.usage === 'output') - Number(a.usage === 'output'));
}
export function fileButton(file, agent) {
  const button = make('button', 'chat-file-link chat-file-card'); button.type = 'button';
  Object.assign(button.dataset, { chatFileAgent: agent?.id || '', chatFileProject: agent?.projectId || '', chatFilePath: file.path, chatFileKind: chatFileKind(file.path) || 'text' });
  const name = String(file.path).replace(/\\/g, '/').split('/').at(-1);
  button.title = file.path; button.append(make('strong', '', name));
  const change = file.change;
  if (change) {
    button.append(make('span', 'chat-file-diff-count', `+${change.additions ?? '?'} −${change.deletions ?? '?'}`));
    const details = make('details', 'chat-file-change'); const summary = make('summary', '', t('변경 보기'));
    details.append(summary);
    const pre = make('pre', ''); pre.textContent = (change.diff || []).map(line => `${line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}${line.text || ''}`).join('\n');
    details.append(pre);
    // Diff controls live beside, rather than inside, the file-open button.
    const wrapper = make('div', 'chat-file-entry'); wrapper.append(button, details); return wrapper;
  }
  if (chatFileKind(file.path) === 'image') {
    const image = document.createElement('img'); image.loading = 'lazy'; image.alt = name;
    image.src = `/api/files/image?${new URLSearchParams({ projectId: agent?.projectId || '', agentId: agent?.id || '', path: cleanChatFilePath(file.path) })}`;
    image.dataset.imageKey = `${agent?.id}:${file.path}`; image.addEventListener('error', () => { image.hidden = true; }, { once: true }); button.prepend(image);
  }
  return button;
}
export function renderFiles(files, agent) {
  if (!files.length) return null;
  const box = make('section', 'chat-related-files');
  box.append(make('small', '', `${t(files.some(file => file.change) ? '수정된 파일' : '관련 파일')} · ${files.length}`));
  files.slice(0, 3).forEach(file => box.append(fileButton(file, agent)));
  if (files.length > 3) {
    const more = make('button', 'small-button', t('모든 파일 보기')); more.type = 'button';
    more.addEventListener('click', () => {
      const dialog = document.getElementById('chatFilesDialog'), list = document.getElementById('chatFilesList'), input = document.getElementById('chatFilesSearch');
      const render = () => { list.replaceChildren(...files.filter(file => key(file.path).includes(key(input.value))).map(file => fileButton(file, agent))); };
      input.value = ''; input.oninput = render; render(); dialog.showModal(); input.focus();
    }); box.append(more);
  }
  return box;
}
const imageLoads = new Map();
const imageSizes = new Map();
function trimImages() {
  let size = [...imageSizes.values()].reduce((total, bytes) => total + bytes, 0);
  for (const cacheKey of imageLoads.keys()) {
    if (size <= 48 * 1024 * 1024 && imageLoads.size <= 80) break;
    size -= imageSizes.get(cacheKey) || 0;
    imageSizes.delete(cacheKey); imageLoads.delete(cacheKey);
  }
}
export function renderStoredImages(block, agent) {
  const box = make('div', 'chat-inline-images');
  if (!Number.isSafeInteger(block.sequence) || !agent?.id) return box;
  const cacheKey = `${agent.id}:${block.sequence}`; box.dataset.imageKey = cacheKey;
  // Cache resolved and in-flight reads. A turn repaint never starts another
  // bitmap request, and image-only user turns use their original sequence.
  let pending = imageLoads.get(cacheKey);
  if (!pending) {
    pending = fetch(`/api/chat/images?${new URLSearchParams({ id: agent.id, sequence: block.sequence })}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.ok ? response.json() : { images: [] }).then(data => {
        const images = Array.isArray(data.images) ? data.images : [];
        if (imageLoads.has(cacheKey)) { imageSizes.set(cacheKey, images.reduce((sum, source) => sum + String(source.dataUrl || source.url || source.path || '').length * 2, 0)); trimImages(); }
        return images;
      }).catch(() => []);
    imageLoads.set(cacheKey, pending);
    trimImages();
  }
  void pending.then(images => {
    images.forEach((source, index) => {
      const src = source.dataUrl || source.url;
      if (src && /^(?:data:image\/[^;]+;base64,|https?:\/\/)/i.test(src)) {
        const button = make('button', 'chat-image-button'); button.type = 'button';
        const image = document.createElement('img'); image.loading = 'lazy'; image.src = src; image.alt = `${t('이미지')} ${index + 1}`;
        button.append(image); button.addEventListener('click', () => document.dispatchEvent(new CustomEvent('chat:image', { detail: { src, name: image.alt } })));
        box.append(button);
      } else if (source.path) box.append(fileButton({ path: source.path, kind: 'image' }, agent));
    });
  });
  return box;
}
