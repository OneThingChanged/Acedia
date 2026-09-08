---
okf_version: "0.2"
---

# MultiAgent knowledge

`docs/` is the canonical OKF v0.2 knowledge bundle for MultiAgent. Each linked
document covers one durable concept and points to the implementation or
configuration that supports it.

## Product and architecture

* [Product overview](product-overview.md) - Product goals, runtime shape, capabilities, and variants.
* [System architecture](system-architecture.md) - Electron boundaries, workspace model, layout invariants, and IPC rules.
* [Workspace interactions](workspace-interactions.md) - Navigation, sessions, panes, documents, source control, and notifications.

## Sessions and integrations

* [Codex account profiles](codex-accounts.md) - Independent local logins, session account selection, and account-scoped recovery and quotas.
* [Session lifecycle and resume](session-lifecycle-and-resume.md) - PTY startup, hooks, cancellation, shutdown, and provider resume.
* [Local Dashboard](local-dashboard.md) - Loopback monitoring, terminal, document, and usage surfaces.
* [MiraControl integration](miracontrol-integration.md) - Authenticated session state, activation, and guarded input API.
* [Remote service](remote-service.md) - External Remote/PWA/Android access, authentication boundary, and conversation UX prototype.
* [Usage accounting](usage-accounting.md) - Local token indexing, historical aggregation, and account limits.
* [Embedded browser MCP](embedded-browser-mcp.md) - Always-on shared browser tabs, managed MCP startup, annotations, and isolation rules.
* [Embedded browser form automation plan](browser-form-automation-plan.md) - Implemented state-aware targeting and safe form controls, with remaining hardening and rollout tests.

## Delivery and maintenance

* [Development and build](development-and-build.md) - Local setup, tests, smoke checks, and desktop/mobile build entry points.
* [Release playbook](release-playbook.md) - Signing, artifact verification, publication, and updater invariants.
* [Store 자동 배포 실행기](store-release-automation.md) - One-request Store release scope, Windows credential/task setup, isolated builds, API submission and recovery.
* [Acedia 1.8.1.0 Store 테스트 배포](store-release-1-8-1-0-2026-09-08.md) - Settings/language MSIX validated and submitted through Partner Center UI; Submission 5 in certification, automatic publishing after approval.
* [Acedia 1.8.x release handoff](acedia-release-handoff-2026-09-08.md) - Current Partner Center draft, completed 1.8.0.0 release, unfinished language/settings work, and the exact next-session starting procedure.
* [Microsoft Store 배포 운영 가이드](microsoft-store-release-guide.md) - Store MSIX 빌드, WACK, Partner Center 제출, 공개, 인증 대응 및 업데이트 절차.
* [Microsoft Store MSIX delivery and certification record](microsoft-store-msix-plan.md) - Private pilot and public-update implementation history, validation evidence, certification status, and rollout decisions.
* [Known limitations](known-limitations.md) - Confirmed constraints and explicitly unverified follow-up items.
