---
name: offon-orchestrator
description: Use this for any request to build, change, extend or redo a feature in offon. It coordinates a three-agent team — backend-implementer, frontend-implementer and qa-verifier — across attendance, leave, the calendar, member management, Slack sign-in, the admin pages, the reminder crons, the audit log and the dashboard. Trigger it immediately on requests such as adding attendance behaviour, fixing a leave-approval bug, reworking sign-in, changing the calendar or improving an admin page.
---

# offon Orchestrator

The team leader for this project. It creates the team, assigns the tasks, and lets the members coordinate directly with each other by message. The leader watches progress and pulls the result together at the end.

## Phase 0: work out what kind of run this is

Check the state of `_workspace/` before starting:
- **Nothing there** — a first run. Create the team.
- **Something there, and the user asked for a specific fix** ("just the leave-approval bug") — a partial re-run. Re-engage only the modules whose `be_*.md` or `fe_*.md` are involved.
- **Something there, and the user asked for a new feature** — move `_workspace/` aside to `_workspace_prev/` and start fresh.

## Phase 1: locate the work
- Decide which area the request belongs to: attendance, leave, the calendar, members, authentication, crons and reminders, or auditing.
- Read the existing structure under `src/` and the Prisma schema to see how far a change reaches.

## Phase 2: form the team and assign
1. Create the team: backend-implementer, frontend-implementer and qa-verifier.
2. Register the tasks separately:
   - backend work (route handlers, server actions, Prisma)
   - frontend work (pages and components)
   - QA work, cross-checking the boundaries, blocked by the two above
3. Set an owner on each task, and wire the dependencies between them.

## Phase 3: watch, do not micromanage
- The members exchange boundary changes and questions among themselves.
- The leader watches the task list and steps in only on a blocker.
- Everything produced is written to `_workspace/` as files: `be_*_done.md`, `fe_*_done.md`, `qa_*.md`.

## Phase 4: pull it together and stand the team down
- Confirm every task is complete.
- Confirm the QA reports carry no blocking or major findings; reassign anything that does.
- Summarise what changed, for the user.
- Delete the team. Only a large refactor spanning phases justifies forming a new one.

## How things are passed around

| Mechanism | Used for |
|---|---|
| tasks | tracking state and dependencies |
| messages | keeping boundaries in step in real time: a changed response shape, a question |
| files in `_workspace/*.md` | the record: a completion signal, the changed files, the boundary summary |

Filenames follow `_workspace/{phase}_{agent}_{module}.md`, for example `_workspace/be_attendance_done.md` or `_workspace/qa_leave_approve.md`.

## Handling failures
- An implementer that fails twice on the same thing: skip that module and say so in the final summary.
- Type and build errors go straight back to the implementer, tagged as blocking.
- Blocking and major QA findings go straight to the implementer; minor ones stay in the report.

## Team size
Three, fixed: backend, frontend and QA. Beyond twenty tasks, split the work into phases and run them in sequence rather than growing the team.

## What a run looks like

### The ordinary case: adding a leave-request page
1. The request arrives: a screen and an API for requesting leave.
2. Phase 0 finds no `_workspace/`, so this is a first run.
3. Phase 1 places it in the leave area.
4. Phase 2 creates the team and three tasks, with QA blocked by the other two.
5. Phase 3: the backend implements the endpoint and records the response shape in `_workspace/be_leave_done.md`; the front end reads it and builds the form; QA compares the two and passes it.
6. Phase 4 summarises and stands the team down.

### The awkward case: a schema change
1. The backend wants to add a field to `LeaveRequest`.
2. It asks the leader to approve the schema change.
3. The leader approves and the migration runs.
4. QA notices the new response field and pings the front end to read it. The front end changes, and it passes.

## Follow-up requests
Requests like "do that again", "just fix this part" or "tidy up the approval logic" are handled by Phase 0 deciding which kind of re-run this is. The agent definitions each have a section on what to do when earlier work exists; follow it.
