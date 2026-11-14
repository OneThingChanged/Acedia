# Codex routing account changes

Check `acedia_connection` for routing support, then call
`acedia_session_routing` with the exact Acedia sessionId to read accounts,
preferredAccountId, runningMode/runningAccountId and global enabled state.
This operation covers local Codex pool accounts, not Claude or direct login.

For a user-authorized change, choose an available account by returned ID and
send accountId plus the observed preferredAccountId as expectedAccountId.
Use accountId:null to clear the session pin. Names are labels, not account IDs.
An exhausted, excluded or unauthenticated account is not an available target.

`saved:true` confirms durable next-start settings. It does not move a live
request or turn on global routing. Keep the original conversation, model,
effort, Fast and permission settings. When global enabled is false, disclose
that routing will remain off; do not silently change global preferences.

If immediate interruption and restart were requested, stop only the authorized
running targets, start the same IDs, then verify readiness and the actual
running account. Send an authorized continuation once through the UTF-8 inbox
and check receipt/start separately. Leave other sleeping sessions inactive.

On 409 re-read account/settings state. After timeout re-read the saved pin
before retrying. Never rewrite live profile files or use UI automation to
silently work around an unsupported API.
