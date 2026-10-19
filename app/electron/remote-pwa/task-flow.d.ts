export function createTaskFlowView(root: HTMLElement, options: { api: (action: string, body: Record<string, unknown>) => Promise<any>; ownerId?: string; openSession?: (id: string) => void }): { enter(): void; leave(): void; destroy(): void };
export function taskDelegationRequest(value: string): string;
