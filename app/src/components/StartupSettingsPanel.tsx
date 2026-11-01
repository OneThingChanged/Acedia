import { useEffect, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { SettingScope, settingTarget } from './SettingsSearch';

type Startup = { supported: boolean; enabled: boolean; registered: boolean; windowsDisabled: boolean; reason: string | null };
export function StartupSettingsPanel() {
  const { text } = useAppLanguage();
  const [value, setValue] = useState<Startup | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => { void invoke<Startup>('app_startup_get').then(state => { if (active) { setValue(state); setError(''); } }).catch(() => { if (active) setError(text('시작 프로그램 설정을 불러오지 못했습니다.', 'Could not load Windows startup settings.')); }); };
    load(); window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, []);
  const change = async (enabled: boolean) => {
    setBusy(true); setError('');
    try { setValue(await invoke<Startup>('app_startup_set', { enabled })); }
    catch { setError(text('적용하지 못했습니다. Windows의 시작 앱 설정을 확인한 뒤 다시 시도하세요.', 'Could not apply the setting. Check Startup apps in Windows Settings and retry.')); }
    finally { setBusy(false); }
  };
  return <div className="app-settings-section">
    <div className="field-label">{text('앱 시작', 'App startup')}</div>
    <div {...settingTarget('general.startup')}><label className="app-checkbox-row">
      <input type="checkbox" checked={value?.enabled === true} disabled={!value?.supported || busy} onChange={event => void change(event.target.checked)}/>
      <span>{text('Windows 로그인 시 Acedia 자동 실행', 'Launch Acedia when I sign in to Windows')}</span>
    </label><SettingScope id="general.startup"/></div>
    <p className="app-update-message">{value?.supported
      ? value.windowsDisabled ? text('Windows에서 시작 앱이 비활성화되어 있습니다. 체크하면 다시 활성화합니다.', 'Disabled in Windows Startup apps. Check the box to enable it again.') : text('이 PC의 현재 사용자에게 적용합니다. 자동 실행된 앱도 평소처럼 열립니다.', 'Applies to the current Windows user on this PC. The app opens normally at sign-in.')
      : value?.reason === 'store' ? text('이 버전의 로그인 자동 실행 설정은 EXE 설치본에서 지원합니다. Store 설치본에서는 아직 사용할 수 없습니다.', 'Sign-in startup is supported in the EXE installation. It is not yet available in the Store build.')
      : text('Windows EXE 설치본에서 사용할 수 있습니다. 개발·검증 프로필은 시작 프로그램을 등록하지 않습니다.', 'Available in the installed Windows EXE. Development and test profiles do not register startup apps.')}</p>
    {error && <p className="app-update-message app-update-error" role="alert">{error}</p>}
  </div>;
}
