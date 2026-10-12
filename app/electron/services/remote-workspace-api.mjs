import { sendJson } from './remote-http.mjs';

const routes = new Set(['/api/chat/images', '/api/session/defaults', '/api/session/close']);
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sessionId = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f]/.test(value)) throw fail('Invalid session id');
  return value.trim();
};
export function remoteSubmitOptions(body) {
  if (body.steering != null && typeof body.steering !== 'boolean') throw fail('Invalid steering option');
  return { steering: body.steering === true, ...(body.sessionId != null ? { sessionId: sessionId(body.sessionId) } : {}) };
}

// Both callers have already authenticated the request. Keep origin, size and
// session membership checks identical across Dashboard and Remote.
export async function serveRemoteWorkspaceApi(request, response, url, { providers, snapshot, allowed, readJson }) {
  if (!routes.has(url.pathname)) return false;
  try {
    const mutation = request.method === 'POST';
    if (!['GET', 'POST'].includes(request.method) || (url.pathname === '/api/chat/images' && mutation)
      || (url.pathname === '/api/session/close' && !mutation)) throw fail('Method not allowed', 405);
    if (mutation && !allowed()) throw fail('Cross-origin request blocked', 403);
    if (mutation && !String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw fail('application/json required', 415);
    const body = mutation ? await readJson(request, 16 * 1024) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Invalid JSON object');
    if (url.pathname === '/api/session/defaults') {
      const provider = mutation ? body.provider : url.searchParams.get('provider');
      if (!['codex', 'claude'].includes(provider)) throw fail('Unsupported model provider');
      if (mutation && (!Number.isSafeInteger(body.revision) || body.revision < 0 || !body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings))) throw fail('Invalid default model settings');
      if (!providers.modelDefaults) throw fail('Default model settings unavailable', 501);
      const result = mutation ? await providers.modelDefaults.save(body) : await providers.modelDefaults.read(provider);
      sendJson(response, 200, { ok: true, ...result });
    } else {
      const id = sessionId(mutation ? body.id : url.searchParams.get('id'));
      const state = snapshot();
      const agents = [...(state.agents || []), ...(state.view?.agents || [])];
      if (!agents.some(agent => agent.id === id)) throw fail('Session not found', 404);
      if (mutation) {
        if (!providers.closeSession) throw fail('Session close unavailable', 501);
        if (await providers.closeSession(id) === false) throw fail('Session could not be closed', 409);
        sendJson(response, 200, { ok: true });
      } else {
        const sequence = Number(url.searchParams.get('sequence'));
        if (!Number.isSafeInteger(sequence) || sequence <= 0) throw fail('Invalid image sequence');
        const images = (await providers.chatImages?.(id, sequence) || []).slice(0, 20);
        // Large bitmaps are requested once per block, never included in state
        // polling. The host reader binds the sequence to this agent's transcript.
        sendJson(response, 200, { images });
      }
    }
  } catch (error) {
    const status = error.statusCode || (error instanceof SyntaxError ? 400 : error.message === 'request too large' ? 413 : 500);
    sendJson(response, status, { error: error.message || 'Workspace request failed' });
  }
  return true;
}
