import { accountLoginError } from './account-login.mjs';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { terminateWindowsProcessTree } from './process-tree.mjs';

// Account-only client. No thread, turn, tool execution or project configuration.
export class AccountPoolRpc extends EventEmitter {
  constructor(command, env, home) {
    super();
    this.pending = new Map(); this.sequence = 0; this.buffer = ''; this.closed = false;
    this.child = spawn(command.file, command.args, { env, cwd: home, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      if (this.buffer.length > 1024 * 1024) return this.close();
      let end;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        let message; try { message = JSON.parse(line); } catch { continue; }
        const pending = this.pending.get(message.id);
        if (pending && !message.method) {
          this.pending.delete(message.id); clearTimeout(pending.timer);
          if (message.error) pending.reject(Object.assign(new Error(accountLoginError(message.error)), { status: 400 }));
          else pending.resolve(message.result);
        } else if (message.method && message.id == null) this.emit('notification', message);
      }
    });
    this.child.on('error', () => this.close());
    this.child.on('exit', () => this.close());
    this.child.stdin.on('error', () => this.close());
  }
  send(value) { if (this.closed) throw new Error('계정 연결이 종료되었습니다.'); this.child.stdin.write(JSON.stringify(value) + '\n'); }
  call(method, params = {}, timeout = 30000) {
    if (this.closed) return Promise.reject(new Error('계정 연결이 종료되었습니다.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('계정 요청 시간이 초과되었습니다.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('계정 연결이 종료되었습니다.')); }
    });
  }
  async initialize() {
    await this.call('initialize', { clientInfo: { name: 'acedia_account_pool', title: 'Acedia Accounts', version: '1.0.0' } });
    this.send({ method: 'initialized' });
    return this;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('계정 연결이 종료되었습니다.')); }
    this.pending.clear();
    try { this.child.stdin.end(); } catch {}
    if (this.child.pid && this.child.exitCode == null) {
      try { if (process.platform !== 'win32' || !terminateWindowsProcessTree(this.child.pid)) this.child.kill(); } catch {}
    }
    this.emit('closed');
  }
}
