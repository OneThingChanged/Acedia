import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatMarkdown } from '../../src/components/ChatMarkdown';
import { ImageViewer } from '../../src/components/ImageViewer';
import { ChatImage } from '../../src/components/ChatImage';
import { ChatFiles } from '../../src/components/ChatFiles';
import { PaneSlot } from '../../src/components/PaneSlot';
import { revealImagePath } from '../../src/lib/imageActions';
import { updateTerminalSettings } from '../../src/lib/terminalSettings';
import '@xterm/xterm/css/xterm.css';
import '../../src/App.css';

const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
const context = canvas.getContext('2d')!;
context.fillStyle = '#143845'; context.fillRect(0, 0, 1600, 1000);
context.fillStyle = '#64dec7'; context.font = '64px sans-serif'; context.fillText('Image viewer · zoom / pan / copy', 80, 200);
context.strokeStyle = '#64dec7'; for (let x = 0; x < 1600; x += 100) { context.strokeRect(x, 300, 80, 400); }
const dataUrl = canvas.toDataURL('image/png');
window.imageFixture = { copies: [], failCopy: false, opened: [], reveals: [], clicks: [], reads: [], pasteReads: 0 };
window.multiAgentElectron = {
  invoke: async (command, args) => {
    if (command === 'resolve_terminal_path') return {kind: 'image', path: /^(?:[A-Z]:|file:)/i.test(args.path) ? args.path : `${args.folder || 'C:/Fixture'}/${args.path}`};
    if (command === 'read_image_data_url') { window.imageFixture.reads.push(args); return dataUrl; }
    if (command === 'reveal_local_path') { window.imageFixture.reveals.push(args.path); return null; }
    if (command === 'spawn_pty') return { reattached: true };
    if (command === 'attach_terminal') return { data: '', sequenceStart: 0, sequenceEnd: 0 };
    if (command === 'session_web_servers') return [];
    if (command === 'account_session_status') return { mode: 'direct', label: 'Fixture account' };
    if (command === 'session_notifications_get') return { enabled: true, revision: 0 };
    if (command === 'session_deliveries_get') return [];
    if (command === 'chat_blocks') return { blocks: [], sessionId: 'fixture', lifecycle: 'idle' };
    if (command === 'clipboard_write_image') {
      if (window.imageFixture.failCopy) throw new Error('fixture copy failure');
      window.imageFixture.copies.push(args); return null;
    }
    if (command === 'clipboard_read_text') { window.imageFixture.pasteReads++; return 'fixture text'; }
    return null;
  }, onEvent: () => () => {},
};
function Harness() {
  const [path, setPath] = useState('');
  const [mode, setMode] = useState('chat');
  const terms = useRef(new Map());
  const open = async (next, reveal = false) => {
    window.imageFixture.opened.push(next); window.imageFixture.clicks.push({path:next,reveal});
    if (reveal) await revealImagePath(next, 'C:/Fixture'); else setPath(next);
  };
  window.imageFixture.mode = setMode;
  window.imageFixture.setTerminalPaste = enabled => updateTerminalSettings({rightClickToPaste:enabled});
  window.imageFixture.terminalReady = () => !!terms.current.get('image-terminal')?.attached;
  window.imageFixture.seedTerminal = async text => {
    const entry = terms.current.get('image-terminal'); entry.term.reset();
    await new Promise(resolve => entry.term.write(text, resolve));
  };
  window.imageFixture.terminalPoint = (row, col) => {
    const entry = terms.current.get('image-terminal'); const rect = entry.el.querySelector('.xterm-screen').getBoundingClientRect();
    return { x: Math.round(rect.left + (col + .5) * rect.width / entry.term.cols), y: Math.round(rect.top + (row + .5) * rect.height / entry.term.rows) };
  };
  const agent = {id:'image-terminal',projectId:'fixture',name:'Image terminal',aiToolId:'codex',folder:'C:/Fixture',status:'running',runtimeStatus:'running'};
  const noop = () => {};
  return <div className="app" style={{height:'100%',width:'100%',display:'flex',flexDirection:'column'}}>{mode === 'chat' ? <div style={{overflow:'auto'}}>
    <ChatMarkdown folder="C:/Fixture" onOpenPath={open}>{'`output/akari-parts-v1-2026-10-07/character-four-view.png` · [결과 이미지](K:/Exports/SummerSix-20261007/preview.png)'}</ChatMarkdown>
    <div id="data-only-image"><ChatImage dataUrl={dataUrl} alt="Memory image" /></div>
    <ChatFiles folder="C:/Fixture" files={[{path:'C:/Fixture/card.png',kind:'image',size:123,usage:'reference'}]} onOpenPath={open} />
  </div> : <PaneSlot leaf={{type:'leaf',id:'image-pane',tabs:[agent.id],activeIndex:0}} path={[]} ctx={{agents:[agent],projects:[{id:'fixture',name:'Fixture',folder:'C:/Fixture'}],theme:'dark',sessionPins:null,activePath:[],dragState:null,dropTarget:null,termsRef:terms,
    setAgentStatus:noop,setAgentSessionId:noop,setActivePath:noop,onCloseTab:noop,onSelectTab:noop,onResizeAt:noop,onDragStart:noop,onDragEnd:noop,onDropTargetChange:noop,onDrop:noop,onTabContextMenu:noop,
    chatModeAgents:new Set(),onToggleChat:noop,getDocumentOwner:()=>null,fallbackDocumentAgentId:null,onOpenBrowser:noop,onOpenMarkdownPath:noop,onOpenFolderPath:noop,
    onOpenImagePath:(_id,file,reveal)=>open(file,reveal),onOpenTerminalPath:(_id,file,reveal)=>open(file,reveal)} as any} />}
    {path && <ImageViewer path={path} folder="C:/Fixture" onClose={() => setPath('')} />}</div>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
