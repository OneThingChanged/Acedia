import { expect, it } from 'vitest';
import { zoomImageView } from './image-zoom.js';

it('keeps the point under the wheel or pinch anchor stationary while zooming', () => {
  const before = { scale: 0.5, x: 30, y: -20 };
  const anchor = { x: 100, y: 60 };
  const after = zoomImageView(before, 2, anchor);
  expect((anchor.x - after.x) / after.scale).toBe((anchor.x - before.x) / before.scale);
  expect((anchor.y - after.y) / after.scale).toBe((anchor.y - before.y) / before.scale);
  expect(after.scale).toBe(1);
});

it('bounds image scale and restores the same location after an inverse zoom', () => {
  const view = { scale: 1, x: 10, y: 20 };
  expect(zoomImageView(view, 100).scale).toBe(16);
  expect(zoomImageView(view, 0.0001).scale).toBe(0.05);
  expect(zoomImageView(zoomImageView(view, 2), 0.5)).toEqual(view);
});
