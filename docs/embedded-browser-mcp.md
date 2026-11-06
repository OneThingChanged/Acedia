---
type: Interface
title: Embedded browser MCP
description: "Always-on shared browser tabs, managed MCP startup, state-aware form automation, element annotations, and security boundaries."
tags:
  - browser
  - mcp
  - security
status: stable
stale_after: 2026-12-07
sources:
  - id: browser-server
    resource: ../app/electron/services/browser-mcp-server.mjs
    title: "Managed browser MCP server"
  - id: browser-context
    resource: ../app/electron/services/browser-context.mjs
    title: "Snapshot and annotation sanitization"
  - id: browser-page-collection
    resource: ../app/electron/services/browser-page-collection.mjs
    title: "Rendered DOM, native page archives and original image resources"
  - id: browser-form-automation
    resource: ../app/electron/services/browser-form-automation.mjs
    title: "Semantic form targeting and verified browser actions"
  - id: browser-file-upload
    resource: ../app/electron/services/browser-file-upload.mjs
    title: "Explicit native browser file selection"
  - id: browser-form-smoke
    resource: ../app/scripts/electron-browser-form-smoke.mjs
    title: "Fixture-driven Electron browser form smoke"
  - id: browser-activity
    resource: ../app/electron/services/browser-activity.mjs
    title: "Local download and visit history"
  - id: browser-activity-panel
    resource: ../app/src/components/BrowserActivityPanel.tsx
    title: "Download and history management panel"
  - id: browser-download-smoke
    resource: ../app/scripts/electron-browser-download-smoke.mjs
    title: "Real Electron download and persistence smoke"
  - id: browser-ui
    resource: ../app/src/components/EmbeddedDocumentBrowser.tsx
    title: "Embedded browser toolbar and selection UI"
  - id: browser-tabs-ui
    resource: ../app/src/components/PaneSlot.tsx
    title: "Pane browser tabs and reveal UI"
  - id: browser-hub-ui
    resource: ../app/src/components/BrowserHub.tsx
    title: "Application-wide browser tab hub"
  - id: sidebar
    resource: ../app/src/components/Sidebar.tsx
    title: "Global browser hub entry"
  - id: annotation-preload
    resource: ../app/electron/browser-annotation-preload.cjs
    title: "Isolated annotation preload"
  - id: preview-service
    resource: ../app/electron/services/document-preview-service.mjs
    title: "Project-scoped HTML preview service"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Native browser ownership and integration routes"
  - id: image-viewer
    resource: ../app/src/components/ImageViewer.tsx
    title: "Image viewer native-view occlusion"
  - id: native-view-occlusion
    resource: ../app/src/lib/nativeViewOcclusion.ts
    title: "Renderer overlay blockers for native views"
---

# Embedded browser MCP

MultiAgent owns application-local browser profiles with multiple native tabs.
The existing default profile keeps its original cookie storage. Additional profiles
have separate persistent partitions; tabs within a profile share cookies, while
Chrome and Edge retain separate data. A hidden host and blank tab start before
restored agent sessions, and browser views disable background throttling. Closing
visible workspaces leaves these browser sessions alive with the tray process.
Agents share the tab catalog and select by stable browser ID. Catalog entries
include profile ID/name, and opening a tab can select a configured profile.
Profiles isolate site logins; they do not restrict which tabs an agent can control.
See [browser settings and restart behavior](browser-preferences.md).[^electron-main]

Every pane tab strip exposes a `+` action that creates a new embedded browser
tab at the configured home page. See [browser preferences](browser-preferences.md). Browser tabs participate in the same split, move, select, and
close operations as session and document tabs. Inactive browser views remain
alive but hidden, so switching tabs preserves navigation state without allowing
the native view to cover the selected pane. Each mounted pane reports its own
visibility and bounds, so two browser tabs selected in different split panes stay
visible and interactive simultaneously. Activating one browser does not hide the
sibling pane's native view. A temporary React unmount during
pane movement or layout reconciliation does not own the native view lifetime;
only explicitly closing the browser tab destroys that view. This prevents a
visible tab shell from outliving its Electron `WebContentsView`.[^browser-ui][^browser-tabs-ui][^electron-main]

