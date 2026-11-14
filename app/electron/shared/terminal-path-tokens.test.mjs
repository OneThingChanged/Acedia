import { Worker } from 'node:worker_threads';
import { expect, it } from 'vitest';
import { terminalSpecializedPathMatches } from './terminal-path-tokens.mjs';

it.each([
  ['document', '문서 (G:\\AI\\ProjectWitch\\Docs\\검증.md:12:3)', ['G:\\AI\\ProjectWitch\\Docs\\검증.md:12:3']],
  ['document', '한 줄 (Docs/Status.md) · (Client/Saved/Validation/index.html)', ['Docs/Status.md', 'Client/Saved/Validation/index.html']],
  ['document', '문서 ../Docs/검증.markdown · 상태 Docs/Status.MD · 페이지 ./Saved/report.HTM', ['../Docs/검증.markdown', 'Docs/Status.MD', './Saved/report.HTM']],
  ['document', '/home/project/notes.md \\server\\share\\notes.md', ['/home/project/notes.md', '\\server\\share\\notes.md']],
  ['image', '그림 (Client/Saved/Captures/front.PNG) · [../Images/back.webp]', ['Client/Saved/Captures/front.PNG', '../Images/back.webp']],
  ['image', 'D:\\Images\\front.png E:/Images/back.jpg', ['D:\\Images\\front.png', 'E:/Images/back.jpg']],
  ['image', 'textures.png/Output/result.json', []],
  ['document', 'notes.md/Output/result.json', []],
  ['document', 'README.md README.markdown', ['README.md', 'README.markdown']],
])('keeps %s path boundaries and clickable offsets in %s', (kind, text, expected) => {
  const matches = terminalSpecializedPathMatches(text, kind);
  expect(matches.map(match => match.raw)).toEqual(expected);
  for (const match of matches) expect(text.slice(match.startIndex, match.endIndex)).toBe(match.raw);
});

it('completes deep non-image paths and long terminal tokens within a bounded worker deadline', async () => {
  // A worker deadline prevents a future regex regression from hanging the test
  // runner just as it previously hung the renderer on an ordinary JSON path.
  const moduleUrl = new URL('./terminal-path-tokens.mjs', import.meta.url).href;
  const worker = new Worker(`(async () => {
    const { parentPort, workerData } = require('node:worker_threads');
    const { terminalSpecializedPathMatches: scan } = await import(workerData);
    const deep = 'G:\\\\AI\\\\' + Array(512).fill('ProjectWitch').join('\\\\');
    const long = 'a'.repeat(128000) + '.json';
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      if (scan(deep + '\\\\Result.json', 'document').length || scan(deep + '\\\\Result.json', 'image').length
        || scan(long, 'document').length || scan(long, 'image').length) throw new Error('False specialized link');
    }
    parentPort.postMessage({ elapsedMs: performance.now()-start,
      documents: scan(deep + '\\\\Status.md', 'document').length, images: scan(deep + '\\\\image.png', 'image').length });
  })().catch(error => { throw error; });`, { eval: true, workerData: moduleUrl });
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Terminal link scanner exceeded 2 seconds')), 2000);
      worker.once('message', value => { clearTimeout(timer); resolve(value); });
      worker.once('error', error => { clearTimeout(timer); reject(error); });
    });
    expect(result).toMatchObject({ documents: 1, images: 1 });
    expect(result.elapsedMs).toBeLessThan(1000);
  } finally { await worker.terminate(); }
});
