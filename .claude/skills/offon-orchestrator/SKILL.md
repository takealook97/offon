---
name: offon-orchestrator
description: Use this for any request to build, change, extend or redo a feature. It coordinates a three-agent team across attendance, leave, the calendar, member management, sign-in, the admin pages, the reminder crons, the audit log and the dashboard.
---

# offon Orchestrator

The team leader for this project. It creates the team, assigns the tasks, and lets the members coordinate directly with each other. The leader watches progress and pulls the result together at the end.

## Phase 0: work out what kind of run this is

Check the state of the workspace before starting:
- **Nothing there** — a first run. Create the team.
- **Something there, and a specific fix requested** — a partial re-run. Re-engage only the modules involved.
- **Something there, and a new feature requested** — move the workspace aside and start fresh.

## Phase 1: locate the work
- Decide which area the request belongs to: attendance, leave, the calendar, members, authentication, crons, or auditing.
- Consult the project's planning documents.
- Read the existing structure and the schema to see how far a change reaches.

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
- Everything produced is written to the workspace as files.

## Phase 4: pull it together and stand the team down
- Confirm every task is complete.
- Confirm the QA reports carry no blocking or major findings; reassign anything that does.
- Summarise what changed, for the user.
- Delete the team.
- Only a large refactor spanning phases justifies forming a new team.

## How things are passed around

| Mechanism | Used for |
|------|------|
| tasks | tracking state and dependencies |
| messages | keeping boundaries in step: a changed response shape, a question |
| files in the workspace | the record: a completion signal, the changed files, the boundary summary |

Filenames follow `_workspace/{phase}_{agent}_{module}.md`.

## Handling failures
- An implementer that fails twice on the same thing: skip that module and say so in the final summary.
- Type and build errors go straight back to the implementer, tagged as blocking.
- Blocking and major findings go straight to the implementer; minor ones stay in the report.

## Team size
- Three, fixed: backend, frontend and QA. The size is not adjusted.
- Beyond twenty tasks, split the work into phases and run them in sequence.

## What a run looks like

### The ordinary case: adding a leave-request page
1. The request arrives: a screen and an API for requesting leave.
2. Phase 0 finds no workspace, so this is a first run.
3. Phase 1 places it in the leave area.
4. Phase 2 creates the team and three tasks, with QA blocked by the other two.
5. Phase 3: the backend implements the endpoint and records the response shape; the front end reads it and builds the form; QA compares the two and passes it.
6. Phase 4 summarises and stands the team down.

### The awkward case: a schema change
1. The backend wants to add a field.
2. It asks the leader to approve the schema change.
3. The leader approves and the migration runs.
4. QA notices the new response field and pings the front end to read it. It changes, and it passes.

## Follow-up requests
- Follow-up requests are handled by Phase 0 deciding which kind of re-run this is.
- Each agent definition has a section on what to do when earlier work exists; follow it.
