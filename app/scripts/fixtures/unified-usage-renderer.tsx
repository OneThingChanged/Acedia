import React from 'react';
import { createRoot } from 'react-dom/client';
import { UsageStatusBar } from '../../src/components/UsageStatusBar';
import { AppLanguageProvider } from '../../src/lib/appLanguage';
import '../../src/App.css';

if (!localStorage.getItem('multiagent.statusBar.v1')) localStorage.setItem('multiagent.statusBar.v1', JSON.stringify({
  selectedAccounts: ['codex'], resources: false, ports: false,
}));
localStorage.setItem('multiagent.appLanguage.v1', 'ko');
createRoot(document.getElementById('root')!).render(<AppLanguageProvider><div className="app app-theme-soft" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
  <div style={{ flex: 1, padding: 30 }}>Acedia · Unified account usage</div>
  <UsageStatusBar agents={[]} projects={[]} onSelectProject={() => {}} />
</div></AppLanguageProvider>);
