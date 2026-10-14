import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatView } from '../../src/components/ChatView';
import '../../src/App.css';
const listeners = new Set<(payload: unknown) => void>();
window.multiAgentElectron = {
  invoke: (command, args) => (window as any).paginationBridge.invoke(command, args),
  onEvent: (name, listener) => { if(name==='chat:changed')listeners.add(listener);return()=>listeners.delete(listener); },
};
function Harness() {
  const [id,setId]=useState('fixture');
  (window as any).paginationFixture={ refresh:()=>listeners.forEach(listener=>listener({})), switch:id=>setId(id) };
  return <ChatView agentId={id} sessionId="one" provider="codex" agentStatus="running" active theme="soft" onOpenTerminal={()=>{}}/>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
