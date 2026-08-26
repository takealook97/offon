# Contributing

Thanks for taking a look. offon is a small, focused app and it intends to stay that way — attendance and leave for one organization, driven from Slack.

## Getting set up

```bash
pnpm install
cp .env.example .env.local     # fill it in — see the README
pnpm db:local:up               # local Postgres in Docker
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

You don't need a Slack workspace to develop. With `SLACK_BOT_TOKEN` empty, the login code is printed to the server console instead of being DM'd, and the login page tells you so.

## Before opening a pull request

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm lint
```

There is a second suite for the parts that need a real database — the attendance state machine leans on unique indexes and row locks, so nothing but Postgres will do:

```bash
pnpm db:local:up
createdb offon_test   # or: docker exec offon-local-pg createdb -U offon offon_test
DATABASE_URL="postgresql://offon:offon@localhost:55432/offon_test?schema=public" pnpm test:db
```

It refuses to run unless the database name ends in `_test`, because it truncates every table between cases.

There is also a `Dockerfile` for self-hosters. It is not built in CI, so if you touch it, run `docker build .` yourself.

CI runs the four commands above. They pass on `main`, so a red build means the change broke something.

**Run the app too.** Type checking and linting both pass on code that cannot boot — server-only imports leaking into client bundles and missing `'use client'` directives only show up at runtime.

## What a good change looks like

- **Write in English.** Code comments, commit messages and documentation are all English. The only Korean in the repository is data: the translations in `src/lib/i18n/dictionary.ts`, the holiday names in the seed script, the language names in `locale.ts`, and the test that asserts on those translations. A comment in another language shuts out everyone who cannot read it.
- **Add a test when you add a rule.** The domain logic in `src/lib` is where the rules live: business-day counting, break validation, booking overlap, the OTP and signature checks. Those are pure functions and easy to test.
- **If the rule is enforced by the database, test it there.** `*.db-test.ts` files run against real Postgres. Concurrency guarantees — one open session, one running meal — are the sort of thing that looks fine in a unit test and falls over under a double click.
- **Keep business logic out of route handlers.** A rule inside a `route.ts` cannot be tested without standing up a request. The scheduled jobs live in `src/lib` and their routes only check the bearer token and call them.
- **Don't put user-facing prose in the domain layer.** Validators return a `MessageKey`; the screen translates it in the viewer's language and Slack translates it in the deployment's. See `src/lib/i18n/`.
- **Keep both locales in step.** `ko` is the source of truth for the key set; `en` must define the same keys with the same placeholders. A test enforces this, so a half-added string fails the suite.
- **Times are wall-clock, stored as UTC.** Everything goes through `src/lib/time.ts`. Please don't reach for `Date` arithmetic directly, and never write a fixed offset into a string — that bug has shipped once already, and it put leave on the wrong day for every organization outside the default timezone.
- **Derive policy, don't repeat it.** A standard day is the working window minus the meal; a half day is half of that; the morning/afternoon split is the start plus a half day. They live together in `src/lib/work-hours.ts` because, written out separately, they drift.
- **Never regenerate the migrations from the schema.** Three partial unique indexes exist only as hand-written SQL, because the Prisma DSL cannot express a `WHERE` clause on a unique. `prisma migrate diff` silently drops them, an existing database keeps them so nobody notices, and only a fresh install is left unprotected. It has happened once; see `20260826020000_restore_partial_unique_indexes`. `attendance-edit-request.db-test.ts` asserts they still enforce.
- **Soft delete, don't hard delete.** Attendance is a record of what happened.

## Things that would genuinely help

The README lists what's missing under *Known limitations*. A live demo would probably help more than any of it — there is nowhere to click and try this before installing it.

If you touch `src/lib/time.ts`, run the timezone tests. They cover half-hour zones and both daylight-saving transitions, which is where this kind of code goes wrong.

## Reporting a bug

Include what you did, what happened, and what you expected. If it involves times, say which timezone you're in and paste the actual values — most attendance bugs are boundary bugs.
