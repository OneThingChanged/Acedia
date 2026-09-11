import { useEffect, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { SettingLabel, SettingScope, settingTarget } from './SettingsSearch';
import { playNotificationSound, loadNotificationSound, shouldSilenceOsNotification } from '../lib/notificationSound';

type Policy = { revision: number; completion: boolean; bell: boolean; suppressFocused: boolean; powerMode: string };
export function NotificationPolicyPanel() {
  const { text } = useAppLanguage();
  const [value, setValue] = useState<Policy | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [power, setPower] = useState<{active: boolean; workingCount: number} | null>(null);
  const load = () => { void invoke<Policy>('notification_preferences_get').then(setValue).catch(() => setMessage(text('불러오지 못했습니다.', 'Could not load settings.'))); };
  useEffect(load, []);
  useEffect(() => { const poll = () => void invoke<{active: boolean; workingCount: number}>('power_policy_status').then(setPower).catch(() => {}); poll(); const timer = setInterval(poll, 3000); return () => clearInterval(timer); }, []);
  const save = async () => { if (!value) return; setBusy(true); try { setValue(await invoke<Policy>('notification_preferences_set', { patch: value, revision: value.revision })); setMessage(text('저장했습니다.', 'Saved.')); } catch { setMessage(text('저장하지 못했습니다. 다른 창의 변경을 다시 불러오세요.', 'Could not save. Reload changes from another window.')); } finally { setBusy(false); } };
  return <section className="app-settings-section"><h4>{text('알림 조건과 절전', 'Notification conditions and sleep')}</h4>
    {value && <fieldset disabled={busy} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}><div className="agent-settings-card">
      {(['completion','bell','suppressFocused'] as const).map(key => <label key={key} className="agent-settings-row" {...settingTarget('general.' + key)}><span className="agent-row-title"><SettingLabel id={'general.' + key}/><SettingScope id={'general.' + key}/></span><input type="checkbox" aria-label={key === 'completion' ? text('완료 알림', 'Completion alerts') : key === 'bell' ? text('터미널 벨 알림', 'Terminal bell alerts') : text('앱 집중 중 알림 억제', 'Suppress alerts while focused')} checked={value[key]} onChange={e => setValue({...value, [key]: e.target.checked})}/></label>)}
      <label className="agent-settings-row" {...settingTarget('general.power')}><span className="agent-row-title"><SettingLabel id="general.power"/><SettingScope id="general.power"/></span><select aria-label={text('절전 방지', 'Prevent sleep')} value={value.powerMode} onChange={e => setValue({...value, powerMode:e.target.value})}><option value="off">{text('끔','Off')}</option><option value="working">{text('작업 중','While working')}</option><option value="always">{text('항상','Always')}</option></select></label>
    </div><p className="check-hint">{text('집중 중 억제는 소유 작업창에 초점이 있을 때 소리·팝업을 끕니다. 사이드바 완료 표시는 유지합니다. 작업 중 모드는 훅으로 확인된 작업·응답 대기 동안 시스템 절전을 막습니다. 화면 꺼짐은 막지 않습니다.', 'Focus suppression mutes sounds and popups while the owning workspace is focused; sidebar completion markers remain. Working mode prevents system sleep during hook-confirmed work or response waits. The display can still turn off.')}</p>
    <p role="status">{power ? text(`절전 방지 ${power.active ? '동작 중' : '해제'} · 작업 ${power.workingCount}개`, `Sleep prevention ${power.active ? 'active' : 'inactive'} · ${power.workingCount} tasks`) : ''}</p>
    <button className="btn-primary" onClick={() => void save()}>{text('저장','Save')}</button></fieldset>}
    <div className="folder-row" style={{marginTop:12}}><button className="btn-secondary" onClick={load} disabled={busy}>{text('다시 불러오기','Reload settings')}</button>
    <button className="btn-secondary" {...settingTarget('general.alertTest')} onClick={() => { const sound = loadNotificationSound(); void playNotificationSound(sound); if (sound.osNotification !== false) void invoke('show_native_notification', {title:'Acedia',body:text('알림 테스트입니다.','Notification test.'),silent:shouldSilenceOsNotification(sound)}).catch(() => setMessage(text('알림 테스트에 실패했습니다.','Notification test failed.'))); setMessage(text('조건과 관계없이 선택한 소리·Windows 알림을 테스트합니다.','Tests the selected sound and Windows notification regardless of conditions.')); }}>{text('알림 테스트','Test notification')}<SettingScope id="general.alertTest"/></button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
