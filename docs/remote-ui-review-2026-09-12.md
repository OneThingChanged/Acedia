---
type: Verification Record
title: Remote UI review — 1.8.1.6
description: "Normal-zoom readability, desktop language synchronization and source verification for Remote and Local Dashboard."
status: stable
sources:
  - resource: ../app/electron/remote-pwa/styles.css
    title: Shared browser typography and layout
  - resource: ../app/electron/remote-pwa/i18n.js
    title: Display-language handling and locale formatting
  - resource: ../app/src/App.tsx
    title: Coordinator language synchronization
  - resource: ../app/electron/services/web-services.mjs
    title: Dashboard and Remote endpoints
  - resource: ../app/scripts/electron-remote-pwa-smoke.mjs
    title: Isolated browser runtime verification
  - resource: ../app/package.json
    title: Product version and validation commands
---

# Remote UI review — 1.8.1.6

At 100% browser zoom, much of the Remote UI used 8–12px text. It also displayed
hardcoded Korean even when the desktop app used English. The shared Remote and
Local Dashboard client now uses larger text and controls, and receives the
resolved desktop language through ordinary state synchronization.

## Resulting behavior

* Body/control text is generally 14–16px; captions and chart labels are at least
  12px. Usage controls are 40px or taller, increasing to 44px on mobile.
* Usage cards and period selectors adapt to the available width. The chart keeps
  readable date labels, and token totals remain visible without page overflow.
* Open pages follow desktop language changes without reloading. Dates, compact
  token totals and reset times use the selected locale; the sign-in page also
  receives this setting.
* Korean and English messages are explicit. The other four supported locales use
  available translations with English fallback. This does not claim complete
  translation coverage for every message in those four locales.
* Names, conversation/document content and provider output retain their original
  text. Composer drafts survive language changes.

The durable behavior and module boundaries are documented in
[Remote service](remote-service.md) and [Local Dashboard](local-dashboard.md).

## Verification on 2026-09-12

Commands below run from `app/`.

| Check | Result |
| --- | --- |
| `npm test -- --maxWorkers=4 --testTimeout=15000` | 661 tests in 111 files passed |
| `npm run build` | TypeScript and the production frontend build passed |
| `npm run electron:remote-pwa-smoke` | Passed at 1920, 1280 and 390px |
| Usage rendering | Populated local history, quota cards, captions ≥12px, controls ≥40px and no page overflow |
| Language behavior | Six resolved locale settings, Korean/English transitions, localized dates, English sign-in and preserved drafts/content |
| Existing browser actions | Chat, document preview, module loading, service-worker activation and account visibility passed |

The full suite initially exceeded its default five-second limit in a Windows
report-validation fixture that invokes PowerShell four times. The unchanged
fixture passed separately, and the full suite then passed with a 15-second test
limit. No production timeout was changed.

The browser checks use an isolated service and synthetic usage records. They do
not prove live external authentication, public-tunnel operation or installation
in an Android WebView. A native Chromium widget diagnostic appeared during
navigation; the renderer assertions and all smoke checks completed successfully.

## Source version and delivery state

Product metadata, installer naming and Android source versionName are 1.8.1.6.
npm versions remain 1.8.1. No APK was rebuilt, so its generated native version and
versionCode are unchanged. This record covers the source commit; installation
packages, remote publication and installed-app verification are separate steps.
