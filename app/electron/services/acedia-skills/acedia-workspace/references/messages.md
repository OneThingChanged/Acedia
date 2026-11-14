# UTF-8 handoffs and receipts

Use `acedia_session_message_send` for original text, including Korean. Supply
one of message, messageBase64 or an existing UTF-8 messageFile, a stable
requestKey, the exact receiving Acedia sessionId and, when known, its native
expectedConversationId. Do not shell-interpolate Unicode into a CLI input.

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
