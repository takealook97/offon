<div align="center">

<img src="public/logo.png" alt="offon" width="96" height="96">

# offon

**Attendance and leave for teams that live in Slack.**

Your team already types "morning!" in `#general`. offon turns that into a real attendance record — clock-in, breaks, leave requests, approvals — without asking anyone to learn new software.

Self-hosted. MIT licensed. Deploys to Vercel in about 10 minutes.

[Quick start](#quick-start) · [Slack setup](docs/slack-app.md) · [Self-hosting](docs/self-hosting.md)

</div>

---

## Who this is for

You use Slack. You have no attendance system — just a spreadsheet someone updates, a channel where people post that they've arrived, or nothing at all. You don't want to buy an HR suite, and you'd rather not hand your team's working hours to a vendor.

offon is for that gap. It's a small app you run yourself, and the whole interface your team touches is Slack.

**It is not** a payroll system, an HRIS, or a multi-tenant SaaS. One deployment serves one organization, on purpose.

## How it works

Someone starts their day by typing this in Slack:

```
/hi
```

They're clocked in, and the team channel says so. At lunch, `/lunch` — a meal is a fixed 60 minutes, so they come back automatically without a second command. Stepping out is `/break`, coming back is `/back`, and the day ends with `/bye`.

Everything else — leave requests, approvals, the calendar, corrections when someone forgets to clock out — lives in a web app that people sign into **with a code DM'd to them on Slack**. No passwords to manage, no accounts to provision.

## Features

- **Attendance** — Clock in/out, away-from-desk breaks, meals, and multiple sessions per day (crossing midnight is handled). Worked, break, and overtime minutes are computed for you.
- **Meals without a second command** — Starting a meal records a break that closes 60 minutes later, so the return happens by the clock. Clocking out and starting a break are blocked until it ends, and the "back now" notice is scheduled with Slack up front.
- **Leave** — Full-day and half-day (AM/PM) requests, business-day counting that skips weekends and the holidays you configure, balance tracking, and approve / reject / cancel flows.
- **Correction requests** — Forgot to clock out? Request an edit from the calendar; a manager approves and the totals recalculate. In-progress sessions can be corrected too.
- **Meeting rooms** — Weekly booking grid with conflict detection, attendee lists, a Slack DM to everyone when a meeting is booked, and a reminder 3 minutes before it starts.
- **Approvals in one place** — Pending leave and correction requests sit on a single admin page, with a badge in the nav so nothing rots.
- **Calendar** — Month view of personal attendance and leave, team leave, and per-member search.
- **Excel export** — Hand your accountant a spreadsheet instead of a screenshot.
- **Passwordless login** — A 6-digit code, DM'd on Slack, hashed with argon2.
- **Scheduled nudges** — Missing clock-in and clock-out reminders, and yearly leave rollover.
- **English and Korean** — Each person picks their language from the header; Slack messages follow `DEFAULT_LOCALE`.

## Quick start

You need Node.js (LTS), pnpm, Docker (for a local database), and a Slack workspace you can install an app into.

```bash
git clone https://github.com/takealook97/offon.git
cd offon
pnpm install

cp .env.example .env.local     # then fill it in — see Configuration below

pnpm db:local:up               # local Postgres in Docker
pnpm db:migrate:deploy         # create the schema
pnpm db:seed                   # create the first admin

pnpm dev                       # http://localhost:3000
```

Before `pnpm db:seed`, you need a Slack app for the login codes to go anywhere. **[docs/slack-app.md](docs/slack-app.md)** walks through it — it's a manifest you paste in, and it takes about five minutes.

Then sign in with the admin's email. A 6-digit code arrives in that person's Slack DM.

## Deploying

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftakealook97%2Foffon&project-name=offon&repository-name=offon&env=DATABASE_URL,SESSION_SECRET,OTP_PEPPER,SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET,SLACK_OFFON_CHANNEL,CRON_SECRET)

