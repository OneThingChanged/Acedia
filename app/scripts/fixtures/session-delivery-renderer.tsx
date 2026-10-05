import { createRoot } from 'react-dom/client';
import { SessionDeliveryNotice } from '../../src/components/SessionDeliveryNotice';
import type { SessionDelivery } from '../../src/lib/sessionDelivery';
import '../../src/App.css';
const listeners = new Set<(payload: SessionDelivery) => void>();
let records: SessionDelivery[] = [];
window.multiAgentElectron = {
  invoke: async command => { if (command === 'session_deliveries_get') return records; return null; },
  onEvent: (name, listener) => { if (name === 'agent:session-delivery') listeners.add(listener); return () => listeners.delete(listener); },
};
window.deliveryFixture = { patch: (record: SessionDelivery) => { records = [record]; listeners.forEach(listener => listener(record)); } };
createRoot(document.getElementById('root')!).render(<SessionDeliveryNotice agentId='caller' />);