The fixed Browser Hub entry at the top of the left sidebar shows the number of
application-owned browser tabs. It switches the center workspace into a global
tab strip backed by the main process catalog, including tabs parked on the
hidden host or associated with another session. Selecting a tab reparents that
same `WebContentsView` into the current workspace instead of cloning its page or
profile; `+` creates a shared tab and `×` closes it globally, including the
corresponding web or HTML document tab in its original session pane. The
integration bootstrap's unused `about:blank` tab is omitted until an agent
actually claims or navigates it. Returning to a session, Screen, project document, or Git view
unmounts the Hub host and hides its native view while preserving page state.[^browser-hub-ui][^sidebar][^electron-main]

Local HTML previews keep the same filename and orange `HTML` badge in the Hub
that they use in a session pane. Ordinary web pages use the blue `WEB` badge and
their page title or hostname.[^browser-hub-ui]

HTML document previews are keyed by workspace and project-relative source path.
Renderer remounts—including React development Strict Mode's repeated effect
cycle and a round trip through the Browser Hub—reattach the existing native
view. They do not create another catalog tab. When a pre-keyed legacy renderer
has already leaked identical preview views, the next document open preserves
the currently attached view and destroys the duplicates.[^browser-ui][^electron-main]

Electron native browser views render above normal React layers. When the image
viewer or Settings opens, it acquires a shared native-view blocker; every
embedded browser temporarily hides its `WebContentsView` and restores only the
active tab after the overlay closes. Main-process visibility state also
prevents a delayed bounds update from exposing a blocked browser again.[^image-viewer][^native-view-occlusion][^electron-main]

## Managed MCP connection

The same managed connection also exposes local project registration and session
creation tools. See [Workspace MCP](workspace-mcp.md) for the tool schemas,
acknowledgement behavior, and restart requirements.

The `multiagent-browser` MCP process uses newline-delimited JSON-RPC over stdio.
The PTY environment supplies its loopback integration port, bearer token,
associated agent ID, and script path. The MCP process opens no independent
network listener.[^browser-server]

Codex project configuration explicitly whitelists `MULTIAGENT_AGENT_ID`,
`MULTIAGENT_PORT`, `MULTIAGENT_TOKEN`, and `MULTIAGENT_MCP_SCRIPT` for the MCP
stdio child. The managed Codex entry remains disabled in the persisted project
configuration because the same file can be loaded by Codex outside Acedia,
where those runtime variables do not exist. Before launch, Acedia installs the
same complete dormant transport in the selected Codex account home. This is
required because a separate account uses its own `CODEX_HOME` and may not load
the working folder's project configuration. Acedia then enables the entry with
a per-launch Codex override only after both the hidden browser and authenticated
loopback broker are ready. The stdio MCP child itself is still created by the
CLI at CLI startup; the browser and broker are the app-lifetime services that
must already be ready.[^electron-main]

The fixed tools are:

* `browser_tabs`, `browser_open`, `browser_show`, and `browser_navigate`;
* `browser_snapshot` and `browser_screenshot`;
* `browser_collect_page`, `browser_capture_asset`, and `browser_collection_get`;
* `browser_click` and `browser_type`;
* `browser_upload_files`;
* `browser_get_control` and `browser_form_state`;
* `browser_set_checked`, `browser_select_option`, and `browser_clear`;
* `browser_scroll_into_view` and `browser_wait_for`;
* `browser_back`, `browser_forward`, and `browser_reload`;
* `browser_attach_annotation`.[^browser-server]

Arbitrary page JavaScript is intentionally not exposed as a tool.

### Rendered-page collection (2026-11-07 source)

These tools run against the selected existing embedded tab and its Chromium
session. They never call `show()`/`focus()`, reveal a sidebar, copy another
browser's cookies, or navigate to an unrelated HTTP download client. Use
`browser_tabs` to reuse the correct profile/tab. If it does not exist, use
`browser_open` and wait for the catalog to report loading finished; opening may
time out while the tab itself survives. Check the catalog before creating another.

```json
{"name":"browser_collect_page","arguments":{"tabId":"<existing-tab-id>","selector":".Post-RichText","expandCode":true,"maxImages":12}}
```

| Tool | Behavior |
| --- | --- |
| `browser_collect_page` | Read article text/HTML, save a viewport PNG, scroll for lazy images, restore the initial scroll, save Chromium HTMLComplete/MHTML, extract original image bytes, and return local artifact metadata. |
| `browser_capture_asset` | Retry one image referenced by the rendered tab through `webContents.session.fetch`, retaining browser cookies and a document Referer. Accepts `img` source/original attributes and derived Zhihu GIF URLs; rejects unrelated URLs, nonimage responses, resources over 16 MiB, and network requests exceeding 10 seconds. |
| `browser_collection_get` | Read the saved collection by returned `id` as `collectionId`, with the same `tabId`. Page image metadata without scrolling, downloading, or capturing again. |

