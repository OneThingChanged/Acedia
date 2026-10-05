import { createRoot } from 'react-dom/client';
import { CapacityRetryNotice } from '../../src/components/CapacityRetryNotice';
import type { CapacityRetryState } from '../../src/lib/capacityRetry';
import '../../src/App.css';
const listeners = new Set<(payload: CapacityRetryState) => void>();
let current: CapacityRetryState | null = null;
window.multiAgentElectron = {
  invoke: async command => {
    if (command === 'capacity_retry_get') return current;
    if (command === 'capacity_retry_cancel') {
      window.capacityFixture.cancels++;
      current = { ...current!, status: 'cancelled' }; listeners.forEach(listener => listener(current!)); return true;
    }
    return null;
  },
  onEvent: (name, listener) => {
    if (name === 'agent:capacity-retry') listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
window.capacityFixture = { cancels: 0, patch: (value: CapacityRetryState) => { current = value; listeners.forEach(listener => listener(value)); } };
createRoot(document.getElementById('root')!).render(<CapacityRetryNotice agentId='fixture' />);