You'll need a Postgres database — **Supabase, Neon, Railway, RDS, or your own** all work. See **[docs/self-hosting.md](docs/self-hosting.md)** for the full walkthrough, including the connection-pooling setting that matters on serverless and how the scheduled jobs are wired.

## Configuration

Copy `.env.example` to `.env.local` and fill in these:

| Variable | Required | What it is |
|----------|----------|------------|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET` | yes | Signs the session JWT. Rotating it logs everyone out. |
| `OTP_PEPPER` | yes | Extra secret mixed into login codes before hashing |
| `SLACK_BOT_TOKEN` | yes | Bot User OAuth Token (`xoxb-…`) |
| `SLACK_SIGNING_SECRET` | yes | Verifies slash commands really came from Slack |
| `SLACK_OFFON_CHANNEL` | yes | Channel ID for clock-event announcements |
| `DEFAULT_LOCALE` | no | Language for Slack messages and reminders (`ko` or `en`, default `ko`) |
| `CRON_SECRET` | production | Authorizes the scheduled-job endpoints |
| `SEED_ADMIN_*` | seed only | Used once by `pnpm db:seed` to create the first admin |

Generate the two secrets with `openssl rand -base64 32`.

## Known limitations

Worth knowing before you deploy — these are real, and PRs are welcome on all of them.

- **Timezone is fixed to UTC+9 (Asia/Seoul).** `src/lib/time.ts` uses a constant offset rather than a timezone database. If your team isn't in Korea or Japan, times will be wrong until this is generalized.
- **Postgres only.** The schema and migrations are Postgres-specific. Supabase, Neon, Railway, RDS all qualify; MySQL and SQLite do not.
- **One organization per deployment.** There's no tenant concept in the schema — run a second deployment for a second org.
- **Meeting-room hours and meal length are constants**, not settings. Rooms run 08:00–19:00 in 10-minute slots; a meal is 60 minutes.

## Tech stack

| Area | Choice |
|------|--------|
| Framework | Next.js 16 (App Router, Turbopack, `proxy.ts`) |
| Language | TypeScript, React 19 |
| Styling | Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL via Prisma 6 |
| Auth | JWT (`jose`) in an httpOnly cookie; Slack OTP hashed with `argon2` |
| Validation | `zod` |
| Calendar | `react-big-calendar`, `react-day-picker`, `date-fns` |
| Slack | `@slack/web-api` |
| Hosting | Vercel (cron declared in `vercel.ts`) |

## Design notes

- **Stateless sessions.** Identity lives in a signed JWT in the `session` cookie, verified in `proxy.ts` and again in route guards (`requireSession` / `requireAdmin`). There's no session store to run.
- **Ownership is enforced on the server.** Employees can only read and edit their own attendance; corrections and cancellations are scoped to the owner, and approvals require an admin. The client is never trusted for this.
- **Wall-clock times, stored as UTC instants.** Formatting is timezone-independent, so a record renders the same whether the runtime clock is UTC or local.
- **Soft deletes everywhere.** Records carry `deletedAt` rather than disappearing, because attendance is a record of what happened.

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start the dev server |
| `pnpm build` | `prisma generate` + production build |
| `pnpm test` | Run the test suite |
| `pnpm lint` | ESLint |
| `pnpm db:seed` | Seed the initial admin member |
| `pnpm db:migrate:deploy` | Apply pending migrations |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:local:up` / `:down` | Start / stop local Postgres (Docker) |

## Project structure

```text
src/
├── app/
│   ├── (app)/            # Authenticated app (dashboard, calendar, rooms, admin)
│   └── api/              # Route handlers (auth, attendance, leave, calendar, cron, slack)
├── components/           # Shared UI (shadcn/ui under components/ui)
└── lib/                  # Prisma client, auth/session, time, Slack, domain logic
prisma/                   # schema.prisma + migrations
docs/                     # Slack app setup, self-hosting guide
```

## Contributing

Issues and pull requests are welcome. If you're adding behavior, add a test for it — the domain rules live in `src/lib` and are covered by `pnpm test`.

## License

MIT — see [LICENSE](LICENSE).