`selector` must match exactly one content root. Without one, selection prefers
`.Post-RichText`, `.Post-RichTextContainer`, article RichText, article, main, then
body. Review the selected root: a generic main/body fallback can contain site UI.
The article text/scoped HTML exclude surrounding site UI when the chosen root
does. Full-page DOM/native archives intentionally preserve the complete page.
`expandCode` defaults to false and only clicks recognized code-expansion buttons
inside the content root, adjacent to `pre`/`code`. Other approvals/login controls
are not clicked. Remaining recognized expanders make the result incomplete.

Each call creates an immutable UUID directory below
`<userData>/browser-collections/<tabId>/`:

| File | Meaning |
| --- | --- |
| `index.html` | Full rendered DOM before code expansion/scrolling; untouched by subsequent conversion. |
| `expanded.html` | DOM after optional code expansion and lazy-image scrolling. |
| `article.html`, `content.txt` | Scoped article HTML and full collected text, including code, lists, tables, links and captions. |
| `viewport.png` | Current visible viewport after scroll restoration, rather than a full-page stitched screenshot. |
| `page.mhtml`, `page.html` and companion files | Chromium's native archives of the rendered page. |
| `image-*.ext`, `inline-*.ext`, `asset-*.ext` | Original resource bytes from MHTML, inline base64 or the same-session browser network, without image recompression. |
| `asset-map.json` | Exact source image URLs to absolute saved file paths. Used as a staging map, not as a Wiki public URL map. |
| `manifest.json` | Paths, MIME/bytes/SHA-256, all image entries/missing indices, structure counts, expansion status, warnings and completion scope. |

HTML means the rendered DOM, **not the original HTTP response bytes**. Browser
HTMLComplete/MHTML may rewrite resource URLs; `index.html`/`expanded.html` retain
the DOM attributes needed by a downstream converter. Zhihu `ztext-gif` or
`data-actualtype="gif"` thumbnails require the original GIF; a JPG/PNG thumbnail
alone is incomplete. Network GIF responses also require a GIF byte signature.

`ok:true` means the capture operation produced a report. **Require
`complete:true` before accepting collection**, and still compare the selected
body/structure with the page. Missing images, site access blocks, unverified
short fallback pages, scroll/HTML/text limits, unexpanded code, screenshot or
archive/inventory failures produce `complete:false` with explicit warnings.
`saveArchive:false` returns lightweight text/DOM/screen evidence and never claims
complete preservation. Separate asset retries do not rewrite a prior manifest;
recollect to produce a newly verified collection.

Limits: 60 scroll steps by default, maximum 100/15 seconds; 1,000 image entries;
3 million characters each for text/DOM HTML; 8 MiB inline image data; 64 MiB MHTML
decoding; 4,000 files/256 MiB for the hashed inventory. Missing-image browser
fallbacks share a 20-second/40-request budget. Limits are reported as partial
results, never silently counted as a complete article. A per-tab lock rejects
concurrent captures, and navigation during collection aborts it. MCP gives the
collection request 90 seconds; a currently loading tab must finish first.

`maxText` (1,000–60,000, default 24,000) bounds the returned text, while
`content.txt` keeps all collected text up to the explicit collection limit.
`returnedTextTruncated` is distinct from incomplete saved text. `maxImages`
(1–40, default 12) and `imageOffset` bound the returned metadata; the full list
is in `manifest.json`. Read another page with:

```json
{"name":"browser_collection_get","arguments":{"tabId":"<same-tab-id>","collectionId":"<returned-id>","imageOffset":12,"maxImages":12}}
```

The authenticated HTTP equivalents are POST
`/integration/v1/browser/<agentId>/collect-page`, `/capture-asset`, and
`/collection-get`. They use the same JSON fields and host authorization as other
browser tools. Collection IDs are UUIDs scoped to the tab's archive directory;
callers cannot provide arbitrary output paths. Standalone asset files are placed
under that tab's `assets/` directory.

Raw HTML and the on-disk asset map may contain page scripts, signed asset URLs
and page-specific data. They remain local, are not executed or automatically
uploaded, and must be treated as untrusted source material. MCP returns bounded
text and sanitized URL metadata rather than embedding raw HTML, cookies, image
base64 or authorization material in conversation history.

