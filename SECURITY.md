# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's **Report a vulnerability** button under the Security tab, which opens a private advisory.

Tell us what you found, how to reproduce it, and what an attacker could do with it. We'll confirm we've seen it and let you know when there's a fix.

## What matters here

offon is self-hosted, so each deployment holds one organization's attendance records. The parts worth scrutiny:

- **Session cookies** — a signed JWT (`jose`) in an httpOnly cookie, verified in `proxy.ts` and again in every route guard.
- **Login codes** — six digits, hashed with argon2 and mixed with `OTP_PEPPER`, rate-limited, single use, five-minute expiry.
- **Slack requests** — verified with HMAC over the raw body and a five-minute replay window, compared in constant time.
- **Scheduled jobs** — bearer token, compared in constant time, fail-closed when unset.
- **Ownership** — employees can only read and edit their own attendance; approvals require an admin. Enforced server-side.

## Running it safely

- Set `SESSION_SECRET`, `OTP_PEPPER`, and `CRON_SECRET` to distinct random values (`openssl rand -base64 32`). Never reuse the examples.
- Serve over HTTPS. The session cookie depends on it.
- Keep the database off the public internet.
- Rotate `SLACK_BOT_TOKEN` if it ever lands somewhere it shouldn't. It can post as your bot.
