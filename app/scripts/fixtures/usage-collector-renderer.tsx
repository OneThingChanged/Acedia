import React from 'react';
import { createRoot } from 'react-dom/client';
import { UsageCollectorPanel } from '../../src/components/UsageCollectorPanel';
import '../../src/App.css';
window.multiAgentElectron = {
  invoke: (command, args) => window.require('electron').ipcRenderer.invoke(command, args),
  onEvent: () => () => {},
};
createRoot(document.getElementById('root')!).render(<div style={{ width: '100%', padding: 30 }}><UsageCollectorPanel /></div>);
