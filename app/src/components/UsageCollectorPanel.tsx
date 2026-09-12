import { useEffect, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { settingTarget } from './SettingsSearch';

type Root = { path: string; provider: string; accountId: string; since?: number };
type Status = { enrolled: boolean; enabled: boolean; server?: string; employee?: { name: string }; deviceId?: string; roots: Root[]; pending: number; events: number; lastSuccess?: number; error?: string; warnings?: string[] };
type Account = { id: string; name: string; provider: string; kind: string };
type Source = { path: string; provider: string; label: string };
export function UsageCollectorPanel() {
  const { text } = useAppLanguage();
  const [status, setStatus] = useState<Status | null>(null), [accounts, setAccounts] = useState<Account[]>([]), [sources, setSources] = useState<Source[]>([]);
  const [server, setServer] = useState(''), [code, setCode] = useState(''), [name, setName] = useState('');
  const [roots, setRoots] = useState<Root[]>([]), [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const apply = (next: Status) => { setStatus(next); setRoots(next.roots); setEnabled(next.enabled); };
  useEffect(() => {
    let active = true;
    void Promise.all([invoke<Status>('collector_status'), invoke<Source[]>('collector_sources')]).then(async ([next, available]) => {
      if (!active) return; apply(next); setSources(available);
      if (next.enrolled) { const list = await invoke<Account[]>('collector_accounts'); if (active) setAccounts(list); }
    }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, []);
  const action = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  return <div className="app-settings-section usage-collector" {...settingTarget('collector.server')}>
    <div className="field-label">{text('회사 사용량 수집 서버', 'Company usage collector')}</div>
    <div className="app-about-card">
      <p>{text('직원·AI 계정별 사용량과 남은 한도, 계정 이메일·식별자, PC 이름·Windows 계정명·로컬 IP를 전송합니다. 대화·코드·AI 인증 비밀은 전송하지 않습니다.', 'Send usage and remaining limits, account email/identifier, PC name, Windows username and local IP addresses. Conversations, code and AI authentication secrets are not sent.')}</p>
      {!status?.enrolled ? <>
        <label className="field-label" htmlFor="collector-server">{text('서버 주소', 'Server URL')}</label>
        <input id="collector-server" value={server} onChange={e => setServer(e.target.value)} placeholder="https://usage.example.com" style={{ width: '100%' }} />
        <label className="field-label" htmlFor="collector-code">{text('일회용 등록 코드', 'One-time enrollment code')}</label>
        <input id="collector-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} style={{ width: '100%' }} />
        <label className="field-label" htmlFor="collector-name">{text('기기 이름', 'Device name')}</label>
        <input id="collector-name" value={name} onChange={e => setName(e.target.value)} placeholder={text('예: 회사 노트북', 'e.g. Work laptop')} style={{ width: '100%' }} />
        <button disabled={busy || !server || !code || !name} onClick={() => void action(async () => {
          apply(await invoke<Status>('collector_enroll', { server, code, name })); setCode(''); setAccounts(await invoke<Account[]>('collector_accounts'));
        })}>{text('기기 등록', 'Enroll device')}</button>
      </> : <>
        <p><strong>{status.employee?.name}</strong> · {status.server}</p>
        <p className="check-hint">{text('기기', 'Device')}: {status.deviceId}</p>
        <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {text('사용량 전송 활성화 (저장 시 적용)', 'Enable usage upload (applies on Save)')}</label>
        <p className="check-hint">{text('수집할 로그 폴더를 서버 계정에 직접 연결하세요. 개인 계정은 연결한 경우에만 전송합니다. 연결 이전의 기록은 수집하지 않습니다.', 'Explicitly map transcript folders to server accounts. Personal accounts upload only when mapped. Records before mapping are excluded.')}</p>
        {roots.map((root, i) => <div key={i} className="app-about-card" style={{ marginTop: 12 }}>
          <select aria-label={text('공급자', 'Provider')} value={root.provider} onChange={e => setRoots(roots.map((r, n) => n === i ? { ...r, provider: e.target.value, accountId: '' } : r))}><option value="codex">Codex</option><option value="claude">Claude Code</option></select>
          <select aria-label={text('서버 계정', 'Server account')} value={root.accountId} onChange={e => setRoots(roots.map((r, n) => n === i ? { ...r, accountId: e.target.value } : r))}>
            <option value="">{text('서버 계정 선택', 'Select server account')}</option>{accounts.filter(a => a.provider === root.provider).map(a => <option key={a.id} value={a.id}>{a.name} · {a.kind === 'shared' ? text('공용', 'Shared') : text('개인', 'Personal')}</option>)}
          </select>
          <input aria-label={text('Transcript 폴더 경로', 'Transcript folder path')} value={root.path} onChange={e => setRoots(roots.map((r, n) => n === i ? { ...r, path: e.target.value } : r))} style={{ width: '100%', marginTop: 8 }} />
          <button onClick={() => setRoots(roots.filter((_, n) => n !== i))}>{text('연결 제거', 'Remove mapping')}</button>
        </div>)}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
          <button onClick={() => setRoots([...roots, { path: '', provider: 'codex', accountId: '' }])}>{text('폴더 추가', 'Add folder')}</button>
          <select aria-label={text('Acedia 계정 폴더 추가', 'Add Acedia account folder')} value="" onChange={e => { const source = sources[Number(e.target.value)]; if (source) setRoots([...roots, { path: source.path, provider: source.provider, accountId: '' }]); }}><option value="">{text('Acedia 계정 폴더에서 선택', 'Choose an Acedia account folder')}</option>{sources.map((s, i) => <option key={i} value={i}>{s.provider} · {s.label}</option>)}</select>
          <button disabled={busy} onClick={() => void action(async () => { apply(await invoke<Status>('collector_configure', { config: { enabled, roots } })); })}>{text('저장', 'Save')}</button>
          <button disabled={busy} onClick={() => void action(async () => { apply(await invoke<Status>('collector_pause')); })}>{text('즉시 일시 중지', 'Pause now')}</button>
        </div>
      </>}
    </div>
    {status && <div className="app-about-card" style={{ marginTop: 16 }}>
      <strong>{status.enabled ? text('수집 켜짐', 'Collection enabled') : text('수집 꺼짐', 'Collection disabled')}</strong>
      <p>{text('전송 대기', 'Pending')}: {status.pending} · {text('로컬 기록', 'Local events')}: {status.events}</p>
      <p>{text('마지막 서버 응답', 'Last server success')}: {status.lastSuccess ? new Date(status.lastSuccess).toLocaleString() : text('없음', 'None')}</p>
      {status.error && <p role="alert">{status.error}</p>}{status.warnings?.map((w, i) => <p key={i}>{w}</p>)}
      <button disabled={busy || !status.enrolled} onClick={() => void action(async () => { setStatus(await invoke<Status>('collector_flush')); })}>{text('지금 수집·전송', 'Collect and send now')}</button>
      <button disabled={busy} onClick={() => void action(async () => { setStatus(await invoke<Status>('collector_status')); if (status.enrolled) setAccounts(await invoke<Account[]>('collector_accounts')); })}>{text('상태 새로고침', 'Refresh status')}</button>
    </div>}
    <p className="check-hint">{text('Codex·Claude Code CLI 로그 수집을 지원합니다. ChatGPT·Claude 일반 채팅의 자동 토큰 수집은 미지원이며, MCP는 수집된 사용량 조회만 제공합니다.', 'Supports local Codex and Claude Code transcripts. Automatic token collection for ordinary ChatGPT/Claude chats is not supported. MCP provides collected-usage queries only.')}</p>
    {error && <p role="alert" className="settings-error">{error}</p>}
  </div>;
}
