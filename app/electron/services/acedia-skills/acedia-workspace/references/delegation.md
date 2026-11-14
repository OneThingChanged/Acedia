# Requested Acedia delegation

Use this workflow when the user requests delegation. If the user asks the
current session to do the work directly, do not start workers.

For planned multi-task work use `acedia_task_plan` with a stable requestKey.
Define goals, completion criteria, dependencies and concrete writeScopes.
Use assessment for the host's automatic model policy unless the user requests
an explicit model. Provider defaults follow the parent; choose aiToolId when
the task calls for a particular supported provider.

The parent plans, assigns, monitors and reviews; independent children perform
the actual tasks. Keep all required work in the plan. Use `acedia_task_wait`
and `acedia_task_get` to collect revisions, questions, original results and
turn evidence. Do not poll terminal output or create replacement workers for
unconfirmed delivery. Workers report with `acedia_task_result` and do not
delegate again.

Review required results and checks with `acedia_task_control`. Finish only
after all required tasks passed review. A requestKey or WORK indicator is not
completion evidence. Questions and approvals must be answered by the user.

For one new child with an initial instruction, `acedia_session_run` provides
a durable create-and-deliver workflow. Reconcile the same requestKey through
`acedia_session_run_status`; do not switch to create/send with a new key after
a timeout. Existing sessions use the session message workflow instead.
