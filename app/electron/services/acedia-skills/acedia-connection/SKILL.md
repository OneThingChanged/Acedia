---
name: acedia-connection
description: Check Acedia's installed host version, session connection, supported APIs and managed skills when an Acedia tool appears missing, stale or unavailable. Use for Acedia integration diagnosis, not ordinary coding tasks.
---

# Check the Acedia session connection

Use `acedia_connection` first. It reads the running Acedia host without selecting
a session, changing focus, starting a CLI or submitting input.

- Inspect the host version, caller active/registered state, supported API groups,
  bridge differences and managed skill status. `supported` describes the API;
  `available` describes the calling connection. Neither proves target readiness.
- A host-supported tool absent from your visible tools can require an MCP reload
  or a restart of this CLI. A bridge/host mismatch can require an Acedia update.
  Do not invent API names or conclude that the host lacks a feature from your
  cached tool list alone.
- A skill marked modified is preserved. Report the conflict; do not overwrite
  the user's edits or reinstall unrelated configuration to fix a task failure.
- Verify a receiving session with `acedia_session_status` separately. A WORK,
  Trust, login or question state is not a broken MCP connection.

If `acedia_connection` is not visible, run the bundled read-only helper with
the same Node runtime used by the MCP bridge, resolving it relative to this skill:

```text
node <this-skill-directory>/scripts/check.mjs
```

The helper uses only this Acedia-launched session's inherited runtime identity.
Missing environment means the CLI must be launched from Acedia. Authentication
failure means the runtime may be stale. Do not print credentials, copy another
session's identity, scan profiles for tokens or silently restart working sessions.
Report what was verified and the specific reload/update needed. Diagnosis does
not authorize a restart or other mutation.
