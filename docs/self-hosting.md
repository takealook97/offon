# Self-hosting offon

offon is a normal Next.js app with a Postgres database. This guide covers the Vercel path, which is the one it's built for, plus the pieces that bite on serverless.

**Before you start:** create your Slack app — see [slack-app.md](slack-app.md). Login codes go nowhere without it.

---

## 1. Get a Postgres database

offon needs **Postgres**. The schema uses Postgres-specific types and the migrations are Postgres DDL, so MySQL and SQLite aren't options without rewriting them.

Any of these work:

| Provider | Notes |
|----------|-------|
| **Supabase** | Free tier is plenty for a small team. Use the **pooler** URL — see below. |
| **Neon** | Serverless Postgres, scales to zero. Use the **pooled** connection string. |
| **Railway / Render / Fly** | Standard Postgres; connection limits are low on free tiers, so pool. |
| **Amazon RDS** | Fine, but put it where your functions run or you'll pay for every round trip. |
| **Your own server** | Works. Make sure TLS is on and add `?sslmode=require`. |

### Use a pooled connection on serverless

This is the one that catches people. Every serverless invocation can open its own database connection, and a small Postgres instance runs out of them fast — you'll see `too many connections` or connection-pool timeouts under mild load.

Use your provider's **pooler** endpoint, not the direct one:

```bash
# Supabase — pooler is port 6543, direct is 5432
DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&schema=public"

# Neon — use the host with "-pooler" in it
DATABASE_URL="postgresql://user:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/offon?sslmode=require&schema=public"
```

The `pgbouncer=true` flag tells Prisma the connection goes through a transaction pooler, so it stops using prepared statements the pooler can't hold across transactions.

> **URL-encode special characters in the password.** `!` `#` `@` become `%21` `%23` `%40`. A raw `@` splits the URL at the wrong place and the error won't tell you that.

### Migrations need the direct URL

Schema migrations can't run through a transaction pooler. When you run `pnpm db:migrate:deploy`, point `DATABASE_URL` at the **direct** connection (Supabase: port 5432; Neon: the host without `-pooler`). Your deployed app keeps using the pooled one.

## 2. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftakealook97%2Foffon&project-name=offon&repository-name=offon&env=DATABASE_URL,SESSION_SECRET,OTP_PEPPER,SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET,SLACK_OFFON_CHANNEL,CRON_SECRET)

Or by hand: fork the repo, **Add New → Project** in Vercel, import it. The build command is already set in `vercel.ts` (`prisma generate && next build`), so there's nothing to configure there.

Add every variable from the table in the [README](../README.md#configuration) to **Production** (and **Preview**, if you use preview deployments). Generate the secrets first:

```bash
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # OTP_PEPPER
openssl rand -base64 32   # CRON_SECRET
```

`SESSION_SECRET` signs session cookies — changing it later logs everyone out. `OTP_PEPPER` is mixed into login codes before hashing; changing it invalidates codes already in flight.

### Region

`vercel.ts` pins functions to `icn1` (Seoul). **Change this to wherever your database lives** — every request makes several database round trips, and a function in Seoul talking to a database in Virginia will feel slow.

```ts
// vercel.ts
regions: ['iad1'],   // us-east-1, for example
```

## 3. Create the schema and the first admin

Migrations don't run automatically on deploy. From your machine, with `DATABASE_URL` pointed at the **direct** (non-pooled) connection:

```bash
pnpm db:migrate:deploy    # create the schema
pnpm db:seed              # create the first admin
```

`pnpm db:seed` reads `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_SLACK_ID`, and `SEED_ADMIN_TOTAL_DAYS` from your local `.env.local`. The Slack ID matters most — that's where the admin's login code is DM'd. Everyone else gets added from the members page once you're in.

Run `pnpm db:migrate:deploy` again after any upgrade that ships new migrations.

## 4. Point Slack at your domain

Back in your Slack app, set every slash command's Request URL to your real domain:

```
https://your-project.vercel.app/api/slack/commands
```

Then type `/hi` in Slack. If you're clocked in and the announcement lands in your channel, you're done.

## Scheduled jobs

Three jobs are declared in `vercel.ts` and authenticate with `CRON_SECRET`:

| Job | When | What it does |
|-----|------|--------------|
| `/api/cron/missing-clockin` | daily | DMs people who haven't clocked in |
| `/api/cron/missing-clockout` | daily | DMs people who left without clocking out |
| `/api/cron/leave-rollover` | year boundary | Rolls annual-leave balances into the new year |

The notification jobs are off by default and switched on from the in-app **admin → settings** page, so deploying doesn't start messaging your team unannounced.

**Cron limits depend on your Vercel plan** — both how many jobs you get and how often they may run. Check [Vercel's cron documentation](https://vercel.com/docs/cron-jobs) against the four entries in `vercel.ts` before relying on them; on the free plan you may need to drop one or move it to an external scheduler.

There's a fourth handler, `/api/cron/lunch-reminder`, deliberately **not** registered in `vercel.ts`. It needs to run every few minutes across the lunch window, which exceeds what the free plan allows. If you want it, call it from any external scheduler (cron-job.org, GitHub Actions, your own box) with the same bearer token:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/lunch-reminder
```

The handler is idempotent, so calling it more often than needed is harmless.

## Deploying somewhere other than Vercel

Nothing here is Vercel-specific except the cron declarations.

### Docker

The repository ships a `Dockerfile` and a compose profile that brings up the app and its database together:

```bash
cp .env.example .env      # fill in the secrets
docker compose --profile app up --build
```

Then create the schema and the first admin, once:

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app node node_modules/.bin/tsx prisma/seed.ts
```

The image is a multi-stage build on Next.js's standalone output — about 400 MB — and runs as a non-root user. The standalone bundle already carries the Prisma client and its engines, so migrations run inside the container.

`NEXT_PUBLIC_TIMEZONE` is baked in at build time — the browser needs it, so it cannot be read from the environment at runtime. Change it and rebuild.

### Anything else

`pnpm build && pnpm start` runs anywhere Node runs — Fly, Render, a VPS. Replace the `vercel.ts` crons with whatever your platform offers (a real crontab, a Kubernetes CronJob) hitting the same endpoints with the same bearer token.

## Upgrading

```bash
git pull
pnpm install
pnpm db:migrate:deploy    # against the direct connection
```

Then redeploy. Migrations are additive and deletes are soft, so rolling forward doesn't drop data.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `too many connections` / pool timeouts | You're on a direct connection. Switch `DATABASE_URL` to the pooler and add `pgbouncer=true`. |
| `prepared statement "s0" already exists` | Same cause — the `pgbouncer=true` flag is missing. |
| Migrations hang or fail on the pooler | Run them against the direct connection instead. |
| Everyone logged out after a deploy | `SESSION_SECRET` changed. Set it once and leave it. |
| Cron endpoints return 401 | `CRON_SECRET` in the environment doesn't match what the caller sends. |
| App loads but every page redirects to login | The session cookie isn't sticking — check that you're on HTTPS. |
| Times are off by hours | offon is pinned to UTC+9. See *Known limitations* in the README. |
