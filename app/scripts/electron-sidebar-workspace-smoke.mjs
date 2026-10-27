import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.resolve(appRoot, "../output/sidebar-workspace-app");
const familyOnly = process.argv.includes('--inactive-family-only') || process.env.ACEDIA_SIDEBAR_FAMILY_ONLY === '1';
const fileRootsOnly = process.argv.includes('--session-folders-only') || process.env.ACEDIA_SIDEBAR_FILE_ROOTS_ONLY === '1';

async function exerciseFileRoots() {
  const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => { for (let i = 0; i < 80; i++) { if (predicate()) return; await wait(); } throw Error('File root condition timed out: ' + document.querySelector('.file-tree-panel')?.textContent?.slice(0, 600)); };
  const check = (value, message) => { if (!value) throw Error(message); };
  const root = () => document.querySelector('.file-tree-working-folder')?.getAttribute('title');
  const select = async id => {
    document.querySelector(`.sidebar-recents [data-sidebar-agent-id="${id}"]`).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait();
  };
  window.sidebarFixtureFileRoots = { 'G:/AI': ['parent-only.md', 'README.md'], 'D:/AI2/PCGLab': ['pcg-only.md', 'README.md'], 'E:/Motion': ['motion-only.md', 'README.md'] };
  window.dispatchEvent(new Event('focus'));
  await until(() => root() === 'D:/AI2/PCGLab' && document.querySelector('.file-tree-panel')?.textContent.includes('pcg-only.md'));
  check(document.querySelector('.file-tree-project-name').textContent === 'PCGLab', 'Tree title is still the parent project');
  check(document.querySelector('.sidebar-recents [data-sidebar-agent-id="pcg"] .sidebar-session-meta [title]').title === 'D:/AI2/PCGLab', 'Sidebar still reports the stale root');
  const row = () => [...document.querySelectorAll('.file-tree-row')].find(e => e.textContent.includes('README.md'));
  row().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await until(() => window.layoutCalls.some(c => c.command === 'read_markdown_file' && c.args.folder === 'D:/AI2/PCGLab' && c.args.relativePath === 'README.md'));
  check(root() === 'D:/AI2/PCGLab', 'Opening a child document reset the tree to the project root');
  await until(() => Object.keys(localStorage).filter(k => k.includes('groups')).some(k => localStorage.getItem(k)?.includes('doc2:')));
  await select('motion');
  await until(() => root() === 'E:/Motion' && document.querySelector('.file-tree-panel').textContent.includes('motion-only.md'));
  check(!document.querySelector('.file-tree-panel').textContent.includes('pcg-only.md'), 'Sibling root reused a stale directory cache');
  document.querySelector('.file-tree-pin').click(); await wait();
  await select('manager');
  check(root() === 'E:/Motion', 'Pin did not retain the child session root');
  check(JSON.parse(localStorage.getItem('multiagent.fileTreePin.v1')).sessionId === 'motion', 'Pinned session identity was not saved');
  return 'SESSION_FILE_ROOT_CUSTOM_DRIVE_DOCUMENT_OWNER_SIBLING_CACHE_AND_PIN_OK';
}

async function exerciseFileRootRestore() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => { for (let i = 0; i < 80; i++) { if (predicate()) return; await wait(80); } throw Error('Restored file root condition timed out'); };
  const root = () => document.querySelector('.file-tree-working-folder')?.getAttribute('title');
  window.sidebarFixtureFileRoots = { 'G:/AI': ['parent-only.md'], 'D:/AI2/PCGLab': ['pcg-only.md'], 'E:/Motion': ['motion-only.md'] };
  await until(() => root() === 'E:/Motion');
  document.querySelector('.file-tree-pin').click();
  await until(() => root() === 'G:/AI');
  window.sidebarFixtureFileDelays = { 'D:/AI2/PCGLab': 350 };
  const select = id => document.querySelector(`.sidebar-recents [data-sidebar-agent-id="${id}"]`).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  select('pcg'); await wait(70); select('motion');
  await until(() => root() === 'E:/Motion' && document.querySelector('.file-tree-panel').textContent.includes('motion-only.md'));
  await wait(500);
  if (document.querySelector('.file-tree-panel').textContent.includes('pcg-only.md')) throw Error('An old root request overwrote the new tree');
  window.sidebarFixtureFileDelays = {};
  select('pcg'); await until(() => root() === 'D:/AI2/PCGLab');
  const scm = [...document.querySelectorAll('.file-tree-tab')].find(b => /Source Control|소스 제어/.test(b.textContent + b.title));
  if (!scm) throw Error('Source Control tab missing'); scm.click();
  await until(() => window.layoutCalls.some(c => c.command === 'git_changes' && c.args.folder === 'D:/AI2/PCGLab'));
  return 'SESSION_FILE_ROOT_PIN_RESTORE_UNPIN_LATE_IO_AND_SCM_CWD_OK';
}

async function exerciseScreenIdentity() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 180));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  for (let attempt = 0; attempt < 40 && !document.querySelector('.sidebar-workspace'); attempt++) await wait();
  await wait();
  const screens = [...document.querySelectorAll('.sidebar-screen-item')];
  check(screens.length === 2, 'Two-screen identity fixture');
  const colors = screens.map(screen => getComputedStyle(screen).getPropertyValue('--screen-color').trim());
  check(new Set(colors).size === 2, 'Split screens share a color');
  for (const [index, screen] of screens.entries()) {
    const members = [...document.querySelectorAll('.sidebar-recents [data-sidebar-screen-id="'+screen.dataset.sidebarScreenId+'"]')];
    check(members.length === 2, 'Split membership missing from recent conversations');
    for (const row of members) {
      check(getComputedStyle(row).getPropertyValue('--screen-color').trim() === colors[index], 'Conversation color does not match its screen');
      check(row.querySelector('.agent-screen-badge')?.textContent === 'S'+(index+1), 'Conversation screen number mismatch');
      check(getComputedStyle(row.querySelector('.agent-screen-badge')).color === getComputedStyle(screen.querySelector('.sidebar-screen-number')).color, 'Badge color does not match screen number');
      check(getComputedStyle(row).boxShadow !== 'none', 'Conversation color rail missing');
    }
  }
  for (const [id, provider] of [['ux', 'codex'], ['image', 'claude']]) {
    const logo = document.querySelector('.sidebar-recents [data-sidebar-agent-id="'+id+'"] .provider-logo');
    check(logo?.dataset.provider === provider && logo.getAttribute('role') === 'img' && logo.getAttribute('aria-label') && logo.querySelector('path')?.getAttribute('d').length > 100, 'Provider logo missing or inaccessible');
    check(!document.querySelector('.sidebar-recents [data-sidebar-agent-id="'+id+'"] .sidebar-session-meta').textContent.includes(provider === 'codex' ? 'Codex' : 'Claude'), 'Provider text still fills conversation metadata');
  }
  const project = document.querySelector('[data-sidebar-project-id="acedia"] .project-item');
  if (project.getAttribute('aria-expanded') !== 'true') { project.click(); await wait(); }
  const nested = [...document.querySelectorAll('[data-sidebar-project-id="acedia"] .project-session-list [data-sidebar-agent-id]')];
  check(nested.length === 3 && nested.every(row => row.querySelector('.provider-logo') && row.getBoundingClientRect().height <= 34), 'Folded project provider logos or compact rows');
  check(nested.filter(row => row.dataset.sidebarScreenId).every(row => getComputedStyle(row).getPropertyValue('--screen-color').trim() === colors[0]), 'Project session color mismatch');
  document.querySelector('.sidebar-primary-nav > button').click(); await wait();
  return 'SIDEBAR_SCREEN_IDENTITY_OK S1='+colors[0]+' S2='+colors[1];
}