#### Sub5torage Wiki handoff

The `Sub5torage_wiki` session was checked by title/project/date, then its
requirements were confirmed against
`G:/AI/03_Development/GitHub/Sub5torage/Tools/WikiCapture/docs/CAPTURE_CONVERSION_WORKFLOW.md`
and `COLLECTION_SESSION_HANDOFF.md`. Its workflow requires full body structures,
images/captions and GIF originals, with surrounding UI excluded and the original
snapshot kept separate from conversion/translation. Text-only MCP snapshots do
not satisfy it.

After `complete:true` and body review, the consumer copies the original and
expanded DOM to its required
`Tools/WikiCapture/data/<Topic>/source/<source-id>/_capture/original/index.html`
and `_capture/original-expanded/index.html`, and copies image bytes to
`Assets/images/`. Preserve the Acedia manifest/hashes alongside them. Rewrite the
staging asset map's values to the consumer's served paths, for example
`/output/wiki/<Topic>/source/<source-id>/Assets/images/<name>`, before passing it
to `wiki_snapshot_to_local.mjs --snapshot <expanded-snapshot> --asset-map <map>
--dry-run`. The raw Acedia map contains filesystem paths and must not be used as
public Wiki URLs. Validate structure/image counts and missing assets before
translation or registration. These Acedia tools do not write another project's
files, translate content, register a local Wiki entry or publish a live entry.

Verification: `npm run electron:browser-collection-smoke` uses a hidden isolated
Electron browser and local fixture. It checks lazy-image loading, restored
scroll, separate original/expanded code, tables/lists/links/captions, original
GIF byte hashes, browser-cookie/Referer-protected image retrieval and saved
result paging. `-- --live-zhihu` additionally checks the requested article
`1993816774026736429` in a fresh profile. On 2026-11-07 the existing Acedia
profile successfully read 8,235 characters and captured the rendered screen;
the isolated fresh profile was blocked and correctly reported
`complete:false/page_access_blocked`. This is not evidence that the live article
has been fully archived with the new tools. Updating the Acedia host and
restarting/reconnecting the MCP client is required to expose these new tools;
the running older host was not patched or restarted during testing.
The source was subsequently published in [Acedia 1.8.2.08](release-1-8-2-08.md);
public download verification is separate from updating the currently running app.

### Showing a browser beside chat

Released in [Acedia 1.8.1.70](release-1-8-1-70.md).

`browser_open` always creates a background tab on the hidden browser host. It
does not add a visible pane or select a desktop tab, even if a legacy caller
still supplies placement/reveal hints. Research and automation keep using its
`tabId` in the background. Only an explicit user request to see the page should
call `browser_show`, with an existing `tabId` and `placement: "right"` (the default)
or `"tab"` for a requested visible tab. It connects that same tab without
navigation or creating another browser. Agent
connection requests preserve the user's current Screen, selected pane and tab.
A new browser can be prepared in the owner's inactive Screen without switching
to it. A tab already separated into another pane, Screen or workspace window
keeps its placement; repeated requests do not select it again. A tab sharing the
conversation's leaf moves into a right-hand split once, preserving the selected
conversation. Explicit user opens and Browser Hub/tab clicks still select tabs.
Keep the connected `tabId` for subsequent navigation, snapshots and input rather
than repeating `browser_show` before each action.

Attaching to an inactive Screen keeps a usable hidden viewport until its pane
mounts and supplies the actual bounds. Agent screenshots and input can continue
without exposing a 1px attachment viewport or showing the workspace window.

The bundled `acedia-browser` skill is installed in the selected Codex account's
`skills/` directory before local launch. Requests such as “우측에 브라우저 띄워줘”
use this workflow. Its Python helper supports the authenticated local bridge when
the current CLI has not discovered the MCP tools. The updated app must be running;
installing the skill alone does not add the new show action to an older EXE.

#### Connection selection regression — 2026-10-09

Repeated `show` requests previously selected the browser's Screen and pane,
interrupting work in another session. Integration events now request placement
with `activate: false`; the renderer preserves the selected tab by identity when
inserting a split. Existing visible workspace ownership is retained by the host.
Older bridge events with placement but no activation field also preserve selection.

