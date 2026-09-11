import { useEffect, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { SettingLabel, SettingScope, settingTarget } from './SettingsSearch';
type IdleSettings={revision:number;enabled:boolean;minutes:number};
export function IdleSessionsPanel() {
  const {text}=useAppLanguage();
  const [value,setValue]=useState<IdleSettings|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const load=()=>void invoke<IdleSettings>('idle_preferences_get').then(setValue).catch(()=>setMessage(text('불러오지 못했습니다.','Could not load settings.')));
  useEffect(()=>{load();},[]);
  return <section className="app-settings-section"><p className="check-hint">{text('완료 후 사용하지 않는 로컬 Codex·Claude 세션의 메모리를 확보합니다. 기본값은 꺼짐입니다.','Free memory from completed local Codex and Claude sessions that are no longer in use. Disabled by default.')}</p>
    {value && <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="agent-settings-card">
      <label className="agent-settings-row" {...settingTarget('idle.enabled')}><span className="agent-row-title"><SettingLabel id="idle.enabled"/><SettingScope id="idle.enabled"/></span><input aria-label={text('유휴 세션 자동 중지','Automatically suspend idle sessions')} type="checkbox" checked={value.enabled} onChange={e=>setValue({...value,enabled:e.target.checked})}/></label>
      <label className="agent-settings-row" {...settingTarget('idle.minutes')}><span className="agent-row-title"><SettingLabel id="idle.minutes"/><SettingScope id="idle.minutes"/></span><select aria-label={text('유휴 시간','Idle time')} value={value.minutes} onChange={e=>setValue({...value,minutes:Number(e.target.value)})}>{[5,15,30,60,120].map(n=><option key={n} value={n}>{text(`${n}분`,`${n} minutes`)}</option>)}</select></label>
    </div><p className="check-hint">{text('작업 중·응답 대기·화면에 열린 세션은 중지하지 않습니다. 완료 훅, 입력·출력·화면 사용 이력과 같은 계정의 대화 파일을 확인합니다. SSH·Shell·복원이 불확실한 세션은 제외합니다.','Working, waiting and displayed sessions stay active. Completion hooks, input/output/view activity and a conversation file in the same account are checked. SSH, Shell and sessions without verified recovery are excluded.')}</p>
    <p className="check-hint">{text('중지된 세션은 파란 대기 상태로 남습니다. 클릭하면 원래 계정·대화·실행 옵션으로 복원합니다. 대화 파일이 없어졌으면 새 대화를 대신 시작하지 않고 오류를 표시합니다. 작업창이 닫힌 동안에는 자동 중지를 검사하지 않습니다.','Suspended sessions remain blue in standby. Click to resume the original account, conversation and launch options. If the conversation disappeared, an error is shown instead of starting another one. Automatic checks pause while the owning workspace is closed.')}</p>
    <button className="btn-primary" onClick={()=>{setBusy(true);void invoke<IdleSettings>('idle_preferences_set',{patch:value,revision:value.revision}).then(next=>{setValue(next);setMessage(text('저장했습니다.','Saved.'));}).catch(()=>setMessage(text('저장하지 못했습니다. 다른 창의 변경을 다시 불러오세요.','Could not save. Reload changes from another window.'))).finally(()=>setBusy(false));}}>{text('저장','Save')}</button></fieldset>}
    <button className="btn-secondary" disabled={busy} style={{marginTop:12}} onClick={load}>{text('다시 불러오기','Reload settings')}</button>{message&&<p role="status">{message}</p>}
  </section>;
}
