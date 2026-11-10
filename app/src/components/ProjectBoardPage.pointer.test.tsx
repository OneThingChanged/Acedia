import { Children, isValidElement, type ReactNode, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectBoardPage } from './ProjectBoardPage';

// React may defer/replay functional updates until after pointerup. Run actual
// component handlers with queued state updates, without browser/UI automation.
const state = vi.hoisted(() => ({ values: [] as unknown[], pending: [] as (() => void)[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.values.length;
    state.values.push(typeof initial === 'function' ? initial() : initial);
    return [state.values[index], (next: unknown) => {
      if (typeof next === 'function') state.pending.push(() => { state.values[index] = next(state.values[index]); });
      else state.values[index] = next;
    }];
  },
  useRef: (current: unknown) => ({ current }),
  useMemo: (compute: () => unknown) => compute(), useCallback: (callback: unknown) => callback, useEffect: () => {},
}));
vi.mock('../lib/appLanguage', () => ({ useAppLanguage: () => ({ text: (ko: string) => ko }) }));

type Canvas = { onPointerDown: (event: unknown) => void; onPointerMove: (event: unknown) => void; onPointerUp: () => void; onPointerCancel: () => void; onLostPointerCapture: () => void };
function findCanvas(node: ReactNode): ReactElement<Canvas> | null {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return null;
  if (node.props.className === 'wb-canvas') return node as unknown as ReactElement<Canvas>;
  for (const child of Children.toArray(node.props.children)) { const found = findCanvas(child); if (found) return found; }
  return null;
}
beforeEach(() => { state.values = []; state.pending = []; });

it.each(['onPointerUp', 'onPointerCancel', 'onLostPointerCapture'] as const)('keeps a queued pan valid after %s clears its drag anchor', end => {
  const canvas = findCanvas(ProjectBoardPage())!;
  expect(canvas).not.toBeNull();
  const setPointerCapture = vi.fn();
  canvas.props.onPointerDown({ button: 0, pointerId: 1, clientX: 100, clientY: 200,
    target: { closest: () => null }, currentTarget: { setPointerCapture } });
  canvas.props.onPointerMove({ clientX: 150, clientY: 260 });
  canvas.props.onPointerMove({ clientX: 170, clientY: 280 });
  expect(state.pending).toHaveLength(2);
  canvas.props[end]();
  expect(() => { for (const apply of state.pending) apply(); }).not.toThrow();
  expect(state.values).toContainEqual({ zoom: .8, x: 94, y: 104 });
  expect(setPointerCapture).toHaveBeenCalledWith(1);
});