async function exerciseCompletionAttention() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms ?? 180));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const calls = command => window.layoutCalls.filter(call => call.command === command).length;
  const row = id => document.querySelector('.sidebar-recents [data-sidebar-agent-id="'+id+'"]');
  const unread = id => row(id)?.classList.contains('agent-completion-unread');
  let time = Date.now();
  const hook = (id, event) => window.sidebarFixtureEmit('agent:hook-event', { id, event, session_id: 'session-'+id, received_at: ++time });
  window.sidebarFixtureOwned = ['ux', 'image', 'routing', 'files', 'shader'];
  localStorage.setItem('multiagent.notificationSound.v1', JSON.stringify({ mode: 'off', osNotification: true }));
  await wait(1250);
  const nativeBefore = calls('show_native_notification'), attentionBefore = calls('fixture_taskbar_attention');
  hook('image', 'working'); hook('image', 'done'); hook('image', 'done'); await wait();
  check(calls('show_native_notification') === nativeBefore + 1 && calls('fixture_taskbar_attention') === attentionBefore + 1, 'Burst hooks missed or duplicated completion notification');
  check(unread('image') && row('image').getAttribute('aria-label').includes('읽지 않은 작업 완료') && !row('image').querySelector('.agent-completion-badge'), 'Unread completion highlight missing or Done badge remains');
  check(getComputedStyle(row('image'), '::after').borderTopWidth === '1px', 'Completion outline missing');
  check(getComputedStyle(row('image'), '::after').animationIterationCount === '3', 'Completion animation must stop after three pulses');
  check(getComputedStyle(row('image')).backgroundColor !== getComputedStyle(row('routing')).backgroundColor, 'Completed conversation has no background emphasis');
  check(row('image').style.getPropertyValue('--screen-color') && row('image').querySelector('.agent-screen-badge'), 'Completion overwrote screen identity');
  window.sidebarFixtureEmit('agent:idle-suspended', { id: 'image', sessionId: 'session-image' }); await wait();
  check(unread('image'), 'Idle suspension erased unread completion');
  check(document.querySelector('[data-sidebar-project-id="acedia"] [data-sidebar-agent-id="image"]').classList.contains('agent-completion-unread'), 'Nested project lost completion highlight');
  row('image').scrollIntoView({ block: 'center' });
  // Leave this marker intact for dark/light screenshot capture by the host.
  window.sidebarFixtureFocused = true;
  const focusedNative = calls('show_native_notification'), focusedAttention = calls('fixture_taskbar_attention');
  hook('routing', 'working'); hook('routing', 'done'); await wait();
  check(calls('show_native_notification') === focusedNative + 1 && calls('fixture_taskbar_attention') === focusedAttention, 'Focused alerts ignored the saved policy or flashed the active window');
  hook('routing', 'working'); await wait(); check(!unread('routing'), 'New work retained old completion highlight');
  window.sidebarFixtureFocused = false;
  localStorage.setItem('multiagent.notificationSound.v1', JSON.stringify({ mode: 'off', osNotification: false }));
  const offNative = calls('show_native_notification'), offAttention = calls('fixture_taskbar_attention');
  hook('routing', 'done'); await wait();
  check(calls('show_native_notification') === offNative && calls('fixture_taskbar_attention') === offAttention + 1, 'Disabling Windows toast also disabled taskbar attention');
  window.sidebarFixturePolicyAllowed = false;
  const mutedNative = calls('show_native_notification'), mutedAttention = calls('fixture_taskbar_attention');
  hook('routing', 'working'); hook('routing', 'done'); await wait();
  check(unread('routing') && calls('show_native_notification') === mutedNative && calls('fixture_taskbar_attention') === mutedAttention, 'Muted completion lost its marker or notified anyway');
  window.sidebarFixtureOwned = []; await wait(1250);
  window.sidebarFixturePolicyAllowed = true;
  hook('routing', 'working'); hook('routing', 'done'); await wait();
  check(calls('show_native_notification') === mutedNative && calls('fixture_taskbar_attention') === mutedAttention, 'Non-owning workspace delivered a duplicate notification');
  window.sidebarFixtureEmit('pty:exit', { id: 'routing' }); await wait();
  check(unread('routing'), 'PTY exit erased unread completion');
  const completedRow = row('routing');
  completedRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait();
  check(!unread('routing') && unread('image'), 'Acknowledging one completion also cleared another');
  localStorage.setItem('multiagent.notificationSound.v1', JSON.stringify({ mode: 'off', osNotification: true }));
  window.sidebarFixtureNativeFailure = true;
  document.querySelector('.app-topbar button[title="설정"]').click(); await wait();
  const testButton = document.querySelector('button[data-setting-id="general.alertTest"]');
  check(testButton, 'Notification test control missing');
  testButton.click(); await wait();
  check(document.querySelector('.app-settings-screen').textContent.includes('알림 테스트에 실패했습니다.') && document.querySelector('.app-settings-screen').textContent.includes('Fixture native delivery failed'), 'Native notification test swallowed the OS failure');
  window.sidebarFixtureNativeFailure = false; testButton.click(); await wait();
  check(document.querySelector('.app-settings-screen').textContent.includes('Windows 알림을 전송했습니다.'), 'Notification test did not confirm successful delivery');
  document.querySelector('.app-settings-back').click(); await wait();
  row('image').scrollIntoView({ block: 'center' });
  return 'SIDEBAR_COMPLETION_ALERTS_OK persistent/read/new-work highlights without Done, burst dedupe, focused policy, independent taskbar, mute/ownership, native test failure';
}

