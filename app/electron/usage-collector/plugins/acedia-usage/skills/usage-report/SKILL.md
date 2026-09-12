---
name: usage-report
description: Show the current employee's collected Codex and Claude Code usage from their registered Acedia Usage server.
---

Use the `usage_summary` MCP tool when the user asks for their collected usage.
Report the supplied period, employee/account breakdown, and collection coverage.
The collector reads only explicitly mapped local transcripts. The tool does not
measure this conversation, ordinary ChatGPT/Claude chat tokens, or monetary billing.
When supplied, show account email/identifier, observed remaining subscription
percentages and reset/observation times separately from consumed token totals.
Mark missing, stale, failed or conflicting account observations explicitly.
Device details include Windows user, PC and local IP as reported by the collector;
these are not independent proof of the employee's identity. Never describe missing usage as zero.
Do not request AI login credentials or send conversation content to the server.
If the collector is not enrolled, direct the user to Acedia Settings > Usage
collector, or the standalone collector setup guide. Do not change their server
or account mappings on their behalf without their request.
