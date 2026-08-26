@AGENTS.md

## Harness: offon

**Goal:** an attendance and leave tracker built on Next.js 16, Prisma and Vercel, and extended from there.

**Trigger:** use the `offon-orchestrator` skill for work on attendance, leave, the calendar, member management or Slack OTP. Plain questions can be answered directly.

**Language:** all code comments, commit messages and documentation are written in English. Korean appears only as translation data in `src/lib/i18n/dictionary.ts`.

**Change log:**
| Date | Change | Area | Why |
|------|--------|------|-----|
| 2026-04-20 | Initial setup | Everything | Started the MVP |
| 2026-07-22 | Split meals out of breaks, with a fixed length and an automatic return | Attendance | The old "meal" was a break between 11:00 and 15:00 with different wording, not a feature of its own |
| 2026-08-26 | Switched the whole repository to English | Everything | Preparing to open-source it, where Korean comments shut out contributors |
