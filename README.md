# offon

A team attendance & leave management app, operated through Slack and deployed on Vercel.

Employees clock in/out, take breaks, and request leave or attendance corrections. Managers approve requests from a single approvals hub. Notifications and one‑time‑password login run through Slack. The app is timezone‑pinned to KST (Asia/Seoul).

## Features

- **Attendance** — Clock in / clock out, away‑from‑desk breaks, meals, and multiple work sessions per day (handles crossing midnight). Worked / break / overtime minutes are computed automatically.
- **Meals** — A meal is fixed at 60 minutes: starting one records a closed break ending an hour later, so the return happens by the clock with no second action and no scheduled job. Clocking out and starting a break are blocked until it ends. The channel is notified on the way out, and the matching return notice is scheduled with Slack for the end instant.
- **Leave** — Full‑day and half‑day (AM/PM) requests with business‑day counting that excludes weekends and holidays, leave‑balance tracking, and approve / reject / cancel flows.
- **Attendance correction requests** — Employees can request edits to their own clock‑in/out, break, and meal times (entered from the calendar). A meal's start moves freely while its end stays an hour after it, and deleting an in‑progress meal is how one gets called off. Managers approve, and the session + daily totals are recalculated. In‑progress (not yet clocked out) sessions can be edited too.
- **Calendar** — Month view (`react-big-calendar`) of personal attendance/leave, team leave, and per‑member search. A day modal opens the correction dialog; pending requests are listed with a cancel action.
- **Approvals hub** — A single admin page lists pending leave and attendance‑edit requests together for one‑place approval.
- **Slack integration** — OTP login via Slack DM, slash commands, and DM/channel notifications for clock events, leave, and attendance‑edit request/approval/rejection.
- **Scheduled jobs (Vercel Cron)** — Missing clock‑in / clock‑out reminders and yearly leave rollover.
- **Roles** — `ADMIN` and `EMPLOYEE`, enforced both in navigation and on the server.

## Tech stack

| Area | Choice |
|------|--------|
| Framework | Next.js 16 (App Router, Turbopack, `proxy.ts` middleware) |
| Language | TypeScript, React 19 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL via Prisma 6 |
| Auth | JWT (`jose`) in an httpOnly cookie; Slack OTP, hashed with `argon2` |
| Validation | `zod` |
| Calendar / dates | `react-big-calendar`, `react-day-picker`, `date-fns` |
| Slack | `@slack/web-api` |
| Hosting | Vercel (Cron via `vercel.ts`) |

## Architecture notes

- **Stateless sessions** — Identity lives in a signed JWT carried by the `session` cookie; every request is verified in `proxy.ts` and route guards (`requireSession` / `requireAdmin`). No server‑side session store.
- **KST everywhere** — All times are handled as Asia/Seoul wall‑clock and stored as UTC instants. Formatting is timezone‑independent so it renders correctly on any runtime.
- **Ownership enforced server‑side** — Employees can only read/edit their own attendance; correction requests and cancellation are scoped to the owner, and approvals require an admin.

## Getting started

### Prerequisites

- Node.js (LTS) and `pnpm`
- A PostgreSQL database (a local Docker option is included)
- A Slack app with a Bot token for login codes, notifications, and slash commands

## Environment variables

Create a **`.env` file in the project root** (it is git‑ignored via `.env*`).

> Why `.env` and not only `.env.local`? Next.js loads both at runtime, but the **Prisma CLI only reads `.env`**. Keeping everything (at least `DATABASE_URL`) in `.env` makes `prisma migrate` / `prisma studio` work without extra flags. For local‑only overrides you may still add a `.env.local`.

```bash
# --- Database (required) ---
# URL-encode special characters in the password (e.g. ! # @ -> %21 %23 %40)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"

# --- Auth (required) ---
SESSION_SECRET="long-random-string"   # JWT signing key, e.g. `openssl rand -base64 32`
OTP_PEPPER="another-random-string"    # extra secret mixed into the OTP before hashing

# --- Slack (required) ---
SLACK_BOT_TOKEN="xoxb-..."            # Bot User OAuth Token; scopes: chat:write, im:write
SLACK_SIGNING_SECRET="..."            # verifies inbound Slack slash-command requests
SLACK_OFFON_CHANNEL="C0XXXXXXX"       # channel ID used for announcement messages

# --- Cron (required in production) ---
CRON_SECRET="random-string"           # Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`

