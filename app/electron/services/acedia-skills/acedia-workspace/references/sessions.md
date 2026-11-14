# Session operations

1. Read `acedia_projects` and identify the exact project and Acedia session ID.
   Preserve the chosen provider, existing conversation and dedicated folder.
2. For a new child with a first task, prefer `acedia_session_run` with a stable
   requestKey, explicit project/folder when needed, and the requested provider.
   For registration only use `acedia_session_create` with `start:false`.
3. Start an existing OFFLINE target with `acedia_session_start`. An active
   target is retained. The background API does not select a pane or focus a
   window. A successful start is not evidence that a prompt was accepted.
4. Read `acedia_session_status` by the Acedia ID, even before its first native
   conversation exists. Inspect phase/reason and input readiness. Bounded
   waitMs may wait for initialization. Trust within the registered folder can
   be handled by the host; login, questions and command approvals remain explicit.

For a user-authorized interruption/restart, use `acedia_session_stop`, then
`acedia_session_start` on the same ID and recheck readiness. Preserve dormant
sessions unless the user requested starting them. Never stop the calling session.

Use `acedia_sessions_organize` for name and parent changes, supplying the observed
expectedName/expectedParentSessionId. Parent changes stay within a project.
Use `acedia_sessions_relocate` for project/folder changes, supplying the observed
expectedProjectId/expectedFolder; targets must be inactive. Relocation changes
registration, not physical directories. Do not stop a working target merely to
make relocation pass unless that interruption is authorized.

`acedia_session_settings` reads/saves Dangerous for supported providers. Changes
need the observed expectedDangerous and apply on next start. A task request
does not by itself authorize changing permission policy.

After a timeout, re-read the exact target before retrying. Inspect any saved
result; a failed acknowledgement does not prove that nothing was persisted.
