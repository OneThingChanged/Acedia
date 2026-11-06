import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

// Pure headless buffers: never attaches to a running app, PTY or user profile.
// An optional module path lets developers compare a saved source baseline.
const current = new URL('../electron/services/terminal-stream.mjs', import.meta.url);
const sources = [['current', current]];
if (process.argv[2]) sources.unshift(['baseline', pathToFileURL(path.resolve(process.argv[2]))]);
const modules = new Map(await Promise.all(sources.map(async ([name, url]) => [name, await import(url.href)])));
const result = Object.fromEntries(sources.map(([name, url]) => [name, { source: fileURLToPath(url), repaintMs: [], idlePollMs: [] }]));
const rows = Array.from({ length: 50 }, (_, i) => `\x1b[${i + 1};1H\x1b[32m${('line ' + i + ' 코드 ').repeat(10)}\x1b[0m\x1b[K`).join('');
const frame = `\x1b[?2026h\x1b[2J\x1b[H${rows}\x1b[?2026l`;
let viewport;
// Alternate baseline/current order in the same process to reduce JIT, GC and
// changing desktop-load bias. Use --expose-gc for repeatable independent cases.
for (let round = 0; round < 8; round++) {
  for (const [name] of round % 2 ? [...sources].reverse() : sources) {
    global.gc?.();
    const { CodexScrollbackFilter, SequencedTerminalBuffer } = modules.get(name);
    const filter = new CodexScrollbackFilter(55, 200);
    let writes = 0;
    try {
      for (const term of [filter.shadow, filter.probe]) {
        const write = term._core.writeSync;
        term._core.writeSync = function (...args) { writes++; return write.apply(this, args); };
      }
      for (let i = 0; i < 10; i++) filter.push(frame);
      writes = 0;
      const start = performance.now();
      for (let i = 0; i < 150; i++) filter.push(frame);
      result[name].repaintMs.push(performance.now() - start);
      result[name].writesPerFrame = writes / 150;
      const currentViewport = filter.viewportText();
      if (viewport && viewport !== currentViewport) throw new Error('Viewport changed');
      viewport = currentViewport;
    } finally { filter.dispose(); }
    if (round < 3) {
      global.gc?.();
      const buffer = new SequencedTerminalBuffer();
      for (let i = 0; i < 1000; i++) buffer.append('x'.repeat(512));
      const start = performance.now();
      for (let i = 0; i < 4000; i++) buffer.readSince(buffer.nextSequence);
      result[name].idlePollMs.push(performance.now() - start);
    }
  }
}
const median = values => +values.sort((a, b) => a - b)[Math.floor(values.length / 2)].toFixed(2);
console.log(JSON.stringify({ frames: 150, polls: 4000, retainedCharacters: 512000, viewportPreserved: true,
  results: Object.fromEntries(Object.entries(result).map(([name, r]) => [name, {
    source: r.source, medianRepaintMs: median(r.repaintMs), writesPerFrame: r.writesPerFrame, medianIdlePollMs: median(r.idlePollMs),
  }])) }));
