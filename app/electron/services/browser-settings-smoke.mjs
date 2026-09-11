import http from 'node:http';
import assert from 'node:assert/strict';

export async function verifyBrowserSettings(window, records) {
  const call = (command, args = {}) => window.webContents.executeJavaScript('window.multiAgentElectron.invoke(' + JSON.stringify(command) + ',' + JSON.stringify(args) + ')');
  const server = http.createServer((_req, res) => res.end('<title>Browser preferences fixture</title><p>Local browser test</p>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const home = 'http://127.0.0.1:' + server.address().port + '/';
  const before = await call('browser_preferences_get');
  const previous = new Set(records.keys());
  try {
    let settings = await call('browser_preferences_set', { patch: { home, zoom: 125, links: 'internal' }, revision: before.revision });
    const first = await call('document_browser_open', { folder: '', relativePath: '', useHome: true });
    const record = records.get(first.browserId);
    assert.equal(record.view.webContents.getURL(), home);
    assert.equal(record.view.webContents.getZoomFactor(), 1.25);
    settings = await call('browser_preferences_set', { patch: { zoom: 150 }, revision: settings.revision });
    assert.equal(record.view.webContents.getZoomFactor(), 1.5);
    await assert.rejects(call('browser_preferences_set', { patch: { home: 'file:///bad' }, revision: settings.revision }));
    await assert.rejects(call('browser_preferences_set', { patch: { zoom: 100 }, revision: before.revision }));
    await call('document_browser_navigate', { browserId: first.browserId, url: home + 'next', addressBar: true });
    assert.equal(record.view.webContents.getURL(), home + 'next');
    await call('open_external_url', { url: home + 'linked' });
    assert.ok([...records.values()].some(r => r.view.webContents.getURL() === home + 'linked'));
    console.log('BROWSER_SETTINGS_RUNTIME_OK');
  } finally {
    const latest = await call('browser_preferences_get');
    await call('browser_preferences_set', { patch: before, revision: latest.revision });
    for (const id of records.keys()) if (!previous.has(id)) await call('document_browser_hub_close', { browserId: id });
    await new Promise(resolve => server.close(resolve));
  }
}
