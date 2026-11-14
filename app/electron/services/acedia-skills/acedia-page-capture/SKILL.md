---
name: acedia-page-capture
description: Collect rendered page content, original images and collection evidence from Acedia's embedded browser for local preservation. Use when the user asks for page snapshots or original HTML/image capture through Acedia, rather than ordinary file editing.
---

# Collect a rendered page through Acedia

Check `acedia_connection` when collection tools appear missing. Use the running
host's pageCollection capability and current tool schemas.

1. Use `browser_tabs` and reuse the owning session's relevant tab. Otherwise
   `browser_open` the requested URL in the background, preserving the profile.
   Display with `browser_show` only when the user asks to see the page.
2. Read `browser_snapshot` on that exact tab to confirm title, URL and access.
   A login gate or failed load is not the requested article content. Do not
   replace this browser workflow with a separate unauthenticated HTTP scraper.
3. For original HTML/images use `browser_collect_page`, following its current
   schema. For an individual original resource use `browser_capture_asset`.
   `browser_screenshot` provides visual evidence and does not preserve all
   source assets. Keep these outcomes distinct.
4. Inspect the returned collection ID and `browser_collection_get` for saved
   files, hashes and missing/failed resources. Report partial collections as
   partial. A successful page snapshot alone is not lossless archive evidence.

Preserve tab/collection IDs to resume without repeating downloads. Read the
user's requested archive requirements before claiming compliance. Translation,
Wiki registration and publication are separate actions within the user's scope.
Respect browser/profile and user approval boundaries; collection does not
authorize logging in, uploading, submitting forms or publishing externally.
