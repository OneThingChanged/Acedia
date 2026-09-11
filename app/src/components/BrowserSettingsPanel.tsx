import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { SettingLabel, SettingScope, settingTarget } from './SettingsSearch';

export type BrowserPreferences = { revision: number; home: string; search: string; zoom: number; links: string; profiles: { id: string; label: string }[]; defaultProfile: string; restoreTabs: boolean };
export function BrowserSettingsPanel() {
  const { text } = useAppLanguage();
  const [value, setValue] = useState<BrowserPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = () => { setBusy(true); void invoke<BrowserPreferences>('browser_preferences_get').then(next => { setValue(next); setMessage(''); })
    .catch(() => setMessage(text('설정을 불러오지 못했습니다.', 'Could not load settings.'))).finally(() => setBusy(false)); };
  useEffect(load, []);
  const row = (id: string, control: ReactNode, hint: string) => <label className="agent-settings-row terminal-settings-row" {...settingTarget(id)}>
    <span><span className="agent-row-title"><SettingLabel id={id}/><SettingScope id={id}/></span><span className="agent-row-sub">{hint}</span></span>{control}</label>;
  return <section className="app-settings-section browser-settings-panel">
    <p className="check-hint">{text('저장하면 모든 앱 창에서 같은 기본값을 사용합니다. 기존 탭의 주소와 로그인은 유지합니다.', 'Saved defaults are shared by all app windows. Existing tab addresses and logins are kept.')}</p>
    {value && <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="agent-settings-card">
      {row('browser.home', <input aria-label={text('시작 페이지', 'Home page')} value={value.home} onChange={e => setValue({ ...value, home: e.target.value })}/>, text('다음 새 탭부터 적용 · HTTP/HTTPS 주소', 'Applies to new tabs · HTTP/HTTPS URL'))}
      {row('browser.search', <select aria-label={text('검색엔진', 'Search engine')} value={value.search} onChange={e => setValue({ ...value, search: e.target.value })}><option value="google">Google</option><option value="bing">Bing</option><option value="duckduckgo">DuckDuckGo</option></select>, text('주소창에 입력한 검색어에 적용', 'Used for search phrases in the address bar'))}
      {row('browser.zoom', <select aria-label={text('기본 확대율', 'Default zoom')} value={value.zoom} onChange={e => setValue({ ...value, zoom: Number(e.target.value) })}>{[50,75,90,100,110,125,150,175,200].map(n => <option key={n} value={n}>{n}%</option>)}</select>, text('저장 시 현재·새 브라우저 탭에 적용', 'Applies to current and new browser tabs when saved'))}
      {row('browser.links', <select aria-label={text('웹 링크 열기', 'Open web links')} value={value.links} onChange={e => setValue({ ...value, links: e.target.value })}><option value="external">{text('기본 외부 브라우저', 'Default external browser')}</option><option value="internal">{text('앱 내부 새 탭', 'New tab in this app')}</option></select>, text('앱의 일반 웹 링크에 적용. 로그인 전용 흐름은 해당 도구의 방식을 사용합니다.', 'Applies to ordinary app web links. Dedicated sign-in flows use their tool’s browser flow.'))}
      {row('browser.defaultProfile', <select aria-label={text('기본 브라우저 프로필', 'Default browser profile')} value={value.defaultProfile} onChange={e => setValue({ ...value, defaultProfile: e.target.value })}>{value.profiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>, text('새 탭에 적용 · 기존 탭의 프로필은 유지', 'Used for new tabs · existing tabs keep their profile'))}
      {row('browser.restore', <input aria-label={text('웹 탭 복원', 'Restore web tabs')} type="checkbox" checked={value.restoreTabs} onChange={e => setValue({ ...value, restoreTabs: e.target.checked })}/>, text('다음 앱 시작 시 웹 탭을 원래 프로필로 복원 · 최대 50개', 'Restore up to 50 web tabs with their profiles on the next app start'))}
    </div>
    <div className="agent-settings-card" style={{ marginTop: 16, padding: 16 }} {...settingTarget('browser.profiles')}>
      <h4><SettingLabel id="browser.profiles"/><SettingScope id="browser.profiles"/></h4>
      <p className="check-hint">{text('프로필마다 로그인·쿠키를 분리합니다. 기존 로그인은 Default에 있습니다. 목록에서 제거해도 저장된 쿠키는 삭제하지 않습니다.', 'Profiles separate logins and cookies. Existing logins remain in Default. Removing a profile from this list does not erase its cookies.')}</p>
      {value.profiles.map(p => <div key={p.id} className="folder-row" style={{ marginTop: 8 }}>
        <input aria-label={text('프로필 이름', 'Profile name')} value={p.label} maxLength={60} style={{ minWidth: 0, flex: 1 }} onChange={e => setValue({ ...value, profiles: value.profiles.map(item => item.id === p.id ? { ...item, label: e.target.value } : item) })}/>
        <button className="btn-secondary" disabled={p.id === 'multiagent-browser' || p.id === value.defaultProfile} onClick={() => setValue({ ...value, profiles: value.profiles.filter(item => item.id !== p.id) })}>{text('목록에서 제거', 'Remove from list')}</button>
      </div>)}
      <button className="btn-secondary" style={{ marginTop: 12 }} disabled={value.profiles.length >= 32} onClick={() => setValue({ ...value, profiles: [...value.profiles, { id: crypto.randomUUID(), label: text('새 프로필', 'New profile') }] })}>{text('＋ 프로필 추가', '＋ Add profile')}</button>
      <p className="check-hint">{text('열린 탭이 있는 프로필을 제거하려면 해당 탭을 먼저 닫으세요. 변경 후 저장을 누르세요.', 'Close a profile’s open tabs before removing it. Save to apply your changes.')}</p>
    </div><button className="btn-primary" style={{ marginTop: 16 }} onClick={() => { setBusy(true); void invoke<BrowserPreferences>('browser_preferences_set', { patch: value, revision: value.revision })
      .then(next => { setValue(next); setMessage(text('저장했습니다.', 'Saved.')); }).catch(() => setMessage(text('저장하지 못했습니다. 입력값을 확인하거나 다른 창의 변경을 다시 불러오세요.', 'Could not save. Check the values or reload changes from another window.'))).finally(() => setBusy(false)); }}>{text('저장', 'Save')}</button></fieldset>}
    <button className="btn-secondary" disabled={busy} style={{ marginTop: 12 }} onClick={load}>{text('다시 불러오기', 'Reload settings')}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
