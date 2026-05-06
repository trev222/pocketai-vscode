# PocketAI Extension Smoke Test

Run this after reloading the VS Code extension host when harness, approval, diff, subagent, or command-task code changes.

## Before Starting

- Run `npm run typecheck`.
- Run `npm test`.
- Launch the extension host.
- Open a disposable workspace or a throwaway branch with at least one small text file.
- Open the PocketAI chat view and confirm the chat, settings, and harness pane render without console errors.

## Command Tasks

- Send: `run a quick foreground command: pwd`
- Verify a foreground command appears in the harness Tasks card while running, then moves to completed.
- Send: `run a failing foreground command: node -e "process.exit(7)"`
- Verify the command appears as failed and the tool result shows a failure.
- Send: `start a background command: @run_command: --background node -e "setTimeout(()=>console.log('done'), 2000)"`
- Verify the background command appears in the Tasks card and later moves to completed.
- Run `/jobs` and verify foreground and background commands appear under command tasks.
- Run `/jobs <taskId>` for one completed task and verify output/cwd/status render.
- Start a longer background command, cancel it from the Tasks card, and verify it moves to cancelled.
- Rerun a finished task from the Tasks card and verify a new task id appears.
- Run `/jobs clear` and verify finished/cancelled/interrupted tasks are removed while running tasks remain.

## Approvals And Diffs

- Switch to Ask mode with `/ask`.
- Ask for a tiny edit to the disposable file.
- Verify the approval card appears and the harness pane shows a pending approval.
- Click `View Diff` and verify the diff preview matches the requested change.
- Verify inline diff CodeLens appears in the editor.
- Reject the edit and verify the inline decorations disappear.
- Ask for the same tiny edit again, approve it, and verify the file changes and the request resumes.
- Trigger a second edit and use `Always Deny`; verify `/permissions` lists the deny rule and the edit is blocked next time.

## Review And Skills

- Make an uncommitted change in the disposable workspace.
- Run `/review`.
- Verify the response inspects git diff context and leads with review-style findings or explicitly says no issues were found.
- Run `/skills` and verify built-in skills are listed.
- Send `debug this failing command: npm test` and verify the debug skill chip is activated or the response starts by gathering evidence.

## Subagents

- Ask for a read-only delegated investigation, for example: `use a subagent to inspect the command task code and report risks`.
- Verify the Subagents card appears while it runs and then shows a completed report.
- Ask for a write-capable subagent with explicit ownership, for example: `use a write subagent limited to tests/harness-pure.test.cjs to add a tiny test`.
- Verify the subagent refuses to write outside its allowed path if asked, and succeeds only within the owned path.

## Session And Reload

- Start a long-running background command.
- Reload the extension host before it finishes.
- Verify the restored task is marked interrupted rather than disappearing.
- Run `/jobs <taskId>` on the interrupted task and verify preserved output/details render.
- Verify the active endpoint, selected model, and current chat are still correct after reload.

## Final Pass

- Run `/doctor` and verify endpoint, provider, model, mode, skills, approvals, command tasks, and token estimate are present.
- Confirm there are no duplicate assistant messages, duplicate approval cards, stuck busy states, or stale inline diff decorations.
- Run `git status --short` and confirm only intentional smoke-test file changes remain.
