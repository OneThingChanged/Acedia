import { afterEach, expect, it, vi } from 'vitest';
import { cancelVideoPreview, loadVideoPreview, videoAccessError, videoPlaybackError } from './video-preview.js';

afterEach(() => vi.unstubAllGlobals());

it('reports HTTP file and permission errors before assigning a media source', async () => {
  for (const status of [404,401,403,415,503]) {
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status})));
    const video={},onError=vi.fn();
    expect(await loadVideoPreview(video,'/api/files/video?path=demo.mp4',{isCurrent:()=>true,onError})).toBe(false);
    expect(video.src).toBeUndefined();expect(onError).toHaveBeenCalledWith(videoAccessError(status));
    expect(fetch).toHaveBeenCalledWith('/api/files/video?path=demo.mp4',expect.objectContaining({method:'HEAD',credentials:'same-origin',cache:'no-store'}));
    cancelVideoPreview(video);
  }
  expect(videoAccessError(404)).toContain('file not found');
  expect(videoAccessError(403)).toContain('permissions');
  expect(videoAccessError(503)).toContain('503');
});

it('distinguishes decoder and network errors after successful access', async () => {
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200})));
  const video={},onError=vi.fn();
  expect(await loadVideoPreview(video,'/video',{isCurrent:()=>true,onError})).toBe(true);
  expect(video.src).toBe('/video');
  for (const code of [2,3,4]) {video.error={code};video.onerror();expect(onError).toHaveBeenLastCalledWith(videoPlaybackError(code));}
  expect(videoPlaybackError(2)).toContain('network');expect(videoPlaybackError(4)).toContain('codec');
  cancelVideoPreview(video);expect(video.onerror).toBeNull();
});

it('does not load a closed or replaced preview when its delayed request finishes', async () => {
  let release;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{release=resolve})));
  const video={},onError=vi.fn();
  const first=loadVideoPreview(video,'/old',{isCurrent:()=>true,onError});
  cancelVideoPreview(video);release({ok:true,status:200});expect(await first).toBe(false);
  expect(video.src).toBeUndefined();expect(onError).not.toHaveBeenCalled();
  let current=true;
  const next=loadVideoPreview(video,'/new',{isCurrent:()=>current,onError});
  current=false;release({ok:false,status:404});expect(await next).toBe(false);
  expect(video.src).toBeUndefined();expect(onError).not.toHaveBeenCalled();
  cancelVideoPreview(video);
});

it('reports a connection failure without turning it into a codec failure', async () => {
  vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('Offline')}));
  const video={},onError=vi.fn();
  expect(await loadVideoPreview(video,'/video',{isCurrent:()=>true,onError})).toBe(false);
  expect(onError.mock.calls[0][0]).toContain('network');expect(video.src).toBeUndefined();
  cancelVideoPreview(video);
});
