import { expect, it } from 'vitest';
import { viewedImagePaths } from './viewedImagePath';

it('recovers original image paths from direct Codex view_image calls without guessing from unrelated text', () => {
  expect(viewedImagePaths([
    { role: 'assistant', kind: 'tool-call', name: 'view_image', input: { path: 'K:/Client/Saved/Reports/20261007/desktop-times.png' } },
    { role: 'assistant', kind: 'tool-call', name: 'functions.view_image', input: JSON.stringify({ path: 'K:\\Client\\Saved\\Reports\\20261007\\desktop-times.png' }) },
    { role: 'assistant', kind: 'text', text: 'Unrelated desktop-times.png' },
  ], 'desktop-times.png')).toEqual(['K:\\Client\\Saved\\Reports\\20261007\\desktop-times.png']);
});

it('keeps different locations distinguishable instead of silently choosing a duplicate basename', () => {
  const blocks = ['K:/Reports/desktop-times.png', 'K:/Other/desktop-times.png'].map(path => ({ role: 'assistant' as const, kind: 'tool-call' as const, name: 'view_image', input: { path } }));
  expect(viewedImagePaths(blocks, 'desktop-times.png')).toHaveLength(2);
  expect(viewedImagePaths(blocks, 'desktop-slider.png')).toEqual([]);
});
