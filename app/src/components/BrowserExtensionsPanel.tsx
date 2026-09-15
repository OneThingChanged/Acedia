import { useEffect, useRef, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { settingTarget } from './SettingsSearch';
type Extension = { id: string; name: string; version: string; directory: string; enabled: boolean; status: string; error: string };
export function BrowserExtensionsPanel({ profiles }: { profiles: { id: string; label: string }[] }) {
  const { text } = useAppLanguage();
  const [profileId, setProfileId] = useState(profiles[0]?.id || 'multiagent-browser');
  const [entries, setEntries] = useState<Extension[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const run = async (action?: string, args: Record<string, unknown> = {}) => {
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await invoke<Extension[]>(action ? 'browser_extensions_change' : 'browser_extensions_list', { profileId, action, ...args });
      if (current === generation.current) setEntries(result);
    } catch (reason) { if (current === generation.current) setError(String(reason)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  useEffect(() => { setEntries([]); void run(); return () => { generation.current++; }; }, [profileId]);
  useEffect(() => { if (!profiles.some(p => p.id === profileId)) setProfileId(profiles[0]?.id || 'multiagent-browser'); }, [profiles, profileId]);
  const add = async () => {
    setBusy(true); setError('');
    try {
      const directory = await invoke<string | null>('show_open_dialog', { directory: true });
      if (directory) await run('add', { directory });
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  return <section className="agent-settings-card" style={{ marginTop: 16, padding: 16 }} {...settingTarget('browser.extensions')}>
    <h4>{text('브라우저 확장 프로그램', 'Browser extensions')}</h4>
    <p className="check-hint">{text('manifest.json이 들어 있는 압축 해제된 확장 폴더를 선택하세요. 신뢰하는 확장만 추가하세요. 확장은 허용된 사이트의 내용을 읽거나 변경할 수 있습니다.', 'Select an unpacked extension folder containing manifest.json. Add extensions you trust: they can read or change permitted sites.')}</p>
    <p className="check-hint">{text('웹스토어 직접 설치·CRX 파일은 지원하지 않습니다. Chrome API 일부만 지원하므로 확장에 따라 동작하지 않을 수 있습니다. 확장 버튼·팝업 UI는 현재 지원하지 않습니다.', 'Direct Web Store installation and CRX files are not supported. Some Chrome APIs are unavailable, so compatibility varies. Extension toolbar buttons and popups are not currently supported.')}</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <label>{text('적용할 프로필', 'Profile')} <select aria-label={text('확장 프로그램 프로필', 'Extension profile')} value={profileId} onChange={e => setProfileId(e.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}><button className="btn-secondary" onClick={() => void add()}>{text('확장 폴더 추가', 'Add extension folder')}</button><button className="btn-secondary" onClick={() => void run()}>{text('상태 새로고침 / 재시도', 'Refresh / retry')}</button></div>
      {!entries.length && <p className="check-hint">{text('등록된 확장 프로그램이 없습니다.', 'No extensions added.')}</p>}
      {entries.map(entry => <div key={entry.id} style={{ marginTop: 16, borderTop: '1px solid var(--border-color, #333)', paddingTop: 12 }}>
        <strong>{entry.name} {entry.version}</strong>
        <p className="check-hint" style={{ overflowWrap: 'anywhere' }}>{entry.directory}</p>
        <p role="status">{entry.status === 'loaded' ? text('로드됨', 'Loaded') : entry.status === 'disabled' ? text('꺼짐', 'Disabled') : text('로드 실패', 'Load failed')}</p>
        {entry.error && <p role="alert" style={{ overflowWrap: 'anywhere' }}>{entry.error}</p>}
        <div style={{ display: 'flex', gap: 12 }}><label><input type="checkbox" checked={entry.enabled} onChange={e => void run('toggle', { id: entry.id, enabled: e.target.checked })}/>{text('사용', 'Enabled')}</label><button className="btn-secondary" onClick={() => void run('remove', { id: entry.id })}>{text('목록에서 제거', 'Remove')}</button></div>
      </div>)}
    </fieldset>
    <p className="check-hint">{text('변경은 즉시 저장됩니다. 열린 웹페이지는 새로고침하세요. 다음 앱 실행에서 해당 프로필을 열면 자동 로드됩니다. 원본 확장 폴더는 유지하세요. 목록에서 제거해도 원본 파일은 삭제하지 않습니다.', 'Changes save immediately. Reload open pages to apply. Extensions load automatically when their profile opens after restart. Keep the source folder; removing an entry does not delete its files.')}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
