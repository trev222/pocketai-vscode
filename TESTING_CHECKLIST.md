# PocketAI Harness Testing Checklist

Use this checklist after reloading the extension host or VS Code window.

## Setup

- Confirm PocketAI opens from the activity bar and the custom icon renders correctly.
- Confirm the settings view loads without console errors.
- Confirm the chat view opens without console errors.
- If the workspace has `.pocketai.md`, `AGENTS.md`, or `CLAUDE.md`, verify PocketAI detects project guidance and keeps the project-instructions badge visible.

## Endpoints

- Verify `Local PocketAI` is present by default.
- Verify `Local PocketAI` cannot be removed from the settings panel.
- Add a non-local endpoint and verify it can be removed.
- Switch between endpoints from the chat header and confirm the active endpoint changes immediately.
- Switch endpoints from the settings panel and confirm the chat header stays in sync.
- Run `/endpoint` and verify it lists endpoints with the active one marked.
- Run `/endpoint Codex Bridge` or `/endpoint <url>` and verify it follows the same switch and auto-connect behavior as the UI.

## Codex Bridge

- If a Codex endpoint is already configured, verify PocketAI attempts to start it automatically on load.
- Verify `Connect to Codex` remains collapsed by default and expands/collapses cleanly.
- Verify the collapsed Codex card only shows the title and caret.
- Verify Codex login still works when not signed in.
- Verify the Codex status card updates after login or bridge startup.

## Models And Reasoning

- On `Local PocketAI`, verify the footer model selector shows local models only.
- On `Local PocketAI`, verify the reasoning selector is hidden.
- Switch to `Codex Bridge` and verify the footer model selector updates to Codex models.
- On `Codex Bridge`, verify the reasoning selector appears and shows only supported values for the selected model.
- Change the Codex model and verify reasoning options update with it.
- Switch back to `Local PocketAI` and verify the reasoning selector disappears again.
- After switching away from Codex, send a prompt and verify the request still succeeds with no reasoning-related error.
- Create a new chat and verify it inherits the most recently selected model.

## Sessions

- Click the chat title and rename it inline.
- Verify the renamed title persists after switching chats.
- Open `History`, switch chats, and verify the active session changes correctly.
- Create a new chat from `History` and verify it opens immediately.

## Modes

- Run `/ask`, `/auto`, and `/plan` and verify each switches the chat mode immediately.
- Run `/mode ask`, `/mode auto`, and `/mode plan` and verify they still work.
- Run `/help` and verify it lists the current slash commands and built-in skill shortcuts.
- Run `/refresh` and verify models refresh for the active endpoint.

## Skills

- Run `what skills do you have?` and verify the built-in PocketAI skill list is returned instantly.
- Run `is the debug skill available?` and verify the answer is returned instantly.
- Run `/skills` and verify it prints the current skill catalog.
- Run `/skills debug` and verify it filters the list correctly.
- Run `use the debug skill and inspect this error` and verify the `debug` skill is activated.
- Type a natural prompt like `fix these diagnostics` and verify the matching skill chip appears automatically.
- Activate multiple skills such as `/debug` and `/review` and verify both chips appear.
- Remove one active skill chip and verify only that skill is removed.
- Use `/clear` and verify active skills are cleared.

## Skill Workflows

- Run `fix these diagnostics` and verify the first response feels grounded in diagnostics.
- Run `review my changes` and verify the response uses git context.
- Run `what is this project?` or `/init` and verify the response uses project structure context.
- Run `investigate why this is failing` and verify the response starts with evidence gathering rather than an immediate guess.

## Task Tracking

- Trigger a workflow that uses `todo_write` and verify the harness pane shows a `Plan` card.
- Verify pending, in-progress, and completed todo statuses render clearly in that card.
- Reload the chat and verify the current todo list is rebuilt from transcript history.
- Run `/tasks` and verify the current tracked plan is printed into chat.

## Tools

- Ask `what tools do you have available?` and verify the answer is sensible.
- Ask for an exact tool-style listing and verify `list_tools` behavior still works.
- Request a file read and verify it succeeds.
- Ask PocketAI to open a known file and verify the editor focuses that file, optionally at the requested line.
- Ask PocketAI to open a definition from a known symbol location and verify the editor jumps to the implementation.
- Ask PocketAI to search workspace symbols for a known name and verify it returns matching locations.
- Ask PocketAI for hover info on a known symbol and verify it returns type/docs/signature context.
- Ask PocketAI to list code actions for a location with an error or quick fix and verify it returns editor-suggested actions.
- Request a precise edit and verify approval flow still appears when needed.
- Request a file creation and verify it succeeds.
- Ask for diagnostics, definitions, references, or document symbols and verify those IDE-backed tools respond correctly.

## Approvals And Diffs

- Trigger one edit requiring approval and verify the approval card appears.
- Verify the harness pane shows the pending approval at the same time.
- Approve the edit and verify the request resumes correctly.
- Reject an edit and verify the request resumes or stops cleanly.
- If multiple approvals are queued, verify `approve all` and `reject all` still work.
- Open a diff preview and verify it matches the pending change.

## Background Commands

- Start a background command and verify it appears in the harness pane.
- Verify the task status updates while it runs.
- Cancel a running background command and verify it moves to `cancelled`.
- Start a second background command after cancelling the first and verify the pane still behaves correctly.
- Run `/jobs` and verify the current chat's background commands are listed.
- Run `/jobs <taskId>` and verify it prints the full task details/output into chat.
- Run `/jobs cancel <taskId>` and verify it cancels the matching background command.
- Run `/jobs rerun <taskId>` on a finished job and verify it starts a new background command.
- Run `/jobs clear` and verify finished, failed, cancelled, or interrupted jobs are removed while running jobs remain.
- Use the `Details` button on a task in the harness pane and verify it prints that task's details into chat.
- Use the `Rerun` button on a finished task in the harness pane and verify it starts a new background command.
- Use the `Clear Finished Jobs` button in the harness pane and verify stale jobs disappear from the card.
- Start a long-running background command, reload the window, and verify it comes back as `interrupted` instead of disappearing.
- After reload, run `/jobs <taskId>` on that interrupted job and verify the preserved details still render.
- After reload, rerun that interrupted job and verify it starts a fresh background command successfully.

## Chat UX

- Hover an assistant message and verify timing metadata appears on the right without shifting layout.
- Verify the header remains compact and does not feel oversized.
- Verify export still works from the chat header.
- Verify the message composer still sends with Enter and the send button.

## Regression Checks

- Reload the window and verify sessions restore correctly.
- Reload the window and verify active endpoint selection restores correctly.
- Edit `.pocketai.md`, `AGENTS.md`, or `CLAUDE.md` and verify PocketAI picks up the updated guidance after reload or file change.
- Reload the window during a running background command and verify the `Status` card and harness task list both mention interrupted work.
- Run `/doctor` and verify the report includes endpoint, provider, model, mode, skills, tracked tasks, approvals, background commands, and token estimate.
- Run `/status` and verify it behaves like `/doctor`.
- Verify the harness pane shows a `Status` card when the endpoint is unhealthy, approvals are pending, context is getting full, or background work needs attention.
- Verify the `Status` card quick actions work, especially `Compact`, `Refresh Models`, and `Jobs` when those situations apply.
- Verify the extension still works when Codex is unavailable.
- Verify the extension still works when the active endpoint is unreachable.
- Verify there are no obvious duplicate assistant messages, duplicate approvals, or stuck busy states.
