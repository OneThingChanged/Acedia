---
type: Review
title: Terminal launch and configuration review
description: "Review findings, refactoring boundaries, and regression evidence for terminal startup and managed account settings."
status: stable
last_updated: 2026-09-12
sources:
  - resource: ../app/electron/services/terminal-launcher.mjs
    title: Terminal launch preparation
  - resource: ../app/electron/services/terminal-session-service.mjs
    title: Terminal session lifetime
  - resource: ../app/electron/services/hook-service.mjs
    title: Managed configuration updates
  - resource: ../app/electron/services/terminal-launcher.test.mjs
    title: Startup and cancellation regression tests
  - resource: ../app/electron/services/hook-config-write.test.mjs
    title: Configuration preservation regression tests
---

# Terminal launch and configuration review

## Scope

This review follows local and SSH session startup, selected account configuration,
MCP readiness, native process creation and terminal teardown. The main process
previously implemented these steps together in `spawnPty`. Renderer layout,
browser automation, Git operations and release channels are outside this change.

## Findings and fixes

| Priority | Reproduction | Previous behavior | Corrected behavior |
| --- | --- | --- | --- |
| High | Reading an existing account or project configuration rejects with `EACCES` | Every read error became an empty input, allowing the merge to replace existing settings | Only `ENOENT` becomes empty input; other read errors stop the update and preserve the file |
| High | Claude or Qwen JSON is incomplete, or the MCP document is an array | The parser replaced invalid input with an empty object and rewrote the file | Reject invalid JSON or a non-object document and identify the affected path; validate all inputs before writing any file in that update |
| Medium | SSH extra options contain an unclosed quote | Argument parsing threw after reserving a reverse port, leaving it reserved | Preparation releases its reservation on every error; successful sessions transfer cleanup to terminal teardown |
| Medium | Full shutdown occurs while broker or account setup is pending | `closeAll` invalidated only registered PTYs; a pending launch could subsequently create a process | Full teardown also invalidates pending generations, which the launcher checks before process creation |

The regression cases were run against the extracted original logic before the
fixes and reproduced the configuration, port and shutdown failures. All tests
use temporary configurations or fake processes; they do not sign in or send
requests to model providers.

## Refactoring boundaries

- `main.mjs` connects the launcher to the native PTY, browser broker, account
  registries and SSH port allocator.
- `terminal-launcher.mjs` prepares commands and account environments, checks
  cancellation and registers the native process. The existing delayed initial
  command, color environment, account home and SSH password behavior remain
  covered by tests.
- `TerminalSessionService` owns process lifetime and launch generations.
  Callers use `isSpawnCurrent` rather than inspecting its generation map.
- `HookService` uses one merge queue for project and account-home settings.
  Input validation happens before writes; a failure does not poison later
  queued updates. This does not make multiple file writes one transaction or
  coordinate writes from unrelated external processes.
- The account-selection helper is shared by launch and transcript lookup.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 645 tests in 108 files passed, including 24 new regression and launch-boundary cases |
| `npm run build` | TypeScript and Vite passed; 607 modules transformed |
| `npm run electron:bridge-smoke` | Browser integration, saved-command PTY, idle recovery, native account management for both providers and document reuse passed |
| `npm run electron:lifecycle-smoke` | Source close, tray/workspace and security checks passed |
| `npm run electron:advanced-launch-smoke` | UI, cross-window synchronization, reload, native PTY and command-shim argument delivery passed |
| `git diff --check` | Passed |

The build retains the existing large-chunk warning. During bridge teardown,
the ConPTY helper logged `AttachConsole failed`; the native verification
markers completed and the runner exited successfully. This review does not
claim to resolve that separate teardown diagnostic. No release package was
built, and live provider authentication was not exercised.

## Follow-up candidates

The main process still owns substantial browser and Git implementation, and
`App.tsx` and `SettingsModal.tsx` retain broad UI responsibilities. Future
refactoring should follow those capability boundaries and their existing smoke
tests. Their size is a maintainability concern, not evidence of a runtime defect.

The source commit advances the product version and Android source versionName
to `1.8.1.4`; npm remains `1.8.1`. No APK is rebuilt, so Android versionCode
remains unchanged. This commit does not publish a release.