async function exercise() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 180));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const find = selector => { const element = document.querySelector(selector); check(element, "Missing " + selector); return element; };
  const click = async selector => { find(selector).click(); await wait(); };
  const menu = async label => { const button = [...document.querySelectorAll('.ctx-menu button')].find(element => element.textContent.trim() === label); check(button, "Missing menu " + label); button.click(); await wait(); };
  const stored = id => JSON.parse(localStorage.getItem('multiagent.agents.v1')).find(agent => agent.id === id);
  for (let attempt = 0; attempt < 40 && !document.querySelector('.sidebar-workspace'); attempt++) await wait();
  await wait();
  const rows = () => document.querySelectorAll('.sidebar-recents [data-sidebar-agent-id]').length;
  const projectSelector = id => `[data-sidebar-project-id="${id}"]`;
  const projectButton = id => `${projectSelector(id)} .project-item`;
  const projectRows = id => [...document.querySelectorAll(`${projectSelector(id)} .project-session-list [data-sidebar-agent-id]`)];
  const expanded = id => find(projectButton(id)).getAttribute('aria-expanded') === 'true';
  const savedExpanded = id => JSON.parse(localStorage.getItem('multiagent.sidebarExpandedProjects.v1') || '[]').includes(id);
  check(find('.sidebar-brand-icon').naturalWidth > 0, 'Acedia icon did not load');
  check(!document.querySelector('.topbar-logo, .app-topbar [aria-label="Toggle left sidebar"]'), 'Duplicate titlebar branding or sidebar toggle');
  check(rows() === 5 && !document.querySelector('[data-sidebar-agent-id="archived"]'), 'Archive projection');
  check(!document.querySelector('.project-session-list'), 'Projects should start folded');
  const row = find('[data-sidebar-agent-id="ux"]');
  check(getComputedStyle(row).flexDirection === 'row' && row.getBoundingClientRect().height < 65, 'Conversation row layout');
  check(!document.querySelector('.sidebar-routing, .sidebar-account'), 'Removed account footer still visible');
  const panes = [...document.querySelectorAll('.terminal-area [data-pane-leaf-id]')];
  const beforeRuntime = window.layoutCalls.filter(call => ['spawn_pty', 'kill_pty'].includes(call.command)).length;
  await click('[data-sidebar-agent-id="image"] .sidebar-row-menu'); await menu('대화 고정');
  check(stored('image').sidebarPinned && !stored('image').pinned, 'Sidebar pin changed tab pin');
  await click('[data-sidebar-agent-id="image"] .sidebar-row-menu'); await menu('대화 보관');
  check(rows() === 4 && stored('image').sidebarArchived, 'Archive not saved');
  await click('.sidebar-archive-link');
  const restore = [...document.querySelectorAll('.sidebar-archive-list > div')].find(row => row.textContent.includes('리모트 이미지'));
  check(restore, 'Archived conversation unavailable'); restore.querySelector('button').click(); await wait();
  check(rows() === 5 && !stored('image').sidebarArchived, 'Restore not saved');
  find('.sidebar-archive-dialog header button').click(); await wait();
  await click(projectButton('toon')); check(rows() === 1, 'Project scope');
  check(expanded('toon') && projectRows('toon').map(row => row.dataset.sidebarAgentId).join() === 'shader', 'Project did not reveal its sessions');
  await click(projectButton('toon'));
  check(!expanded('toon') && projectRows('toon').length === 0 && rows() === 1, 'Folding changed scope or reopened selected project');
  check(JSON.parse(localStorage.getItem('multiagent.sidebarExpandedProjects.v1')).length === 0, 'Fold state not saved');
  await click(projectButton('toon'));
  await click(`${projectSelector('toon')} .sidebar-row-menu`);
  check(expanded('toon') && document.querySelector('.ctx-menu'), 'Project menu toggled fold state');
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await wait();
  await click(`${projectSelector('toon')} .sidebar-project-new-session`);
  check(document.querySelector('.new-session-modal, .modal') && expanded('toon'), 'Project new conversation action');
  const projectCancel = [...document.querySelectorAll('.modal button')].find(button => ['취소', 'Cancel'].includes(button.textContent.trim()));
  check(projectCancel, 'Project new conversation cancel'); projectCancel.click(); await wait();
  await click(projectButton('acedia'));
  check(expanded('toon') && expanded('acedia') && projectRows('acedia').length === 3 && rows() === 3, 'Independent project folds');
  const nested = projectRows('acedia')[0];
  check(nested.dataset.sidebarAgentId === 'ux' && nested.getAttribute('aria-current') === 'page', 'Nested conversation order or active state');
  check(nested.getBoundingClientRect().height <= 34 && !nested.querySelector('.sidebar-session-meta'), 'Nested rows are not compact');
  await click(projectButton('acedia')); check(!expanded('acedia') && expanded('toon'), 'Closing one project folded another');
  await click('.sidebar-primary-nav > button'); check(rows() === 5, 'All conversations');
  const setInput = (selector, value) => { const input = find(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true})); };
  const key = async (element, key, extra = {}) => { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra })); await wait(); };
  const searchInput = find('.sidebar-workspace-search input');
  const search = async value => { searchInput.focus(); setInput('.sidebar-workspace-search input', value); await wait(); };
  const results = kind => [...document.querySelectorAll(`[data-sidebar-search-result="${kind}"]`)];
  check(!document.querySelector('.sidebar-search-button'), 'Duplicate sidebar search button');
  const keptTree = find('.sidebar-project-navigation');
  await click('[data-session-filter="active"]'); check(rows() === 0, 'Active filter fixture');
  await search('ACEDIA');
  check(results('project').length === 1 && results('session').length === 3, 'Combined search obeyed browse filter or leaked archived sessions');
  check(find('.sidebar-workspace-browse').hidden && keptTree.isConnected, 'Search remounted the project tree');
  check(find('.sidebar-search-summary').textContent.includes('4개 결과') && document.querySelector('.sidebar-search-results mark'), 'Search count or match highlighting');
  const clearRect = find('.sidebar-inline-search-clear').getBoundingClientRect();
  const fieldRect = find('.sidebar-workspace-search').getBoundingClientRect();
  check(clearRect.left >= fieldRect.left && clearRect.right <= fieldRect.right && clearRect.top >= fieldRect.top && clearRect.bottom <= fieldRect.bottom, 'Search clear button escaped its input field');
  check(getComputedStyle(searchInput).outlineWidth === '0px' && getComputedStyle(searchInput).borderLeftWidth === '0px', 'Double input focus border');
  await key(searchInput, 'Enter', { isComposing: true });
  check(searchInput.value === 'ACEDIA' && !savedExpanded('acedia'), 'IME Enter selected a search result');
  await key(searchInput, 'Enter', { keyCode: 229 }); check(searchInput.value === 'ACEDIA', 'IME compatibility key selected a result');
  await key(searchInput, 'ArrowDown'); check(document.activeElement === results('project')[0], 'Keyboard did not focus project results');
  await key(document.activeElement, 'ArrowDown'); check(document.activeElement === results('session')[0], 'Keyboard did not reach session results');
  await key(document.activeElement, 'Escape');
  check(!searchInput.value && !document.querySelector('.sidebar-search-results') && rows() === 0 && !savedExpanded('acedia'), 'Escape did not restore browse state');
  check(find('.sidebar-project-navigation') === keptTree, 'Search replaced the project navigation');
  await search('acedia'); await key(searchInput, 'Enter');
  check(!searchInput.value && expanded('acedia') && projectRows('acedia').length === 3 && rows() === 3, 'Search project did not reveal all its sessions');
  check(find('[data-session-filter="all"]').getAttribute('aria-pressed') === 'true' && document.activeElement === find(projectButton('acedia')), 'Project selection did not reset filter or focus its row');
  await click(projectButton('acedia'));
  await click('.sidebar-workspace-browse > .sidebar-section .sidebar-section-toggle');
  check(!document.querySelector(projectButton('toon')), 'Project section did not close');
  await search('toon'); await key(searchInput, 'Enter');
  check(expanded('toon') && projectRows('toon').length === 1, 'Searching a project with an unmounted tree did not reveal it');
  await click(projectButton('toon'));
  await click('.sidebar-workspace-browse > .sidebar-section .sidebar-section-toggle');
  await click('.sidebar-workspace-browse > .sidebar-section .sidebar-section-toggle');
  check(!expanded('toon'), 'Completed search replayed on a later tree remount');
  await click(projectButton('toon'));
  await click('.sidebar-primary-nav > button');
  await click('[data-session-filter="active"]');
  await search('claude'); check(results('project').length === 0 && results('session').length === 2, 'Provider search was scoped to the selected project');
  window.sidebarFixtureInUse = ['image']; await new Promise(resolve => setTimeout(resolve, 1200));
  check(find('[data-sidebar-search-result="session"][data-search-id="image"]').getAttribute('aria-disabled') === 'true', 'Foreign search result stayed enabled');
  await key(searchInput, 'ArrowDown'); check(document.activeElement.dataset.searchId === 'shader', 'Keyboard selected a foreign conversation');
  await key(document.activeElement, 'Escape');
  window.sidebarFixtureInUse = []; await new Promise(resolve => setTimeout(resolve, 1200));
  await search(' "C:\\FIXTURE\\TOON\\" '); check(results('project').length === 1 && results('session')[0]?.dataset.searchId === 'shader', 'Quoted Windows project path search');
  await search('C:\\FIXTURE\\SHADER-SESSION'); check(results('project').length === 0 && results('session')[0]?.dataset.searchId === 'shader', 'Session working folder search');
  await search('不存在-no-result'); check(!results('project').length && !results('session').length && find('.sidebar-search-results').textContent.includes('일치하는'), 'Empty search feedback');
  await key(searchInput, 'ArrowDown'); check(document.activeElement === searchInput, 'Empty search moved focus into hidden browse rows');
  await key(searchInput, 'Escape');
  await click('[data-session-filter="all"]');
  await search('이미지');
  await key(searchInput, 'k', { ctrlKey: true }); check(document.querySelector('.quick-open'), 'Configured global search shortcut did not open Quick Search from inline input');
  const quickInput = find('.quick-open input');
  check(find('.quick-open').getAttribute('aria-label') === 'Quick Search', 'Global search display name');
  setInput('.quick-open input', ' "C:\\FIXTURE\\TOON\\" '); await wait();
  check(document.querySelectorAll('.quick-open-kind-project').length === 1 && document.querySelectorAll('.quick-open-kind-session').length === 1 && find('.quick-open-results').textContent.includes('셰이더'), 'Quick Search lost projects or sessions with a different working folder when pasting a Windows path');
  setInput('.quick-open input', 'C:\\FIXTURE\\SHADER-SESSION'); await wait();
  check(!document.querySelector('.quick-open-kind-project') && document.querySelectorAll('.quick-open-kind-session').length === 1 && find('.quick-open-results').textContent.includes('셰이더'), 'Quick Search lost the session working folder');
  setInput('.quick-open input', 'no-result'); await wait(); await key(quickInput, 'ArrowDown');
  setInput('.quick-open input', '이미지'); await wait();
  check(find('.quick-open-results').textContent.includes('리모트 이미지') && document.querySelector('.quick-open-result[aria-selected="true"]'), 'Quick Search lost selection after empty results');
  await key(quickInput, 'Enter', { isComposing: true }); check(document.querySelector('.quick-open'), 'Global search selected during IME composition');
  await key(quickInput, 'ArrowDown');
  check(document.activeElement === quickInput && searchInput.value === '이미지', 'Global navigation changed inline search focus/query');
  await key(quickInput, 'Escape'); check(document.activeElement === searchInput && searchInput.value === '이미지', 'Global close did not restore inline search focus');
  await click('.sidebar-inline-search-clear');
  check(window.layoutCalls.filter(call => ['spawn_pty', 'kill_pty'].includes(call.command)).length === beforeRuntime, 'Searching activated or stopped a conversation');
  console.log('SIDEBAR_COMBINED_SEARCH_OK');
  await click('.topbar-quick-search'); check(document.querySelector('.quick-open'), 'Titlebar search did not open Quick Search');
  setInput('.quick-open input', '이미지'); await wait(); check(find('.quick-open-results').textContent.includes('리모트 이미지'), 'Quick Open session search');
  find('.quick-open input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
  check(!document.querySelector('.quick-open') && rows() === 5, 'Quick Open changed sidebar scope');
  await click('.sidebar-notifications'); check(document.querySelector('.attention-center'), 'Notifications not connected');
  await click('.attention-header .app-icon-btn');
  await click('[data-session-filter="sleeping"]'); check(rows() === 3, 'Sleeping filter');
  await click('[data-session-filter="active"]'); check(rows() === 0, 'Cold sessions became active');
  await click('[data-session-filter="all"]');
  await click('.screen-groups .sidebar-section-toggle');
  await click('.sidebar-screen-item .sidebar-row-menu'); await menu('분할 화면 이름 변경');
  setInput('.modal input', 'UX 비교 작업'); await wait();
  find('.modal .btn-primary').click(); await wait();
  check(find('.screen-group-name').textContent === 'UX 비교 작업', 'Split rename');
  check(JSON.parse(localStorage.getItem('multiagent.workspace.primary.groups.v1')).some(group => group.name === 'UX 비교 작업'), 'Split name not persisted');
  await click('.sidebar-screen-item .sidebar-row-menu'); await menu('스크린 해제');
  check(!document.querySelector('.screen-groups') && rows() === 5, 'Unsplit removed conversation');
  check(window.layoutCalls.filter(call => ['spawn_pty', 'kill_pty'].includes(call.command)).length === beforeRuntime, 'Navigation changed PTY lifecycle');
  check(panes.every(element => element.isConnected) || !document.querySelector('.screen-groups'), 'Pane replacement');
  await click('.sidebar-collapse');
  check(Math.round(find('.sidebar').getBoundingClientRect().width) === 66, 'Collapsed rail');
  check(getComputedStyle(find('.sidebar-workspace-search')).display === 'none', 'Collapsed rail still shows the inline search');
  await click('.topbar-quick-search'); check(document.querySelector('.quick-open'), 'Collapsed rail global search not connected');
  find('.quick-open input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
  await click('.sidebar-collapse');
  const width = find('.sidebar').getBoundingClientRect().width;
  const resize = find('.sidebar-resize-handle'); resize.focus(); resize.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait();
  check(find('.sidebar').getBoundingClientRect().width === width + 8 && Number(localStorage.getItem('multiagent.sidebarWidth.v1')) === width + 8, 'Resize persistence');
  await click('.sidebar-new-chat'); check(document.querySelector('.new-session-modal, .modal'), 'New conversation not connected');
  const cancel = [...document.querySelectorAll('.modal button')].find(button => ['취소', 'Cancel'].includes(button.textContent.trim())); check(cancel, 'New conversation cancel'); cancel.click(); await wait();
  await click('.app-topbar button[title="설정"]'); check(document.querySelector('.app-settings-screen'), 'Settings not connected');
  const theme = [...document.querySelectorAll('.app-settings-screen .app-theme-option')].find(button => button.textContent.trim() === 'Light');
  check(theme, 'Theme button'); theme.click(); await wait();
  check(find('.app').classList.contains('app-theme-light'), 'Theme application');
  find('.app-settings-back').click(); await wait();
  check(window.layoutCalls.filter(call => ['spawn_pty', 'kill_pty'].includes(call.command)).length === beforeRuntime, 'Settings changed runtime');
  await click(projectButton('acedia'));
  await click('.sidebar-primary-nav > button');
  check(expanded('acedia') && expanded('toon'), 'All conversations changed fold state');
  find(`${projectSelector('toon')} [data-sidebar-agent-id="shader"]`).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); await wait();
  check(find(`${projectSelector('toon')} [data-sidebar-agent-id="shader"]`).getAttribute('aria-current') === 'page', 'Nested keyboard selection did not open conversation');
  const pointerRow = find(`${projectSelector('acedia')} [data-sidebar-agent-id="ux"]`);
  pointerRow.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 7, button: 0, bubbles: true, clientX: 45, clientY: 45}));
  pointerRow.dispatchEvent(new PointerEvent('pointerup', {pointerId: 7, button: 0, bubbles: true, clientX: 45, clientY: 45})); await wait();
  check(find(`${projectSelector('acedia')} [data-sidebar-agent-id="ux"]`).getAttribute('aria-current') === 'page', 'Nested pointer selection did not open conversation');
  check(expanded('acedia') && expanded('toon'), 'Selecting a session changed project folds');
  check(['ux', 'shader'].every(id => stored(id).status !== 'exited'), 'Fixture failed to attach selected session');
  check(window.layoutCalls.filter(call => call.command === 'spawn_pty').every(call => ['ux', 'shader'].includes(call.args.id)), 'Selecting a session activated another conversation');
  check(!window.layoutCalls.some(call => call.command === 'kill_pty'), 'Session selection stopped another process');
  await search('셰이더'); await key(searchInput, 'Enter');
  check(!searchInput.value && find(`${projectSelector('toon')} [data-sidebar-agent-id="shader"]`).getAttribute('aria-current') === 'page', 'Inline search Enter did not open the conversation');
  await search('사이드바');
  const searchRow = find('[data-sidebar-search-result="session"][data-search-id="ux"]');
  searchRow.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 8, button: 0, bubbles: true, clientX: 45, clientY: 45}));
  searchRow.dispatchEvent(new PointerEvent('pointerup', {pointerId: 8, button: 0, bubbles: true, clientX: 45, clientY: 45})); await wait();
  check(!searchInput.value && find(`${projectSelector('acedia')} [data-sidebar-agent-id="ux"]`).getAttribute('aria-current') === 'page', 'Inline search pointer did not open the conversation');
  check(!window.layoutCalls.some(call => call.command === 'kill_pty'), 'Inline selection stopped another process');
  const visible = selector => [...document.querySelectorAll(selector)].find(element => element.getBoundingClientRect().width > 0);
  const start = [...document.querySelectorAll('.terminal-area .session-standby button')].find(button => button.getBoundingClientRect().width > 0);
  if (start) { start.click(); await wait(); }
  visible('.terminal-area .pane-chat-toggle[aria-label="대화(채팅) 뷰로 전환"]').click(); await wait();
  const composer = find('.chat-composer-input');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(composer, '검색 중에도 보존할 작성 중인 메시지');
  composer.dispatchEvent(new Event('input', {bubbles: true})); await wait();
  await search('acedia'); await key(searchInput, 'Escape');
  check(composer.isConnected && composer.value === '검색 중에도 보존할 작성 중인 메시지', 'Inline search reset or replaced the conversation draft');
  visible('.terminal-area .pane-chat-toggle[aria-label="터미널 뷰로 전환"]').click(); await wait();
  return 'SIDEBAR_REAL_APP_INTERACTIONS_OK';
}

