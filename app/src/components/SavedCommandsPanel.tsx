import { useEffect, useState } from 'react';
import { invoke } from '../platform/runtime';
import type { Project } from '../types';
import { findSshHost, sshHostSummary } from '../lib/sshHosts';
import { useAppLanguage } from '../lib/appLanguage';
import { SettingLabel, SettingScope, settingTarget } from './SettingsSearch';
type Command = { id: string; name: string; command: string; scope: 'global' | 'project'; projectId?: string };
type Config = { revision: number; commands: Command[]; startups: Record<string, { commandId: string; automatic: boolean }> };
export type RunSavedCommand = (id: string, projectId: string) => Promise<void>;
export function SavedCommandsPanel({ projects = [], initialProjectId, onRun }: { projects?: Project[]; initialProjectId?: string; onRun?: RunSavedCommand }) {
  const { text } = useAppLanguage();
  const [config, setConfig] = useState<Config | null>(null);
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [draft, setDraft] = useState<Command>({ id: '', name: '', command: '', scope: 'global' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const load = () => { setBusy(true); void invoke<Config>('saved_commands_get').then(c => { setConfig(c); setMessage(''); }).catch(() => setMessage(text('명령을 불러오지 못했습니다.', 'Could not load commands.'))).finally(() => setBusy(false)); };
  useEffect(load, []);
  const save = async (patch: Partial<Config>) => {
    if (!config) return false;
    setBusy(true);
    try { const next = await invoke<Config>('saved_commands_set', { patch, revision: config.revision }); setConfig(next); setMessage(text('저장했습니다.', 'Saved.')); return true; }
    catch { setMessage(text('저장하지 못했습니다. 입력값을 확인하고 다른 창에서 수정했다면 다시 불러오세요.', 'Could not save. Check the values or reload changes from another window.')); return false; }
    finally { setBusy(false); }
  };
  const project = projects.find(p => p.id === projectId), host = project?.sshHostId ? findSshHost(project.sshHostId) : null;
  const commands = config?.commands.filter(c => c.scope === 'global' || c.projectId === projectId) || [];
  const start = config?.startups[projectId];
  return <section className="app-settings-section saved-commands-panel">
    <p className="check-hint">{text('저장한 명령은 선택한 프로젝트의 새 셸 세션에서 실행합니다. 기존 AI 세션에 입력하지 않습니다.', 'Run saved commands in a new shell session for the selected project. Existing AI sessions keep their input.')}</p>
    <label className="field"><span className="field-label">{text('실행 프로젝트', 'Run in project')}</span><select aria-label={text('실행 프로젝트', 'Run in project')} value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">{text('프로젝트 선택', 'Select project')}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <p className="check-hint" style={{ overflowWrap: 'anywhere' }}>{project ? (host ? sshHostSummary(host) + ' · ' + (project.remoteFolder || '') : project.sshHostId ? text('SSH 호스트를 찾을 수 없습니다.', 'SSH host unavailable.') : text('이 PC', 'This PC') + ' · ' + project.folder) : text('실행하려면 프로젝트를 선택하세요.', 'Select a project to run commands.')}</p>
    <fieldset disabled={busy || !config} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="agent-settings-card" style={{ padding: 16 }} {...settingTarget('commands.library')}>
        <h4><SettingLabel id="commands.library"/><SettingScope id="commands.library"/></h4>
        {!commands.length && <p>{text('저장한 명령이 없습니다.', 'No saved commands.')}</p>}
        {commands.map(c => <div key={c.id} style={{ borderBottom: '1px solid var(--app-border)', padding: '10px 0' }}><strong>{c.name}</strong> <small>{c.scope === 'global' ? text('전역', 'Global') : text('프로젝트', 'Project')}</small>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{c.command}</pre><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setDraft(c)}>{text('편집', 'Edit')}</button>
          <button className="btn-secondary" onClick={() => { if (config) void save({ commands: config.commands.filter(x => x.id !== c.id), startups: Object.fromEntries(Object.entries(config.startups).filter(([, x]) => x.commandId !== c.id)) }); }}>{text('삭제', 'Delete')}</button>
          <button className="btn-primary" disabled={!project || !onRun || Boolean(project.sshHostId && !host)} onClick={() => { setBusy(true); void onRun?.(c.id, projectId).catch(() => setMessage(text('명령 세션을 시작하지 못했습니다.', 'Could not start the command session.'))).finally(() => setBusy(false)); }}>{text('새 셸에서 실행', 'Run in new shell')}</button></div></div>)}
        <details style={{ marginTop: 16 }} open={Boolean(draft.id) || undefined}><summary>{text('명령 추가·편집', 'Add or edit command')}</summary>
          <label className="field"><span className="field-label">{text('이름', 'Name')}</span><input value={draft.name} maxLength={80} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
          <label className="field"><span className="field-label">{text('범위', 'Scope')}</span><select value={draft.scope} onChange={e => setDraft({ ...draft, scope: e.target.value as Command['scope'] })}><option value="global">{text('모든 프로젝트', 'All projects')}</option><option value="project">{text('선택한 프로젝트', 'Selected project')}</option></select></label>
          <label className="field"><span className="field-label">{text('셸 명령', 'Shell command')}</span><textarea rows={4} value={draft.command} maxLength={16384} style={{ width: '100%', boxSizing: 'border-box' }} onChange={e => setDraft({ ...draft, command: e.target.value })}/></label>
          <p className="check-hint">{text('대상 셸 문법으로 입력하세요. 명령 세션을 다시 시작하면 명령도 다시 실행됩니다.', 'Use the target shell syntax. Restarting a command session runs its command again.')}</p>
          <button className="btn-primary" disabled={!draft.name.trim() || !draft.command.trim() || (draft.scope === 'project' && !project)} onClick={async () => { if (!config) return; const c = { ...draft, id: draft.id || crypto.randomUUID(), projectId: draft.scope === 'project' ? projectId : undefined }; if (await save({ commands: [...config.commands.filter(x => x.id !== c.id), c] })) setDraft({ id: '', name: '', command: '', scope: 'global' }); }}>{text('명령 저장', 'Save command')}</button>
        </details>
      </div>
      <div className="agent-settings-card" style={{ padding: 16, marginTop: 16 }} {...settingTarget('commands.startup')}>
        <h4><SettingLabel id="commands.startup"/><SettingScope id="commands.startup"/></h4>
        <select aria-label={text('프로젝트 시작 명령', 'Project startup command')} disabled={!project} value={start?.commandId || ''} onChange={e => { if (!config) return; const startups = { ...config.startups }; if (e.target.value) startups[projectId] = { commandId: e.target.value, automatic: false }; else delete startups[projectId]; void save({ startups }); }}><option value="">{text('없음', 'None')}</option>{commands.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label className="app-checkbox-row"><input type="checkbox" checked={Boolean(start?.automatic)} disabled={!start} onChange={e => { if (config && start) void save({ startups: { ...config.startups, [projectId]: { ...start, automatic: e.target.checked } } }); }}/>{text('프로젝트 클릭 시 앱 실행당 한 번 자동 실행', 'Run once per app launch when this project is selected')}</label>
        <p className="check-hint">{text('변경 즉시 저장합니다. 앱 시작·화면 복원만으로는 실행하지 않습니다. 실행 폴더와 호스트는 선택한 프로젝트를 따릅니다.', 'Saved immediately. App startup and layout restoration do not run it. Uses the selected project’s folder and host.')}</p>
      </div>
    </fieldset>
    <button className="btn-secondary" disabled={busy} style={{ marginTop: 12 }} onClick={load}>{text('다시 불러오기', 'Reload')}</button>{message && <p role="status">{message}</p>}
  </section>;
}
