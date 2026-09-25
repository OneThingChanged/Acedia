import { useEffect, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import type { Agent, Project } from '../types';
type Server = { url: string; port: number; name: string };
export function SessionServerButton({ agent, projects }: { agent: Agent; projects: Project[] }) {
  const { text } = useAppLanguage();
  const [servers, setServers] = useState<Server[]>([]);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const project = projects.find(p => p.id === agent.projectId);
  const folder = project?.folder;
  const remote = Boolean(agent.sshHostId || project?.sshHostId);
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    setServers([]); setError('');
    if (remote) return;
    const load = async () => {
      try {
        const next = await invoke<Server[]>('session_web_servers', { id: agent.id, projectId: agent.projectId, projects: folder ? [{id: agent.projectId, folder}] : [] });
        if (!disposed) setServers(next);
      } catch { if (!disposed) setServers([]); }
      finally { if (!disposed) timer = setTimeout(() => void load(), 15000); }
    };
    void load();
    return () => { disposed = true; clearTimeout(timer); };
  }, [agent.id, agent.projectId, folder, remote]);
  const open = async (url: string) => {
    setOpening(true); setError('');
    try { await invoke('open_server_chrome', { url }); }
    catch (reason) { setError(String(reason)); }
    finally { setOpening(false); }
  };
  if (!servers.length && !error) return null;
  return <>
    {servers.length === 1 && <button className="pane-chat-toggle" disabled={opening} title={`${text('Chrome으로 서버 열기', 'Open server in Chrome')} · ${servers[0].url}`} onClick={() => void open(servers[0].url)}>{text('서버 열기', 'Open server')} :{servers[0].port}</button>}
    {servers.length > 1 && <select className="pane-chat-toggle" aria-label={text('Chrome으로 열 서버 선택', 'Select server to open in Chrome')} disabled={opening} value="" onChange={event => { if (event.target.value) void open(event.target.value); }}>
      <option value="" disabled>{text('서버 열기', 'Open server')} ({servers.length})</option>
      {servers.map(server => <option key={server.url} value={server.url}>:{server.port} · {server.name}</option>)}
    </select>}
    {error && <span role="alert" title={error} style={{ color: 'var(--danger, #f88)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>}
  </>;
}
