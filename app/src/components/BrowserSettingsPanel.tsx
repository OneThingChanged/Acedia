import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { SettingLabel, SettingScope, settingTarget } from './SettingsSearch';

type BrowserPreferences = { revision: number; home: string; search: string; zoom: number; links: string };
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
    </div><button className="btn-primary" style={{ marginTop: 16 }} onClick={() => { setBusy(true); void invoke<BrowserPreferences>('browser_preferences_set', { patch: value, revision: value.revision })
      .then(next => { setValue(next); setMessage(text('저장했습니다.', 'Saved.')); }).catch(() => setMessage(text('저장하지 못했습니다. 입력값을 확인하거나 다른 창의 변경을 다시 불러오세요.', 'Could not save. Check the values or reload changes from another window.'))).finally(() => setBusy(false)); }}>{text('저장', 'Save')}</button></fieldset>}
    <button className="btn-secondary" disabled={busy} style={{ marginTop: 12 }} onClick={load}>{text('다시 불러오기', 'Reload settings')}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
