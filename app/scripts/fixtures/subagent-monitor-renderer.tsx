import React from 'react';
import {createRoot} from 'react-dom/client';
import {SubagentMonitor} from '../../src/components/SubagentMonitor';
import '../../src/App.css';
window.multiAgentElectron={invoke:(command,args)=>window.require('electron').ipcRenderer.invoke(command,args),onEvent:()=>()=>{}};
createRoot(document.getElementById('root')!).render(<div style={{display:'flex',height:'100vh'}}><div style={{flex:1}}>Main terminal remains here</div><SubagentMonitor agentId="main" sessionId="parent" onClose={()=>document.body.dataset.closed='true'}/></div>);