async function exerciseSessionActions() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 220));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const find = selector => { const element = document.querySelector(selector); check(element, 'Missing: ' + selector); return element; };
  const recent = id => `.sidebar-recents [data-sidebar-agent-id="${id}"]`;
  const stored = id => JSON.parse(localStorage.getItem('multiagent.agents.v1')).find(agent => agent.id === id);
  const start = async id => {
    find(recent(id)).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); await wait();
    const standby = [...document.querySelectorAll('.terminal-area .session-standby button')].find(button => button.getBoundingClientRect().width > 0);
    if (standby) { standby.click(); await wait(); }
    check(window.layoutCalls.some(call => call.command === 'spawn_pty' && call.args.id === id), 'Session did not attach: ' + id);
    // The fixture's simulated PTY does not emit the real CLI's SessionStart hook.
    window.sidebarFixtureEmit('agent:hook-event', {id, event: 'session-start', session_id: 'session-' + id, received_at: Date.now()}); await wait();
    check(find(recent(id)).querySelector('.sidebar-session-close'), 'Running session has no stop button: ' + id);
  };
  const close = async selector => {
    const before = window.layoutCalls.length;
    const button = find(selector + ' .sidebar-session-close');
    button.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 15, button: 0, bubbles: true}));
    button.dispatchEvent(new PointerEvent('pointerup', {pointerId: 15, button: 0, bubbles: true}));
    button.click(); await wait();
    const calls = window.layoutCalls.slice(before);
    const stops = calls.filter(call => ['terminal_session_action', 'kill_pty'].includes(call.command));
    check(stops.length === 1 && stops[0].command === 'terminal_session_action' && stops[0].args.id === 'ux' && stops[0].args.action === 'sleep', 'Close stopped the wrong session or stopped it more than once');
    check(!calls.some(call => call.command === 'spawn_pty' && call.args.id === 'ux'), 'Close immediately restarted the session');
    check(stored('ux')?.resumeEligible === false && !stored('ux').sidebarArchived, 'Close removed or archived the conversation instead of stopping it');
    check(!document.querySelector('[data-sidebar-agent-id="ux"] .sidebar-session-close'), 'Stopped session still offers stop');
  };
  find('.sidebar-primary-nav > button').click(); await wait();
  await start('ux'); await start('shader');
  check(!find(recent('routing')).querySelector('.sidebar-session-close'), 'Inactive session offers stop');
  const project = find('[data-sidebar-project-id="acedia"] .project-item');
  if (project.getAttribute('aria-expanded') !== 'true') { project.click(); await wait(); }
  find('.sidebar-primary-nav > button').click(); await wait();
  const nested = '[data-sidebar-project-id="acedia"] [data-sidebar-agent-id="ux"]';
  for (const selector of [recent('ux'), nested]) {
    find(selector).dispatchEvent(new MouseEvent('dblclick', {bubbles: true})); await wait();
    check(!document.querySelector('.modal'), 'Double-click opened rename');
  }
  find(recent('ux')).dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, clientX: 160, clientY: 180})); await wait();
  const rename = [...document.querySelectorAll('.ctx-menu button')].find(button => /rename|이름 변경|별명 변경/i.test(button.textContent));
  check(rename, 'Context menu lost Rename'); rename.click(); await wait();
  check(find('.modal input').value === stored('ux').name, 'Rename opened the wrong session');
  find('.modal input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await wait();
  await close(nested);
  check(find(recent('shader')).getAttribute('aria-current') === 'page' && find(recent('shader')).querySelector('.sidebar-session-close'), 'Closing a background session changed the foreground session');
  await start('ux'); await close(recent('ux'));
  await start('ux');
  const input = find('.sidebar-workspace-search input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, stored('ux').name);
  input.dispatchEvent(new Event('input', {bubbles: true})); await wait();
  const result = '[data-sidebar-search-result="session"][data-search-id="ux"]';
  find(result).dispatchEvent(new MouseEvent('dblclick', {bubbles: true})); await wait();
  check(!document.querySelector('.modal'), 'Search double-click opened rename');
  await close(result);
  check(input.value === stored('ux').name && document.querySelector(result), 'Closing from search lost the query or conversation');
  input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await wait();
  return 'SIDEBAR_SESSION_ACTIONS_OK stop from project/recent/search, history retained, no focus stealing, context-menu-only rename';
}

async function exerciseSearchReveal() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 220));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const projectButton = id => document.querySelector(`[data-sidebar-project-id="${id}"] .project-item`);
  const folder = name => [...document.querySelectorAll('.project-folder-name')].find(element => element.textContent === name)?.closest('.project-folder-node');
  const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new StorageEvent('storage', {key})); };
  const input = document.querySelector('.sidebar-workspace-search input');
  const search = async value => { input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true})); await wait(); };
  const enter = async () => { input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); await wait(); };
  const projects = JSON.parse(localStorage.getItem('multiagent.projects.v1'));
  write('multiagent.projectFolders.v1', [
    {id: 'search-local', name: '개발 검색 검증', machineKey: 'local', createdAt: 1},
    {id: 'search-remote', name: '원격 검색 검증', machineKey: 'ssh:fixture', createdAt: 1},
  ]);
  write('multiagent.projects.v1', [...projects.map(project => project.id === 'acedia' ? {...project, projectFolderId: 'search-local'} : project),
    {id: 'remote-search', name: 'Remote Search Fixture', folder: '', sshHostId: 'fixture', remoteFolder: '/work/remote', projectFolderId: 'search-remote', createdAt: 1}]);
  await wait();
  check(folder('개발 검색 검증') && folder('원격 검색 검증'), 'Shared fixture folders did not update');
  folder('개발 검색 검증').querySelector('.project-folder-item').click(); await wait();
  check(!projectButton('acedia'), 'Local parent folder did not collapse');
  document.querySelectorAll('.machine-caret-btn')[0].click(); await wait();
  await search('acedia'); await enter();
  check(projectButton('acedia')?.getAttribute('aria-expanded') === 'true' && document.querySelectorAll('[data-sidebar-project-id="acedia"] .project-session-list [data-sidebar-agent-id]').length === 3, 'Search did not reveal collapsed local machine/folder/project');
  check(!JSON.parse(localStorage.getItem('multiagent.collapsedMachines.v1')).includes('local') && !JSON.parse(localStorage.getItem('multiagent.collapsedProjectFolders.v1')).includes('search-local'), 'Local reveal did not persist');
  projectButton('acedia').click(); await wait();
  folder('원격 검색 검증').querySelector('.project-folder-item').click(); await wait();
  document.querySelectorAll('.machine-caret-btn')[1].click(); await wait();
  await search('/WORK/remote');
  check(document.querySelectorAll('[data-sidebar-search-result="project"]').length === 1 && !document.querySelector('[data-sidebar-search-result="session"]'), 'Empty remote project was not searchable by its path');
  await enter();
  check(projectButton('remote-search')?.getAttribute('aria-expanded') === 'true' && document.querySelector('[data-sidebar-project-id="remote-search"] .sidebar-project-empty-action'), 'Search did not reveal collapsed SSH machine/folder/empty project');
  check(projectButton('acedia')?.getAttribute('aria-expanded') === 'false', 'Remote search reopened an unrelated folded project');
  check(!JSON.parse(localStorage.getItem('multiagent.collapsedMachines.v1')).includes('ssh:fixture') && !JSON.parse(localStorage.getItem('multiagent.collapsedProjectFolders.v1')).includes('search-remote'), 'Remote reveal did not persist');
  folder('미분류').querySelector('.project-folder-item').click(); await wait();
  check(!projectButton('toon'), 'Uncategorized folder did not collapse');
  await search('toon'); await enter();
  check(projectButton('toon')?.getAttribute('aria-expanded') === 'true' && !JSON.parse(localStorage.getItem('multiagent.collapsedProjectFolders.v1')).includes('uncategorized:local'), 'Search did not reveal an uncategorized project');
  await search('실시간 이름 변경');
  check(!document.querySelector('[data-sidebar-search-result]'), 'Live query fixture was already matched');
  write('multiagent.agents.v1', JSON.parse(localStorage.getItem('multiagent.agents.v1')).map(agent => agent.id === 'routing' ? {...agent, name: '실시간 이름 변경'} : agent));
  await wait();
  check(input.value === '실시간 이름 변경' && document.querySelector('[data-sidebar-search-result="session"][data-search-id="routing"]'), 'Live catalog updates reset search or left stale results');
  input.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true})); await wait();
  check(!window.layoutCalls.some(call => call.command === 'kill_pty' || (call.command === 'spawn_pty' && call.args.id !== 'ux' && call.args.id !== 'shader')), 'Project search activated or stopped a session');
  return 'SIDEBAR_SEARCH_FOLDER_AND_LIVE_UPDATE_OK';
}

