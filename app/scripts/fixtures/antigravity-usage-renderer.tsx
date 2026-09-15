import React from 'react';
import { createRoot } from 'react-dom/client';
import { UsageStatusBar } from '../../src/components/UsageStatusBar';
import '../../src/App.css';
localStorage.setItem('multiagent.statusBar.v1', JSON.stringify({ selectedAccount: 'agy', display: 'remaining', resources: false, ports: false }));
window.multiAgentElectron = {
  invoke: (command, args) => window.require('electron').ipcRenderer.invoke(command, args),
  onEvent: () => () => {},
};
createRoot(document.getElementById('root')!).render(<UsageStatusBar agents={[]} projects={[]} onSelectProject={() => {}} />);
