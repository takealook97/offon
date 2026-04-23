# offon

Attendance and leave for teams that live in Slack. Clocking in and out, requesting and approving leave, a calendar, and reminders when something is missing.

## What it does

- **Attendance** — one-click clock in and out, several sessions a day, an automatic lunch deduction past a threshold
- **Leave** — full and half days, requested and approved, with overlap prevention, automatic deduction and a yearly rollover
- **Calendar** — a personal and a team view, showing attendance, leave, holidays and missing records together
- **Slack** — signing in by DM, clocking in and out with slash commands, and DM notices for leave
- **Admin** — managing people, adjusting leave balances, holidays, and the reminder toggles
- **Reminder crons** — a DM on a weekday morning or evening for a missing clock-in or clock-out, skipping holidays and anyone on leave
- **PWA** — installable to a phone's home screen and runnable standalone

## Built with

- **Framework**: Next.js 16 (App Router, `proxy.ts`, async cookies/headers)
- **UI**: React 19, Tailwind CSS v4, shadcn/ui, react-big-calendar
- **Database**: PostgreSQL with Prisma 6, following the soft-delete convention
- **Auth**: a code by Slack DM, then a signed session cookie
- **Slack**: `@slack/web-api`, with slash-command signature verification
- **Deploy**: Vercel on Fluid Compute
- **Package manager**: pnpm

## Getting started

### Requirements
- Node.js 24 LTS
- pnpm
- PostgreSQL, local or remote
- A Slack workspace and a bot token

### Install

```bash
pnpm install
```

### Environment

Create `.env.local` from `.env.example`.

```
DATABASE_URL=postgresql://...
SESSION_SECRET=...        # openssl rand -hex 32
OTP_PEPPER=...            # openssl rand -hex 32
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...  # Slack App Basic Information
SLACK_OFFON_CHANNEL=C0... # the channel id for clock-in announcements
CRON_SECRET=...           # authenticates the scheduled jobs
```

The bot needs at least `chat:write`, `im:write`, `users:read` and `commands`.

### Initialising the database

```bash
pnpm prisma migrate deploy
pnpm prisma generate
pnpm db:seed        # optional: some starting data
```

### The dev server

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | start the dev server |
| `pnpm build` | generate the Prisma client, then build |
| `pnpm start` | start the production server |
| `pnpm lint` | ESLint |
| `pnpm db:seed` | run the seed script |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:migrate:deploy` | apply migrations |

## Project layout

```
src/
  app/
    (app)/            - the authenticated pages: dashboard, calendar, admin
    (auth)/           - Sign in/OTP
    api/              - Route Handler (/attendance, /leave, /admin, /cron, /slack)
    manifest.ts       - PWA manifest
    layout.tsx        - the root layout
    globals.css       - Tailwind v4 and the calendar styles
  components/         - shared components, the app shell and the mobile nav
  lib/                - prisma, session, slack, time, audit, holidays, settings
  proxy.ts            - the authentication guard (Next.js 16 proxy)
prisma/
  schema.prisma
  migrations/
```

## The cron schedule (`vercel.ts`)

| Path | Schedule (UTC) | Local time |
|---|---|---|
| `/api/cron/missing-clockin` | `0 1 * * *` | every morning |
| `/api/cron/missing-clockout` | `0 10 * * *` | every evening |
| `/api/cron/leave-rollover` | `0 15 31 12 *` | 12/31 00:00 |
| `/api/cron/leave-rollover` | `0 15 1-6 1 *` | the first week of January, as a catch-up |

Every cron verifies its header, skips weekends and holidays, and is safe to run twice.

## Deploying

Connect the repository and the config file is picked up automatically. Register every key from `.env.example`, and place the functions in the same region as the database so round trips stay short.

```bash
vercel --prod
```

### Running migrations in production

The build command does not run migrations. Apply them to production **before** the code deploys.

```bash
pnpm prisma db execute \
  --file prisma/migrations/<timestamp>_<name>/migration.sql \
  --url "$DATABASE_URL"
```

The rules:
- **Adding a column with a default is safe** — older code can still read and write around it
- **Run a drop only in the short window right after a deploy** — during a rolling release an older instance referencing a dropped column answers 500. Pick a quiet hour, immediately after the code lands.
- Migrations accumulate in timestamp order. Nothing in the middle is deleted; a new file corrects it.

## Licence

A private project.