Validation passed: 75 focused layout/browser/MCP checks, the real App renderer's
initial/repeated connection in another Screen and sibling pane, input focus/draft
continuity, explicit user selection, and existing 800–1920px layout checks.
Real Electron capture retained a hidden 1280×800 viewport after attachment and
repeated connection, with no window show/focus events. TypeScript and production
build passed with the existing large-bundle warning. Tests use isolated profiles
and simulated CLI/IPC; installed-app typing continuity remains a rollout check.
Logs: `output/browser-selection-tests.log`,
`output/browser-selection-workspace-smoke.log`,
`output/browser-selection-background-smoke.log`, `output/browser-selection-build.log`.

#### Background creation by default — 2026-10-09

The Python fallback helper previously added `placement: "right"` to every open
request. Repeated research opens therefore created visible splits. The helper
now sends placement only for `show`; opening always stays on the hidden host.
The host also ignores legacy open placement/reveal hints. MCP `browser_open`
no longer advertises placement, and both the tool descriptions and bundled
skill reserve `browser_show` for an explicit user display request. New-page
display is an open-then-show operation using the returned tab ID.

The browser handler and MCP contract checks passed 24 tests, including legacy
right/tab hints without workspace attachment and an explicit show request.
Result: `output/browser-background-default-tests.log`.

## State-aware form automation

Browser snapshots include a bounded semantic descriptor for each form control:
stable `targetId`, accessible role/name/label context, safe value state,
checkbox/radio selection, native select options, visibility, disabled/readonly
state, required state, and validation results. Password, credential-like, and
file values are redacted before leaving the browser evaluator and are filtered
again by the main-process sanitizer.[^browser-form-automation][^browser-context]

New form actions prefer the semantic `targetId` returned by a snapshot while
retaining CSS selectors for compatibility. Duplicate semantic matches fail
with an ambiguity result instead of silently selecting the first node.
Checkbox, radio, and switch updates are idempotent; native and common ARIA
combobox/listbox selections are verified after framework render turns. Text
fields can be cleared explicitly, and bounded waits can follow visibility,
enabled, checked, selected, validity, text, URL, or navigation-complete state.

All mutating actions return sanitized before/after state and a postcondition.
Native value setters and bubbling input/change events preserve compatibility
with React, Angular, Vue, and ordinary HTML controls. A local Electron fixture
smoke covers native controls, DOM replacement, an ARIA combobox, wait behavior,
and password/file redaction.[^browser-form-smoke]

`browser_upload_files({ tabId, selector, files })` selects explicitly authorized
local files directly in a unique `input[type=file]`. Supply absolute paths on
the desktop host, not paths on a remote CLI machine. Hidden inputs and multiple
selection (up to 20 files, when the input has `multiple`) are supported. Do not
click the OS chooser first. Missing/unreadable files, directories, duplicate
files, ambiguous selectors, disabled inputs, and non-file controls are rejected.
The implementation uses Chromium's native `DOM.setFileInputFiles`, so ordinary
input/change handlers and browser file transport run without loading the whole
file into a tool response. Snapshots still redact file paths and contents.
[^browser-file-upload]

Selection can immediately transmit files; the agent must have user authorization
for the files and destination before calling it. A successful result means
`files_selected`, not server acceptance. Check page progress/errors with a
snapshot or wait afterward. If `applied: true` accompanies an unverifiable result
(for example, the page clears/replaces the input), inspect the page before any
retry. Iframe inputs, directory uploads, drag-only drop zones, and OS dialog
automation are not supported. An already-attached debugger returns a busy result.
Restart the desktop app and the CLI session to load the new tool after updating.

Password controls and credential-like values cannot be typed, read, waited on by
value, or returned in action results.

Agent MCP actions run without selecting or revealing a desktop browser tab.
New AI tabs belong to the hidden, non-focusable browser host; actions on existing
tabs retain their placement. Users reveal tabs explicitly through the Browser Hub
or pane tabs; placement requests follow the connection behavior above.
`browser_open` uses the configured home page when its URL is omitted.
Screenshots use CDP viewport capture rather than making a hidden native view
visible. The isolated `electron-browser-background-smoke.mjs` verifies hidden
navigation, DOM input and non-empty capture with no window show/focus events.
Installed-app typing continuity remains a rollout check.[^browser-server][^electron-main]

## Remote human control

The authenticated Remote PWA can project these same tabs as memory-only JPEG
frames. A phone does not navigate its own WebView: navigation and input are
executed by the desktop browser, which also makes desktop-local HTTP services
reachable through the approved Remote session. Remote taps, drag scrolling,
wheel events, allowlisted keys, and explicit text are translated into native
Electron input events using the frame's source dimensions.[^electron-main]

