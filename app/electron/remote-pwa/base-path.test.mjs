import { expect, it } from 'vitest';
import { remoteBasePath, remotePath, remoteLocalPath } from './base-path.js';
it('derives the service prefix from its own module address and builds only application routes', () => {
  expect(remoteBasePath('https://agent.example.com/acedia/pwa/base-path.js')).toBe('/acedia/');
  expect(remoteBasePath('https://agent.example.com/tools/acedia/pwa/base-path.js')).toBe('/tools/acedia/');
  expect(remotePath('/api/state', '/acedia/')).toBe('/acedia/api/state');
  expect(remotePath('/api/state', '/api/')).toBe('/api/api/state');
  expect(remoteLocalPath('/acedia/preview/token/a.html', '/acedia/')).toBe('/preview/token/a.html');
  expect(remoteLocalPath('/acedia-other/preview/token/a.html', '/acedia/')).toBe(null);
  for (const external of ['https://other.test/page', '//other.test/page', 'blob:abc', 'data:image/png;base64,a']) expect(remotePath(external, '/acedia/')).toBe(external);
});
