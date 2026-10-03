import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PaneSlot } from '../../src/components/PaneSlot';
import { AppLanguageProvider } from '../../src/lib/appLanguage';
import '../../src/App.css';
const events = new Map();
let preference = { enabled: true, revision: 0 };
localStorage.setItem('multiagent.appLanguage.v1', 'en');
window.multiAgentElectron = {
  invoke: async (command, args) => {
    if (command === 'session_notifications_get') return preference;
    if (command === 'session_notifications_set') {
      preference = { enabled: args.enabled, revision: preference.revision + 1 };
      for (const fn of events.get('session:notifications') || []) fn({ id: args.id, ...preference });
      return preference;
    }
    if (command === 'spawn_pty') return { reattached: true };
    if (command === 'attach_terminal') return { data: '', sequenceStart: 0, sequenceEnd: 0 };
    if (command === 'session_web_servers') return [];
    if (command === 'account_session_status') return { mode: 'direct', label: 'Fixture account' };
    if (command === 'chat_blocks') return { blocks: [], sessionId: 'fixture', lifecycle: 'idle' };
    return null;
  },
  onEvent: (name, fn) => { const list=events.get(name)||new Set(); list.add(fn); events.set(name,list); return () => list.delete(fn); },
};
function Harness() {
  const [chat, setChat] = useState(false);
  const [theme, setTheme] = useState('soft');
  const terms = useRef(new Map());
  window.toolbarFixture = { theme: setTheme };
  const agent = { id: 'one', projectId: 'p', name: 'Question session', aiToolId: 'codex', folder: 'C:/fixture', status: 'question', runtimeStatus: 'running', activity: { workStatus: 'waiting', interactiveQuestion: 'Ready for your answer', receivedAt: Date.now() } };
  const noop = () => {};
  return <div className={`app app-theme-${theme}`} style={{width:'100%',height:'100%',display:'flex'}}><PaneSlot leaf={{type:'leaf',id:'pane',tabs:['one'],activeIndex:0}} path={[]} ctx={{ agents:[agent], projects:[], theme, sessionPins:null, activePath:[], dragState:null, dropTarget:null, termsRef:terms,
    setAgentStatus:noop, setAgentSessionId:noop, setActivePath:noop, onCloseTab:noop, onSelectTab:noop, onResizeAt:noop, onDragStart:noop, onDragEnd:noop, onDropTargetChange:noop, onDrop:noop, onTabContextMenu:noop,
    chatModeAgents: chat ? new Set(['one']) : new Set(), onToggleChat:()=>setChat(v=>!v), onRecoverSession:async()=>{}, getDocumentOwner:()=>null, fallbackDocumentAgentId:null, onOpenBrowser:noop, onOpenMarkdownPath:noop,onOpenImagePath:noop,onOpenFolderPath:noop,onOpenTerminalPath:noop } as any}/></div>;
}
createRoot(document.getElementById('root')).render(<AppLanguageProvider><Harness/></AppLanguageProvider>);
