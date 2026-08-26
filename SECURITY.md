# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's **Report a vulnerability** button under the Security tab, which opens a private advisory.

Tell us what you found, how to reproduce it, and what an attacker could do with it. We'll confirm we've seen it and let you know when there's a fix.

## What matters here

offon is self-hosted, so each deployment holds one organization's attendance records. The parts worth scrutiny:

- **Session cookies** — a signed JWT (`jose`) in an httpOnly cookie, verified in `proxy.ts` and again in every route guard.
  The token carries an identity, not a permission: every guard reads the member's role and active state back from the
  database, so deactivating or demoting someone takes effect on their next request rather than when their cookie expires.
- **Login codes** — six digits, hashed with argon2 and mixed with `OTP_PEPPER`, single use, five-minute expiry, and dead after
  five wrong guesses. That attempt counter lives in the database, so it holds however many instances are serving.
- **Slack requests** — verified with HMAC over the raw body and a five-minute replay window, compared in constant time.
- **Scheduled jobs** — bearer token, compared in constant time, fail-closed when unset.
- **Ownership** — employees can only read and edit their own attendance; approvals require an admin. Enforced server-side.

## Running it safely

- Set `SESSION_SECRET`, `OTP_PEPPER`, and `CRON_SECRET` to distinct random values (`openssl rand -base64 32`). Never reuse the examples.
  offon refuses to sign or hash without the first two and names the one that is missing, so a deployment cannot quietly run
  without them — `OTP_PEPPER` in particular used to fall back to a guessable constant, which defeats the point of a pepper.
- Serve over HTTPS. The session cookie depends on it.
- Keep the database off the public internet.
- **On serverless, the login rate limits are per-instance.** They are counted in process memory, so several instances mean
  several counters. Guessing a code is still bounded by the five-attempt limit held in the database; what loosens is how
  often a caller can make offon send a login DM. On Docker or a single server there is one process and the limits are exact.
  See the note in `src/lib/rateLimit.ts` for where to swap in a shared store.
- Rotate `SLACK_BOT_TOKEN` if it ever lands somewhere it shouldn't. It can post as your bot.
