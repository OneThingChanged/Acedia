import path from 'node:path';
import { PreferencesStore } from './preferences-store.mjs';
export function idlePreferences(directory) {
  return new PreferencesStore(path.join(directory,'idle-sessions.json'), {revision:0,enabled:false,minutes:30}, value => {
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.enabled !== 'boolean' || ![5,15,30,60,120].includes(value.minutes)) throw Error('Invalid idle session settings');
    return {revision:value.revision,enabled:value.enabled,minutes:value.minutes};
  });
}
export class IdleSessionPolicy {
  constructor({settings,sessions,hooks,isOwner,isVisible,resolve,suspend,now=Date.now}) { Object.assign(this,{settings,sessions,hooks,isOwner,isVisible,resolve,suspend,now}); this.pending=new Set(); }
  candidate(id,owner) {
    const settings=this.settings.get(), entry=this.sessions.get(id), hook=this.hooks.get(id);
    if (!settings.enabled || !entry || entry.ssh || !['codex','claude'].includes(entry.aiToolId) || entry.initTimer || !this.isOwner(id,owner) || this.isVisible(id,owner) || entry.subscribers.size) return null;
    if (hook?.event !== 'done' || !hook.session_id || !hook.lastTs || hook.lastTs < entry.startedAt) return null;
    const touched=Math.max(hook.lastTs,entry.lastInputAt || 0,entry.lastOutputAt || 0,entry.lastViewedAt || 0,entry.startedAt || 0);
    if (this.now()-touched < settings.minutes*60_000) return null;
    return {entry,hook,revision:settings.revision,touched};
  }
  async trySuspend(id,owner) {
    if (this.pending.has(id)) return null;
    const before=this.candidate(id,owner); if(!before) return null;
    this.pending.add(id);
    try {
      const sessionId=await this.resolve(before.entry,before.hook.session_id);
      if (sessionId !== before.hook.session_id) return null;
      // Transcript lookup can take time. Recheck visibility, work, I/O, settings,
      // ownership and process generation immediately before releasing the PTY.
      const after=this.candidate(id,owner);
      if (!after || after.entry!==before.entry || after.hook!==before.hook || after.revision!==before.revision || after.touched!==before.touched) return null;
      if (!this.suspend(id)) return null;
      return {id,sessionId};
    } finally { this.pending.delete(id); }
  }
}