async function exerciseSessionFamilies(reload = false) {
  const wait = () => new Promise(resolve => setTimeout(resolve, 180));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const row = id => document.querySelector(`.sidebar-recents [data-sidebar-agent-id="${id}"]`);
  for (let i=0;i<40&&!row('rnd-root');i++) await wait();
  const ids=['ShaderLevelUp','ShaderNoiseBall','ShaderSkinner'];
  const toggle=()=>row('rnd-root')?.querySelector('.sidebar-family-toggle');
  if (!reload) {
    check(toggle()?.getAttribute('aria-expanded')==='true','Current-parent tree is not expanded by default');
    for(const id of ids) {
      check(row(id)?.closest('[data-sidebar-parent-id="rnd-root"]'),'Shader not nested below current RnDHub parent');
      check(row(id).querySelector('.sidebar-session-task-meta').textContent.includes('RnDHub'),'Row still labels the original creator as parent');
      check(document.querySelectorAll(`.sidebar-recents [data-sidebar-agent-id="${id}"]`).length===1,'Child duplicated in recents');
    }
    const calls=window.layoutCalls.filter(c=>['spawn_pty','kill_pty','terminal_session_action'].includes(c.command)).length;
    const view=localStorage.getItem('multiagent.view.v1');
    toggle().click(); await wait();
    check(ids.every(id=>!row(id))&&toggle().getAttribute('aria-expanded')==='false','Family collapse did not hide only child rows');
    check(JSON.parse(localStorage.getItem('multiagent.sidebarCollapsedSessionFamilies.v1')).includes('rnd-root'),'Family fold not saved');
    check(localStorage.getItem('multiagent.view.v1')===view,'Folding selected another pane');
    check(window.layoutCalls.filter(c=>['spawn_pty','kill_pty','terminal_session_action'].includes(c.command)).length===calls,'Folding changed CLI lifecycle');
    return 'SIDEBAR_CURRENT_PARENT_TREE_COLLAPSE_NO_RUNTIME_OK';
  }
  check(toggle()?.getAttribute('aria-expanded')==='false'&&ids.every(id=>!row(id)),'Family fold lost on reload');
  toggle().click(); await wait();
  check(ids.every(id=>row(id)?.closest('[data-sidebar-parent-id="rnd-root"]')),'Unfold lost child hierarchy');
  const project=document.querySelector('[data-sidebar-project-id="rnd"] .project-item');
  if(project.getAttribute('aria-expanded')!=='true'){project.click();await wait();}
  check(document.querySelectorAll('[data-sidebar-project-id="rnd"] [data-sidebar-parent-id="rnd-root"] [data-sidebar-agent-id]').length===3,'Project list did not share the hierarchy');
  toggle().click(); await wait();
  const input=document.querySelector('.sidebar-workspace-search input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'ShaderSkinner');
  input.dispatchEvent(new Event('input',{bubbles:true})); await wait();
  const result=document.querySelector('[data-sidebar-search-result="session"][data-search-id="ShaderSkinner"]');
  check(result,'Collapsed child cannot be found by search');
  result.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await wait();
  check(!document.querySelector('.sidebar-search-results')&&row('ShaderSkinner')?.classList.contains('active'),'Selecting search result did not reveal the active child');
  check(toggle().getAttribute('aria-expanded')==='true','Selecting a child did not expand its ancestors');
  check(document.documentElement.scrollWidth===innerWidth,'Session tree caused horizontal overflow');
  return 'SIDEBAR_CURRENT_PARENT_TREE_RELOAD_PROJECT_SEARCH_REVEAL_OK';
}

async function exerciseActiveFamilySleeping(stopParent = false) {
  const wait = () => new Promise(resolve => setTimeout(resolve, 100));
  const until = async predicate => { for(let i=0;i<60;i++){if(predicate())return;await wait();}throw Error('Active family condition timed out'); };
  const check = (value, message) => { if(!value)throw Error(message); };
  const row = id => document.querySelector(`.sidebar-recents [data-sidebar-agent-id="${id}"]`);
  const sleeping = ['ShaderLevelUp','ShaderNoiseBall','SleepingGrandchild'];
  const inactive = ['StoppedChild','NewChild'];
  const context = [...sleeping,...inactive];
  if (!stopParent) {
    await until(()=>context.every(id=>!!row(id)));
    row('rnd-root').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await until(()=>document.querySelector('.pane-active')?.dataset.paneActiveAgentId==='rnd-root'&&!document.querySelector('.pane-active .session-standby'));
    // This fixture attaches a fake terminal; supply its first output so the
    // real App runtime reducer sees the same live state as an actual PTY.
    const data='Fixture CLI ready\r\n';
    for(const id of ['rnd-root','ShaderSkinner']) window.sidebarFixtureEmit('pty:data',{id,data,sequenceStart:0,sequenceEnd:data.length});
    await until(()=>!!row('rnd-root')?.querySelector('.sidebar-session-close'));
    const before = window.layoutCalls.filter(call=>['spawn_pty','kill_pty','terminal_session_action'].includes(call.command)).length;
    const sleepingCount=document.querySelector('[data-session-filter="sleeping"] .sidebar-session-filter-count').textContent;
    document.querySelector('[data-session-filter="active"]').click();
    await until(()=>context.every(id=>!row(id)));
    check(row('ShaderSkinner')?.closest('[data-sidebar-parent-id="rnd-root"]'),'Default hiding removed an active child');
    const toggleInactive = async () => {
      row('rnd-root').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:160,clientY:180}));
      await until(()=>!!document.querySelector('[data-session-action="sidebar-toggle-inactive-children"]'));
      document.querySelector('[data-session-action="sidebar-toggle-inactive-children"]').click();
      await until(()=>!document.querySelector('.ctx-menu'));
    };
    await toggleInactive();
    await until(()=>context.every(id=>!!row(id)));
    await until(()=>JSON.parse(localStorage.getItem('multiagent.agents.v1')).find(a=>a.id==='rnd-root').sidebarShowInactiveChildren===true);
    for(const id of sleeping) {
      check(row(id).closest('[data-sidebar-parent-id="rnd-root"]'),'Sleeping child detached from active parent');
      check(row(id).querySelector('.status-sleeping') && row(id).querySelector('.sidebar-sleep-label')?.textContent,'Sleeping child changed runtime classification');
      check(document.querySelector(`[data-sidebar-project-id="rnd"] [data-sidebar-parent-id="rnd-root"] [data-sidebar-agent-id="${id}"]`),'Project list omitted sleeping context');
    }
    for(const id of inactive) {
      check(row(id).closest('[data-sidebar-parent-id="rnd-root"]'),'Stopped/new child detached from active parent');
      check(!row(id).querySelector('.sidebar-sleep-label')&&!row(id).querySelector('.sidebar-session-close'),'Stopped/new child acquired a sleeping or live classification');
      check(document.querySelector(`[data-sidebar-project-id="rnd"] [data-sidebar-agent-id="${id}"]`),'Project list omitted stopped/new context');
    }
    check(row('SleepingGrandchild').closest('[data-sidebar-parent-id="StoppedChild"]'),'Inactive intermediate child broke the family tree');
    check(document.querySelector('[data-session-filter="active"] .sidebar-session-filter-count').textContent==='2','Sleeping context inflated Active count');
    check(document.querySelector('[data-session-filter="sleeping"] .sidebar-session-filter-count').textContent===sleepingCount,'Sleeping count changed when expanding Active');
    document.querySelector('[data-session-filter="sleeping"]').click();await wait();
    check(sleeping.every(id=>!!row(id))&&!row('ShaderSkinner')&&!row('NewChild'),'Sleeping filter changed its strict status selection');
    document.querySelector('[data-session-filter="active"]').click();await wait();
    check(context.every(id=>!!row(id)),'Inactive context did not return under the active parent');
    await toggleInactive();
    await until(()=>context.every(id=>!row(id)));
    await until(()=>JSON.parse(localStorage.getItem('multiagent.agents.v1')).find(a=>a.id==='rnd-root').sidebarShowInactiveChildren===false);
    check(row('ShaderSkinner')?.closest('[data-sidebar-parent-id="rnd-root"]'),'Hiding inactive children removed an active child');
    document.querySelector('[data-session-filter="all"]').click();await until(()=>context.every(id=>!!row(id)));
    document.querySelector('[data-session-filter="active"]').click();await until(()=>context.every(id=>!row(id)));
    check(window.layoutCalls.filter(call=>['spawn_pty','kill_pty','terminal_session_action'].includes(call.command)).length===before,'Filtering started or stopped a session');
    return 'SIDEBAR_ACTIVE_PARENT_SLEEPING_STOPPED_NEW_DESCENDANTS_COUNTS_AND_NO_RUNTIME_OK\nSIDEBAR_INACTIVE_CHILD_VISIBILITY_DEFAULT_HIDE_CONTEXT_TOGGLE_AND_PERSIST_OK';
  }
  row('rnd-root').querySelector('.sidebar-session-close').click();
  await until(()=>context.every(id=>!row(id)));
  check(row('ShaderSkinner')?.closest('[data-sidebar-parent-id="rnd-root"]'),'Active child lost its inactive parent context');
  return 'SIDEBAR_INACTIVE_CONTEXT_PARENT_DOES_NOT_REVEAL_INACTIVE_SIBLINGS_OK';
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration();
  app.setPath('userData', process.env.ACEDIA_SIDEBAR_SMOKE_PROFILE);
  app.whenReady().then(async () => { let win; try {
    win = new BrowserWindow({ show: false, width: 1440, height: 900, useContentSize: true, titleBarStyle: 'hidden', titleBarOverlay: { color: '#151b22', symbolColor: '#96a0ad', height: 35 }, webPreferences: { offscreen: true, backgroundThrottling: false } });
    const errors = [];
    win.webContents.on('console-message', details => { if (details.level === 'error') { errors.push(details.message); console.error('RENDERER_ERROR', details.message); } });
    await win.loadFile(path.join(directory, 'index.html'), { query: { 'two-screens': '1' } });
    if (fileRootsOnly) {
      await win.webContents.executeJavaScript(`{
        const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
        write('multiagent.projects.v1',[{id:'p',name:'AIHub',folder:'G:/AI',createdAt:1}]);
        const make=(id,name,folder,sessionHierarchy)=>({id,name,folder,projectId:'p',aiToolId:'codex',createdAt:1,resumeEligible:false,sessionHierarchy});
        write('multiagent.agents.v1',[make('manager','AIHub 관리자','G:/AI'),make('pcg','PCGLab','G:/stale',{parentId:'manager',inheritFolder:false,folderOverride:'D:/AI2/PCGLab'}),make('motion','Mixamo','G:/stale',{parentId:'manager',inheritFolder:false,folderOverride:'E:/Motion'})]);
        const groups=[{id:'files',projectId:'p',layout:{type:'leaf',id:'leaf',tabs:['manager','pcg','motion'],activeIndex:1}}],view={activeProjectId:'p',activeGroupId:'files',activePath:[]};
        for(const key of ['multiagent.groups.v1','multiagent.workspace.primary.groups.v1'])write(key,groups);
        for(const key of ['multiagent.view.v1','multiagent.workspace.primary.view.v1'])write(key,view);
        localStorage.setItem('multiagent.filesOpen.v1','true');localStorage.setItem('multiagent.sessionFilter.v1','all');localStorage.removeItem('multiagent.fileTreePin.v1');
      }`);
      await win.loadFile(path.join(directory, 'index.html'));
      console.log(await win.webContents.executeJavaScript(`(${exerciseFileRoots.toString()})()`));
      await new Promise(resolve => setTimeout(resolve, 200));
      await win.loadFile(path.join(directory, 'index.html'));
      console.log(await win.webContents.executeJavaScript(`(${exerciseFileRootRestore.toString()})()`));
      if(errors.length) throw Error(errors.join('\n'));
      app.exit(0);return;
    }
    if (!familyOnly) {
    console.log(await win.webContents.executeJavaScript(`(${exerciseScreenIdentity.toString()})()`));
    await fs.writeFile(path.join(directory, 'sidebar-screen-identity-dark.png'), (await win.webContents.capturePage()).toPNG());
    for (const [surface, selector] of [
      ['recent', '.sidebar-recents [data-sidebar-agent-id="ux"]'],
      ['project', '[data-sidebar-project-id="acedia"] [data-sidebar-agent-id="ux"]'],
    ]) {
      await win.webContents.executeJavaScript(`document.activeElement?.blur();document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 650, y: 150 });
      await new Promise(resolve => setTimeout(resolve, 150));
      const geometry = () => win.webContents.executeJavaScript(`(() => {
        const row=document.querySelector(${JSON.stringify(selector)}), controls=row.querySelector('.sidebar-session-trailing'), r=row.getBoundingClientRect();
        return { display:getComputedStyle(controls).display, controls:controls.getBoundingClientRect().width,
          title:row.querySelector('.agent-name').getBoundingClientRect().width, x:r.left+50,y:r.top+r.height/2 };
      })()`);
      const resting = await geometry();
      if (resting.display !== 'none' || resting.controls !== 0) throw Error('Resting row still reserves controls: ' + surface);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(resting.x), y: Math.round(resting.y) });
      await new Promise(resolve => setTimeout(resolve, 150));
      const hover = await geometry();
      if (hover.display !== 'flex' || hover.controls <= 0 || hover.title >= resting.title - 20) throw Error('Hover did not reveal controls with narrower title: ' + surface);
      await fs.writeFile(path.join(directory, `sidebar-${surface}-hover.png`), (await win.webContents.capturePage()).toPNG());
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 650, y: 150 });
      await new Promise(resolve => setTimeout(resolve, 150));
      const left = await geometry();
      if (left.display !== 'none' || Math.abs(left.title - resting.title) > 1) throw Error('Mouse leave failed to return title width: ' + surface);
      await fs.writeFile(path.join(directory, `sidebar-${surface}-resting.png`), (await win.webContents.capturePage()).toPNG());
      console.log(`SIDEBAR_${surface.toUpperCase()}_HOVER_TITLE_WIDTH_OK resting=${resting.title} hover=${hover.title} returned=${left.title}`);
    }
    await win.webContents.executeJavaScript("document.querySelector('.app').classList.add('app-theme-light')");
    console.log(await win.webContents.executeJavaScript(`(${exerciseScreenIdentity.toString()})()`));
    await fs.writeFile(path.join(directory, 'sidebar-screen-identity-light.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelector('.app').classList.remove('app-theme-light')");
    console.log(await win.webContents.executeJavaScript(`(${exerciseCompletionAttention.toString()})()`));
    await fs.writeFile(path.join(directory, 'sidebar-completion-dark.png'), (await win.webContents.capturePage()).toPNG());
    console.log(await win.webContents.executeJavaScript(`(async () => {
      const wait = () => new Promise(resolve => setTimeout(resolve, 220));
      document.querySelector('.app-topbar button[title="설정"]').click(); await wait();
      const theme = [...document.querySelectorAll('.app-settings-screen .app-theme-option')].find(button => button.textContent.trim() === 'Light');
      if (!theme) throw Error('Light theme control missing');
      theme.click(); await wait();
      document.querySelector('.app-settings-back').click(); await wait();
      if (!document.querySelector('.app').classList.contains('app-theme-light')) throw Error('Completion light theme not applied');
      const row = document.querySelector('.sidebar-recents [data-sidebar-agent-id="image"]');
      row.scrollIntoView({block:'center'}); await wait();
      if (!row.classList.contains('agent-completion-unread') || row.querySelector('.agent-completion-badge') || getComputedStyle(row).getPropertyValue('--completion-color').trim() !== '#167a38') throw Error('Light completion highlight missing or Done badge remains');
      return 'SIDEBAR_COMPLETION_LIGHT_OK actual settings theme, persistent highlight';
    })()`));
    await fs.writeFile(path.join(directory, 'sidebar-completion-light.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("localStorage.clear()");
    await win.loadFile(path.join(directory, 'index.html'));
    await new Promise(resolve => setTimeout(resolve, 900));
    await fs.writeFile(path.join(directory, 'sidebar-app-1440.png'), (await win.webContents.capturePage()).toPNG());
    console.log(await win.webContents.executeJavaScript(`(${exercise.toString()})()`));
    await fs.writeFile(path.join(directory, 'sidebar-app-light-1440.png'), (await win.webContents.capturePage()).toPNG());
    const inlineQuery = async value => {
      await win.webContents.executeJavaScript(`(() => { const input = document.querySelector('.sidebar-workspace-search input'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
      await new Promise(resolve => setTimeout(resolve, 220));
    };
    await inlineQuery('acedia');
    await fs.writeFile(path.join(directory, 'sidebar-search-light-1440.png'), (await win.webContents.capturePage()).toPNG());
    await inlineQuery('');
    await win.webContents.executeJavaScript("localStorage.setItem('multiagent.appTheme.v1','soft')");
    await win.loadFile(path.join(directory, 'index.html'));
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(await win.webContents.executeJavaScript(`(() => {
      const saved = JSON.parse(localStorage.getItem('multiagent.agents.v1'));
      if (!saved.find(agent => agent.id === 'image').sidebarPinned || document.querySelectorAll('.sidebar-recents [data-sidebar-agent-id]').length !== 5) throw Error('Sidebar data lost on reload');
      const folded = JSON.parse(localStorage.getItem('multiagent.sidebarExpandedProjects.v1'));
      if (!['acedia', 'toon'].every(id => folded.includes(id) && document.querySelector('[data-sidebar-project-id="'+id+'"] .project-item').getAttribute('aria-expanded') === 'true')) throw Error('Project fold state lost on reload');
      if (document.querySelector('[data-sidebar-project-id="assets"] .project-item').getAttribute('aria-expanded') !== 'false') throw Error('Collapsed project reopened on reload');
      if (document.querySelector('[data-sidebar-agent-id="archived"]')) throw Error('Archive leaked into nested sessions');
      if (document.querySelector('.screen-groups')) throw Error('Unsplit lost on reload');
      return 'SIDEBAR_RELOAD_OK';
    })()`));
    await inlineQuery('acedia');
    await fs.writeFile(path.join(directory, 'sidebar-search-1440.png'), (await win.webContents.capturePage()).toPNG());
    await inlineQuery('');
    for (const [width, height] of [[1280, 820], [800, 640]]) {
      win.setContentSize(width, height); await new Promise(resolve => setTimeout(resolve, 250));
      await fs.writeFile(path.join(directory, `sidebar-app-${width}.png`), (await win.webContents.capturePage()).toPNG());
      console.log(await win.webContents.executeJavaScript(`(() => {
        if (document.documentElement.scrollWidth !== innerWidth) throw Error('Horizontal overflow at '+innerWidth);
        const footer = document.querySelector('.sidebar-workspace-footer').getBoundingClientRect();
        if (footer.bottom > innerHeight) throw Error('Footer clipped');
        if (document.querySelector('.terminal-area').getBoundingClientRect().width < 180) throw Error('Workspace too narrow');
        const launcher = document.querySelector('.topbar-quick-search').getBoundingClientRect();
        if (Math.abs((launcher.left + launcher.right) / 2 - innerWidth / 2) > 8) throw Error('Quick Search is not centered');
        if ([...document.querySelectorAll('.topbar-actions button')].some(button => button.getBoundingClientRect().left < launcher.right + 6)) throw Error('Quick Search overlaps titlebar buttons');
        const area = document.querySelector('.topbar-inner').getBoundingClientRect();
        if ([...document.querySelectorAll('.topbar-actions button')].some(button => button.getBoundingClientRect().right > area.right)) throw Error('Titlebar buttons overlap native window controls');
        return 'SIDEBAR_LAYOUT_OK '+innerWidth+'x'+innerHeight;
      })()`));
      if (width === 800) {
        const scrollTop = await win.webContents.executeJavaScript(`(() => { const scroll = document.querySelector('.sidebar-workspace-scroll'); scroll.scrollTop = 50; if (scroll.scrollTop !== 50) throw Error('Scroll restoration fixture has no overflow'); return scroll.scrollTop; })()`);
        await inlineQuery('acedia');
        await fs.writeFile(path.join(directory, 'sidebar-search-800.png'), (await win.webContents.capturePage()).toPNG());
        await inlineQuery('');
        console.log(await win.webContents.executeJavaScript(`(() => { if (document.querySelector('.sidebar-workspace-scroll').scrollTop !== ${scrollTop}) throw Error('Search clear lost browse scroll'); return 'SIDEBAR_SEARCH_SCROLL_OK'; })()`));
      }
    }
    win.setContentSize(1280, 820); await new Promise(resolve => setTimeout(resolve, 220));
    console.log(await win.webContents.executeJavaScript(`(${exerciseSearchReveal.toString()})()`));
    console.log(await win.webContents.executeJavaScript(`(${exerciseSessionActions.toString()})()`));
    await fs.writeFile(path.join(directory, 'sidebar-session-actions.png'), (await win.webContents.capturePage()).toPNG());
    }
    await win.webContents.executeJavaScript(`{
      const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value)),now=Date.now();
      write('multiagent.projects.v1',[{id:'creator-project',name:'AIHub',folder:'C:/fixture/AIHub',createdAt:now},{id:'rnd',name:'RnDHub',folder:'C:/fixture/RnDHub',createdAt:now}]);
      const make=(id,projectId,sessionHierarchy)=>({id,name:id==='rnd-root'?'RnDHub':id,projectId,folder:'C:/fixture/'+id,aiToolId:'codex',aiLabel:'Codex',dangerous:false,status:'idle',deferredStart:true,resumeEligible:true,createdAt:now,sessionHierarchy});
      write('multiagent.agents.v1',[make('AIHub','creator-project'),make('rnd-root','rnd'),...['ShaderLevelUp','ShaderNoiseBall','ShaderSkinner'].map(id=>make(id,'rnd',{parentId:'rnd-root',createdById:'AIHub',inheritFolder:false}))]);
      const groups=['rnd-root','ShaderLevelUp','ShaderNoiseBall','ShaderSkinner'].map(id=>({id:'family-'+id,projectId:'rnd',layout:{type:'leaf',id:'leaf-'+id,tabs:[id],activeIndex:0}}));
      const view={activeProjectId:'rnd',activeGroupId:'family-rnd-root',activePath:[]};
      for(const key of ['multiagent.groups.v1','multiagent.workspace.primary.groups.v1'])write(key,groups);
      for(const key of ['multiagent.view.v1','multiagent.workspace.primary.view.v1'])write(key,view);
      write('multiagent.sidebarCollapsedSessionFamilies.v1',[]);localStorage.setItem('multiagent.sessionFilter.v1','all');
    }`);
    await win.loadFile(path.join(directory,'index.html'));
    console.log(await win.webContents.executeJavaScript(`(${exerciseSessionFamilies.toString()})(false)`));
    await win.loadFile(path.join(directory,'index.html'));
    console.log(await win.webContents.executeJavaScript(`(${exerciseSessionFamilies.toString()})(true)`));
    await win.webContents.executeJavaScript(`{
      const key='multiagent.agents.v1',agents=JSON.parse(localStorage.getItem(key)),base=agents.find(agent=>agent.id==='rnd-root');
      agents.push(...[
        {id:'StoppedChild',parentId:'rnd-root',resumeEligible:false},
        {id:'NewChild',parentId:'rnd-root',resumeEligible:false},
        {id:'SleepingGrandchild',parentId:'StoppedChild',resumeEligible:true},
      ].map(({id,parentId,resumeEligible})=>({...base,id,name:id,status:'idle',runtimeStatus:'idle',deferredStart:true,resumeEligible,lastSessionId:undefined,sessionHierarchy:{parentId,inheritFolder:true}})));
      localStorage.setItem(key,JSON.stringify(agents));window.dispatchEvent(new StorageEvent('storage',{key}));
    }`);
    console.log(await win.webContents.executeJavaScript(`(${exerciseActiveFamilySleeping.toString()})()`));
    if (!familyOnly) await fs.writeFile(path.join(directory,'sidebar-active-parent-sleeping-children.png'),(await win.webContents.capturePage()).toPNG());
    console.log(await win.webContents.executeJavaScript(`(${exerciseActiveFamilySleeping.toString()})(true)`));
    if (!familyOnly) await fs.writeFile(path.join(directory,'sidebar-session-family-tree.png'),(await win.webContents.capturePage()).toPNG());
    if (errors.length) throw Error(errors.join('\n'));
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (win && !win.isDestroyed()) {
      if (!familyOnly) await fs.writeFile(path.join(directory, 'sidebar-failure.png'), (await win.webContents.capturePage()).toPNG());
      console.error(await win.webContents.executeJavaScript(`JSON.stringify({ agent: document.querySelector('.pane-active')?.dataset.paneActiveAgentId, toggles: [...document.querySelectorAll('.pane-chat-toggle')].map(button => ({label:button.getAttribute('aria-label'), on:button.classList.contains('on')})), content:document.querySelector('.terminal-area')?.innerText.slice(0,1000) })`));
    }
    app.exit(1);
  } });
} else {
  const { build } = await import('esbuild');
  await fs.mkdir(directory, { recursive: true });
  await fs.copyFile(path.join(appRoot, 'public/app-icon.png'), path.join(directory, 'app-icon.png'));
  const profile = await fs.mkdtemp(path.join(directory, 'profile-'));
  await build({ entryPoints: [path.join(appRoot, 'scripts/fixtures/sidebar-workspace-renderer.tsx')], bundle: true, jsx: 'automatic', define: { 'import.meta.env': '{}', '__MULTIAGENT_APP_VERSION__': JSON.stringify('sidebar-smoke') }, outfile: path.join(directory, 'renderer.js') });
  await fs.writeFile(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>');
  const env = { ...process.env, ACEDIA_SIDEBAR_SMOKE_PROFILE: profile, ACEDIA_SIDEBAR_FAMILY_ONLY: familyOnly ? '1' : '0' }; delete env.ELECTRON_RUN_AS_NODE;
  env.ACEDIA_SIDEBAR_FILE_ROOTS_ONLY = fileRootsOnly ? '1' : '0';
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { cwd: appRoot, env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(Error('Sidebar smoke timed out')); }, 60000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Sidebar smoke failed: ' + code)); });
  });
}
