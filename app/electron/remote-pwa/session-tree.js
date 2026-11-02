// Use the current editable parent, never the session that originally created it.
// Invalid, archived and cross-project parents leave a session at the root.
export function buildSessionFamilies(visible, all, { includeDescendants = false } = {}) {
  const catalog = new Map(all.filter(agent => agent?.id && !agent.sidebarArchived).map(agent => [agent.id, agent]));
  const parentById = new Map();
  for (const agent of catalog.values()) {
    const parent = catalog.get(agent.sessionHierarchy?.parentId);
    if (parent && parent.projectId === agent.projectId && parent.id !== agent.id) parentById.set(agent.id, parent.id);
  }
  for (const id of [...parentById.keys()]) {
    const seen = new Set([id]);
    let parent = parentById.get(id);
    while (parent) {
      if (seen.has(parent)) { parentById.delete(id); break; }
      seen.add(parent); parent = parentById.get(parent);
    }
  }
  const descendants = new Map();
  for (const agent of catalog.values()) {
    const parent = parentById.get(agent.id);
    if (!parent) continue;
    if (!descendants.has(parent)) descendants.set(parent, []);
    descendants.get(parent).push(agent);
  }
  const included = new Set(visible.filter(agent => catalog.has(agent.id)).map(agent => agent.id));
  for (const id of [...included]) {
    let parent = parentById.get(id);
    while (parent && !included.has(parent)) { included.add(parent); parent = parentById.get(parent); }
  }
  const showInactive = id => {
    while (id) {
      const value = catalog.get(id)?.sidebarShowInactiveChildren;
      if (typeof value === 'boolean') return value;
      id = parentById.get(id);
    }
    return false;
  };
  if (includeDescendants) {
    const pending = [...included], visited = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      if (!showInactive(id)) continue;
      for (const child of descendants.get(id) || []) { included.add(child.id); pending.push(child.id); }
    }
  }
  const agents = [...catalog.values()].filter(agent => included.has(agent.id));
  const roots = [], children = new Map();
  for (const agent of agents) {
    const parent = parentById.get(agent.id);
    if (!parent || !included.has(parent)) { roots.push(agent); continue; }
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(agent);
  }
  return { roots, children, agents, parentById };
}
