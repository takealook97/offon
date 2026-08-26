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

CI runs exactly these three. They pass on `main`, so a red build means the change broke something.

**Run the app too.** Type checking and linting both pass on code that cannot boot — server-only imports leaking into client bundles and missing `'use client'` directives only show up at runtime.

## What a good change looks like

- **Add a test when you add a rule.** The domain logic in `src/lib` is where the rules live: business-day counting, break validation, booking overlap, the OTP and signature checks. Those are pure functions and easy to test.
- **Don't put user-facing prose in the domain layer.** Validators return a `MessageKey`; the screen translates it in the viewer's language and Slack translates it in the deployment's. See `src/lib/i18n/`.
- **Keep both locales in step.** `ko` is the source of truth for the key set; `en` must define the same keys with the same placeholders. A test enforces this, so a half-added string fails the suite.
- **Times are wall-clock, stored as UTC.** Everything goes through `src/lib/time.ts`. Please don't reach for `Date` arithmetic directly.
- **Soft delete, don't hard delete.** Attendance is a record of what happened.

## Things that would genuinely help

The README lists what's missing under *Known limitations*. The timezone one is the biggest: `src/lib/time.ts` uses a fixed UTC+9 offset, which makes the app unusable outside Korea and Japan. Generalizing that — without breaking the existing day-boundary behavior the aggregation depends on — would open the project up to everyone else.

## Reporting a bug

Include what you did, what happened, and what you expected. If it involves times, say which timezone you're in and paste the actual values — most attendance bugs are boundary bugs.
