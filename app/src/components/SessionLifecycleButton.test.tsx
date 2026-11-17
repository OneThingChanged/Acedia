import { beforeEach, expect, it, vi } from 'vitest';
import { SessionLifecycleButton } from './SessionLifecycleButton';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), setPending: vi.fn() }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [false, mock.setPending], useRef: () => ({ current: false }) }));
vi.mock('../platform/runtime', () => ({ invoke: (...args: unknown[]) => mock.invoke(...args) }));
vi.mock('../lib/appLanguage', () => ({ useAppLanguage: () => ({ text: (ko: string) => ko }) }));
beforeEach(() => vi.clearAllMocks());
it.each([false, true])('submits an exact lifecycle request once and waits for host acknowledgement (active:%s)', async active => {
  let release!: () => void;
  mock.invoke.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const onSuccess = vi.fn(), onError = vi.fn();
  const button = SessionLifecycleButton({ id: 'child', active, onSuccess, onError });
  const pending = button.props.onClick(); await button.props.onClick();
  expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('project_board_session_action', { id: 'child', action: active ? 'stop' : 'start', expectedActive: active });
  expect(onSuccess).not.toHaveBeenCalled();
  release(); await pending; expect(onSuccess).toHaveBeenCalledOnce();
});
it('surfaces a changed-state/launch error without claiming success', async () => {
  mock.invoke.mockRejectedValue(new Error('상태가 변경되었습니다'));
  const onSuccess = vi.fn(), onError = vi.fn();
  await SessionLifecycleButton({ id: 'child', active: true, onSuccess, onError }).props.onClick();
  expect(onSuccess).not.toHaveBeenCalled(); expect(onError).toHaveBeenLastCalledWith('Error: 상태가 변경되었습니다');
});