# --- Initial admin seed (only needed for `pnpm db:seed`) ---
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_NAME="Admin"
SEED_ADMIN_SLACK_ID="U0XXXXXXX"       # the admin's Slack member ID
SEED_ADMIN_TOTAL_DAYS="15"            # starting annual-leave balance
```

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | Postgres connection string. URL‑encode password special chars. |
| `SESSION_SECRET` | yes | Signs the JWT session cookie. Keep stable (rotating logs everyone out). |
| `OTP_PEPPER` | yes | Server‑side pepper added to login codes before hashing. |
| `SLACK_BOT_TOKEN` | yes | Sends login codes and notifications; needs `chat:write`, `im:write`. |
| `SLACK_SIGNING_SECRET` | yes | Validates Slack slash‑command requests. |
| `SLACK_OFFON_CHANNEL` | yes | Channel ID for clock‑event announcements. |
| `CRON_SECRET` | prod | Authorizes the Vercel Cron endpoints. |
| `SEED_ADMIN_*` | seed only | Used once by `pnpm db:seed` to create the first admin. |

> See **Slack app setup** below for how to obtain these tokens, scopes, and IDs.

## Slack app setup

Login codes, notifications, and slash commands all run through a Slack app you create for your workspace.

1. **Create the app** — go to <https://api.slack.com/apps> → *Create New App* → *From scratch*, and choose your workspace.
2. **Bot token scopes** — *OAuth & Permissions* → *Bot Token Scopes*, add:
   - `chat:write` — post messages (DMs and channel announcements), and schedule the meal‑return notice
   - `im:write` — open a DM channel with a user (login codes & notifications)
   - `commands` — slash commands

   Then *Install to Workspace* and copy the **Bot User OAuth Token** (`xoxb-…`) into `SLACK_BOT_TOKEN`.
3. **Signing secret** — *Basic Information* → *App Credentials* → **Signing Secret** into `SLACK_SIGNING_SECRET`. This verifies that slash‑command requests really came from Slack.
4. **Slash commands** — *Slash Commands* → *Create New Command* for each below, all using the same **Request URL** `https://<your-domain>/api/slack/commands`:

   | Command | Action |
   |---------|--------|
   | `/hi` | Clock in |
   | `/bye` | Clock out |
   | `/lunch` | Start a meal (60 minutes, returns on its own) |
   | `/break` | Start an away‑from‑desk break |
   | `/back` | Return from a break |

   Slash commands need a public HTTPS URL, so they work once deployed (for local testing, expose your dev server with a tunnel and use that URL).
5. **Announcement channel** — invite the bot to the channel used for clock‑event announcements (`/invite @your-bot`), then copy that channel's ID into `SLACK_OFFON_CHANNEL`.
6. **Member Slack IDs** — every member record stores a Slack member ID (`U…`) so login codes and notifications reach them. The first admin's ID comes from `SEED_ADMIN_SLACK_ID`; add other members from the admin → members page.

> Finding IDs in Slack: a **member ID** is under a person's profile → *⋮ (More)* → *Copy member ID* (`U…`); a **channel ID** is at the bottom of the channel's *About*/details (`C…`).

## Install & run

```bash
pnpm install

# Option A — local Postgres via Docker
pnpm db:local:up
pnpm db:migrate:deploy        # apply Prisma migrations

# Create the initial admin (reads SEED_ADMIN_* from .env)
pnpm db:seed

pnpm dev                      # http://localhost:3000
```

Log in with the admin's email; a 6‑digit code is delivered to that member's Slack DM.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start the dev server |
| `pnpm build` | `prisma generate` + production build |
| `pnpm start` | Start the production server |
| `pnpm lint` | ESLint |
| `pnpm db:seed` | Seed the initial admin member |
| `pnpm db:migrate:deploy` | Apply pending Prisma migrations |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:local:up` / `:down` | Start / stop local Postgres (Docker) |

## Deployment (Vercel)

- Connect the repo to Vercel; pushes to the default branch deploy to production.
- Add every variable from **Environment variables** above to the Vercel project settings (Production/Preview).
- Cron jobs are declared in `vercel.ts` (missing clock‑in/out reminders, leave rollover) and run on Vercel's scheduler; they authenticate with `CRON_SECRET`.
- Apply migrations to the production database with `pnpm db:migrate:deploy` (or as part of your release step).

## Project structure

```text
src/
├── app/
│   ├── (app)/            # Authenticated app (dashboard, calendar, admin)
│   └── api/              # Route handlers (auth, attendance, leave, calendar, cron, slack)
├── components/           # Shared UI (shadcn/ui under components/ui)
└── lib/                  # Prisma client, auth/session, time (KST), Slack, domain helpers
prisma/                   # schema.prisma + migrations
```
