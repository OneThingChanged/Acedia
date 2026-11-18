import { afterEach, expect, it, vi } from 'vitest';
import { createOfficeRenderer } from './pixelOfficeRenderer';
import { layoutOfficeScene } from './pixelOffice';

afterEach(() => vi.unstubAllGlobals());

function canvasFixture() {
  const context = {
    setTransform: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
    clearRect: vi.fn(), drawImage: vi.fn(), setLineDash: vi.fn(), save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  };
  let width = 300, height = 150;
  const sizeWrites: [string, number][] = [];
  const canvas = {
    get width() { return width; }, set width(value: number) { width = value; sizeWrites.push(['width', value]); },
    get height() { return height; }, set height(value: number) { height = value; sizeWrites.push(['height', value]); },
    getContext: () => context,
  };
  return { canvas, context, sizeWrites };
}

it('keeps the presented frame intact through movement and reuses the background until the view changes', () => {
  const { canvas, context, sizeWrites } = canvasFixture();
  const background = canvasFixture(), createElement = vi.fn(() => background.canvas);
  vi.stubGlobal('document', { createElement });
  const paint = createOfficeRenderer(canvas as unknown as HTMLCanvasElement, new Map())!;
  const scene = layoutOfficeScene([]), initial = { width: 400, height: 300, x: 0, y: 0, zoom: 1 };
  const paintView = (view: typeof initial) => paint(scene, view, new Map(), 0, false, 1.25);

  paintView(initial);
  const backgroundDraws = background.context.fillRect.mock.calls.length;
  paintView(initial);
  expect(background.context.fillRect).toHaveBeenCalledTimes(backgroundDraws);

  paintView({ ...initial, x: -40, y: -28 });
  paintView({ ...initial, zoom: 1.5 });
  expect(sizeWrites).toEqual([['width', 500], ['height', 375]]);
  expect(background.sizeWrites).toEqual([['width', 400], ['height', 300]]);
  expect(createElement).toHaveBeenCalledExactlyOnceWith('canvas');
  expect(context.clearRect).not.toHaveBeenCalled();
  expect(context.drawImage.mock.calls).toEqual(Array.from({ length: 4 }, () => [background.canvas, 0, 0]));

  paintView({ ...initial, width: 420 });
  expect(sizeWrites[sizeWrites.length - 1]).toEqual(['width', 525]);
  expect(context.drawImage).toHaveBeenCalledTimes(5);
});
