# UTF-8 handoffs and receipts

Use `acedia_session_message_send` for original text, including Korean. Supply
one of message, messageBase64 or an existing UTF-8 messageFile, a stable
requestKey, the exact receiving Acedia sessionId and, when known, its native
expectedConversationId. Do not shell-interpolate Unicode into a CLI input.

## Write a readable handoff

Identify an interim update or final handoff in the first sentence and state the
outcome in plain language. For a substantial report, separate **Conclusion**,
**Completed**, **Remaining work**, **Issues**, and **Evidence** with Markdown
headings or bullets and blank lines; omit sections that add nothing. In Korean,
use 결론, 완료한 일, 남은 일, 발견한 문제, 근거. Keep normal word spacing and
explain abbreviations on first use instead of joining counters, English terms
and Korean into compressed strings.

Put document links, run IDs, hashes and log locations under Evidence rather
than packing them into the conclusion. Distinguish a completed check from a
completed task and a final handoff; retain failures and unverified scope. Link
to a detailed report when the evidence is long. Do not rewrite an already
stored original to improve its presentation or silently change its meaning.

## Transport and receipts

For an authorized instruction to an existing inactive local Codex/Claude session,
set `startIfOffline:true` with the same message and stable requestKey. The host
saves the original before starting that exact registered session in the background,
then checks input readiness and queues/notifies in order. Existing active sessions
are retained. The default is false; `notify:false` never starts a session.
Inspect `activation` separately from `delivery`: a process starting does not prove
the instruction was received or the work began. Login, questions, drafts and
approvals remain explicit. An interrupted startup becomes unconfirmed; reconcile
the same session/key before an explicit retry. Never use another key just to retry.

The inbox stores the original text and notifies the receiver with an ASCII
reference. On receiving such a notification, fetch that exact messageId with
`acedia_session_message_receive` before acting; do not infer its body from the
notification. Replies can reference replyTo.

Saved, notified, read and task-started are separate states. `notify:false` saves
without requesting a CLI notification. An offline or initializing receiver does
not imply the original text was lost. Inspect session status and the send/receipt
schema supported by the host before retrying. Reuse the original requestKey and
payload; do not create new keys or send the same work through another path while
the original notification may already have arrived.

Use the original requestKey with `acedia_session_delivery` for direct-delivery
receipts. Read receipts are not proof of implementation completion. Report
uncertain submission honestly and reconcile the original receipt rather than
blindly resending. A question or approval in the target belongs to the user.
