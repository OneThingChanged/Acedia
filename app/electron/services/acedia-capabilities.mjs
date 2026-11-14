export const ACEDIA_CAPABILITIES_VERSION = 1;

// These are supported API operations, not a claim that a target is ready or
// that any action is authorized. Keep parity with the bridge's tools/list.
const groups = {
  connection: { tools: ['acedia_connection'], services: [] },
  workspace: { tools: ['acedia_projects', 'acedia_project_create', 'acedia_session_create'], services: ['create'] },
  sessions: { tools: ['acedia_session_start'], services: ['sessionStart'] },
  readiness: { tools: ['acedia_session_status'], services: ['readiness'] },
  organization: { tools: ['acedia_session_stop', 'acedia_sessions_organize'], services: ['registry'] },
  relocation: { tools: ['acedia_sessions_relocate'], services: ['relocation'] },
  permissions: { tools: ['acedia_session_settings'], services: ['sessionSettings'] },
  routing: { tools: ['acedia_session_routing'], services: ['sessionRouting'] },
  messages: { tools: ['acedia_session_message_send', 'acedia_session_message_receive'], services: ['messages'] },
  delivery: { tools: ['acedia_session_send', 'acedia_session_delivery'], services: ['deliveries'] },
  childRuns: { tools: ['acedia_session_run', 'acedia_session_run_status'], services: ['runs'] },
  tasks: { tools: ['acedia_task_plan', 'acedia_task_list', 'acedia_task_get', 'acedia_task_wait', 'acedia_task_result', 'acedia_task_control'], services: ['tasks'] },
  browser: { tools: ['browser_tabs', 'browser_open', 'browser_show', 'browser_navigate', 'browser_snapshot', 'browser_screenshot',
    'browser_click', 'browser_type', 'browser_upload_files', 'browser_get_control', 'browser_form_state', 'browser_set_checked',
    'browser_select_option', 'browser_clear', 'browser_scroll_into_view', 'browser_wait_for', 'browser_back', 'browser_forward',
    'browser_reload', 'browser_attach_annotation'], services: ['browser'] },
  pageCollection: { tools: ['browser_collect_page', 'browser_capture_asset', 'browser_collection_get'], services: ['browser'] },
};

export function acediaCapabilities({ services, host, caller, skills = null }) {
  const features = Object.fromEntries(Object.entries(groups).map(([name, group]) => {
    const supported = group.services.every(service => Boolean(services[service]));
    const available = supported && (name === 'connection' || caller.active);
    return [name, { supported, available, tools: [...group.tools],
      reason: !supported ? 'service-unavailable' : !available ? caller.registered ? 'caller-inactive' : 'caller-unregistered' : null }];
  }));
  return { ok: true, connected: true, schemaVersion: ACEDIA_CAPABILITIES_VERSION,
    status: caller.active ? 'ready' : caller.registered ? 'caller-inactive' : 'caller-unregistered',
    host: { name: 'Acedia', version: host.version || null, apiVersion: 1, pid: process.pid },
    caller: { sessionId: caller.sessionId || null, registered: caller.registered === true, active: caller.active === true, aiToolId: caller.aiToolId || null },
    features, tools: Object.values(features).filter(group => group.supported).flatMap(group => group.tools), skills };
}
