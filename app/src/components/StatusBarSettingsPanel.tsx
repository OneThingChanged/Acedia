import { useEffect, useState } from 'react';
import { useAppLanguage } from '../lib/appLanguage';
import { loadStatusBar, subscribeStatusBar, updateStatusBar, type StatusBarSettings } from '../lib/statusBarSettings';
import { SettingLabel, SettingScope, settingTarget } from './SettingsSearch';

export function StatusBarSettingsPanel({enabled, onEnabledChange}: {enabled:boolean; onEnabledChange:(value:boolean)=>void}) {
  const {text} = useAppLanguage();
  const [value,setValue] = useState(loadStatusBar), [error,setError] = useState('');
  useEffect(() => subscribeStatusBar(setValue),[]);
  const update = (patch: Partial<StatusBarSettings>) => { try {setValue(updateStatusBar(patch));setError('');} catch {setError(text('설정을 저장하지 못했습니다.','Could not save settings.'));} };
  return <section className="app-settings-section">
    <p className="check-hint">{text('하단바의 에이전트 사용량을 눌러 모든 계정을 확인하고, 표시할 계정 하나를 선택합니다. 아래 도구 필터는 하단바에 선택할 수 있는 계정을 정합니다. 변경은 모든 앱 작업창에 바로 적용합니다.', 'Click Agent usage in the status bar to review all accounts and choose one to display. The tool filters below determine which accounts can be selected. Changes apply immediately across app workspaces.')}</p>
    <div className="agent-settings-card">
      <label className="agent-settings-row" {...settingTarget('status.enabled')}><span className="agent-row-title"><SettingLabel id="status.enabled"/><SettingScope id="status.enabled"/></span><input aria-label={text('상태 표시줄 표시','Show status bar')} type="checkbox" checked={enabled} onChange={e => onEnabledChange(e.target.checked)}/></label>
      {(['codex','claude','gemini','other','resources','ports'] as const).map(key => <label key={key} className="agent-settings-row" {...settingTarget('status.'+key)}><span className="agent-row-title"><SettingLabel id={'status.'+key}/><SettingScope id={'status.'+key}/></span><input aria-label={'status.'+key} type="checkbox" checked={value[key]} onChange={e => update({[key]:e.target.checked})}/></label>)}
      <label className="agent-settings-row" {...settingTarget('status.display')}><span className="agent-row-title"><SettingLabel id="status.display"/><SettingScope id="status.display"/></span><select aria-label={text('한도 비율 표시','Quota percentage display')} value={value.display} onChange={e => update({display:e.target.value as StatusBarSettings['display']})}><option value="used">{text('사용 비율','Used percentage')}</option><option value="remaining">{text('남은 비율','Remaining percentage')}</option></select></label>
    </div><p className="check-hint">{text('리소스와 포트는 이 PC에서 집계합니다. 표시를 끄면 해당 화면의 주기적 조회도 멈춥니다. 비율을 바꿔도 경고 색은 실제 한도 소진 정도를 기준으로 유지합니다.', 'Resources and ports are measured on this PC. Hiding either stops its view’s periodic polling. Warning colors always reflect actual quota consumption, regardless of display mode.')}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