Remote relay actions update the shared browser but do not select a desktop tab
or steal focus from the local operator. Session-owned MCP actions likewise do not
request automatic desktop reveal.[^electron-main]

This relay is deliberately narrower than MCP. It returns tab metadata and
pixels, not DOM snapshots, cookies, storage, or profile files. Frames are never
persisted, while annotation screenshots continue to use their separate local
workflow.

## Element selection and session delivery

Selection mode highlights the DOM element under the pointer. A click captures a
bounded descriptor containing tag/role/text, selector, attributes, rectangle,
viewport, sanitized HTML, and a PNG crop.[^annotation-preload][^browser-context]

`영역 선택` copies the resulting prompt to the clipboard. `선택 후 전송`
submits the same context to the associated active session. Hover alone only
previews the target; it does not capture or send data.[^browser-ui]

## Isolation and sanitization

Local HTML opens through a random project-scoped preview capability. Tokens
are renewed and the original file is loaded again when a local document is
reopened, including reuse of an existing browser tab. Explicitly opening an
already visible document also refreshes it. This reads updated HTML and relative
assets without creating another tab; ordinary external browser tabs are unaffected.
Tokens
expire after 15 minutes and permit only approved GET/HEAD assets under the
canonical project root. Traversal, symlink escape, sensitive/build/cache paths,
and unsupported types are rejected. Desktop HTML has no fixed file-size cutoff:
the server streams approved files directly into the isolated browser view, including
reports larger than 2MB. GET/HEAD retain the exact content length, and linked HTML
and assets use the same capability checks. Remote's separate buffered document
reader retains its own limits.[^preview-service]

`npm run electron:document-preview-smoke` in `app/` verifies a HTML fixture over
5MB, relative script loading, button interaction and the absence of Node/workspace
bridges. `ACEDIA_PREVIEW_DOCUMENT` can select an additional local HTML file for a
read-only rendering check; `ACEDIA_PREVIEW_SCREENSHOT` optionally saves its image.
The preview service tests also compare the full multibyte document, linked `.htm`
content and HEAD metadata to detect truncation.

The browser view does not receive the workspace preload. Snapshots and
annotations cap text, links, controls, attributes, selectors, and HTML; cookies,
authorization material, active scripts, event handlers, and password values are
excluded. MCP typing and clicking reject password controls.[^browser-context]

Integration calls require the per-process bearer token and associated agent ID
and reject browser-origin requests. A running CLI must restart after managed MCP
configuration changes because MCP clients load configuration at startup.

[^browser-server]: Managed browser MCP server
[^browser-context]: Snapshot and annotation sanitization
[^browser-form-automation]: Semantic form targeting and verified browser actions
[^browser-file-upload]: Explicit native browser file selection
[^browser-form-smoke]: Fixture-driven Electron browser form smoke
[^browser-ui]: Embedded browser toolbar and selection UI
[^browser-tabs-ui]: Pane browser tabs and reveal UI
[^browser-hub-ui]: Application-wide browser tab hub
[^sidebar]: Global browser hub entry
[^annotation-preload]: Isolated annotation preload
[^preview-service]: Project-scoped HTML preview service
[^electron-main]: Native browser ownership and integration routes
[^image-viewer]: Image viewer native-view occlusion
[^native-view-occlusion]: Renderer overlay blockers for native views

## Downloads and visit history

The embedded toolbar exposes Downloads and History panels. The shared browser
partition records owned-tab downloads once through Electron's `will-download`;
Electron's save dialog chooses the destination. The panel shows progress and
completion/cancellation, supports cancelling active downloads, and reveals completed
files in their folder. Files are never opened automatically. Clearing download
records retains active transfers and never deletes downloaded files.

HTTP(S) main-frame visits and page titles are saved in the app-local
`browser-activity.json` alongside download records. History supports search,
reopening URLs, individual removal, and clearing. Local preview capabilities and
recognized OAuth credential URLs are excluded. At most 2,000 visits and 500 old
download records are retained; active transfers are preserved. On restart unfinished
transfers are shown as interrupted; automatic download resume is not implemented.
The native web view is hidden while the management panel is open.[^browser-activity][^browser-activity-panel]

`npx electron scripts/electron-browser-download-smoke.mjs` from `app/` verifies a
real fixture download, exact saved bytes, completed state, and restored history
with a temporary profile and destination. The production save-dialog interaction
and installed Store behavior still require installation-level verification.[^browser-download-smoke]
