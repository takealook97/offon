# Using offon

This is the page to hand your team. It assumes someone has already deployed offon and connected it to your Slack workspace — if that's you, start with [slack-app.md](slack-app.md) and [self-hosting.md](self-hosting.md) instead.

---

## Your day, from Slack

Five slash commands. Type them in Slack — a dedicated channel like `#offon` keeps the noise in one place, though they work anywhere the app is installed.

| Command | What it does |
|---------|--------------|
| `/hi` | Clock in |
| `/bye` | Clock out |
| `/lunch` | Start a meal |
| `/break` | Step away from your desk |
| `/back` | Come back from a break |

Everything you do here shows up on the web app immediately — they're the same records, not a sync.

**A meal runs itself.** `/lunch` fixes the end an hour later, so there's no second command to remember. You'll get a DM when you're back on the clock. Until then you can't clock out or start a break, and offon will tell you how many minutes are left if you try.

**`/back` is only for `/break`.** If you're on a meal, waiting is the only option.

## Signing in to the web app

Enter **the email address on your Slack account** — the one your workspace admin used to invite you. offon matches on that address, so a personal address you've never used with Slack won't be recognized.

A six-digit code arrives in your Slack DMs. It's good for five minutes and one use.

There's no password to set or forget.

## Fixing a time you got wrong

Forgot to clock out? Clocked in late because you were in a meeting? You can ask for a correction — you don't edit the record directly.

1. **Calendar → My calendar**
2. Click the day you want to fix
3. Hit **Edit** in the dialog that opens
4. Adjust the clock-in, clock-out, meal, or away times
5. Submit — an admin sees it in their approvals queue

**Meals are the exception.** You can move when a meal *started*, but not when it ended: it's always exactly an hour later. To remove a meal entirely, delete it.

You can correct a day you haven't clocked out of yet. You can't correct one while you're marked away — come back first.

## Requesting leave

At the bottom of the dashboard. Pick full day, morning half, or afternoon half, choose your dates, and submit. An admin approves it.

Weekends and the holidays your admin has configured are skipped in the day count, and you can't request leave on them.

**You can cancel** either before it's approved or after. Cancelling approved leave returns the days to your balance.

**Approved future leave is already subtracted.** *Leave remaining* shows what you have left after everything that's approved, including days that haven't happened yet. So booking a week off in December drops the number today. The breakdown underneath spells it out:

```
Base 15 · Bonus 0 · Scheduled 5 · Used 2 · Pending 1
```

- **Scheduled** — approved, hasn't happened yet
- **Used** — already taken
- **Pending** — requested, not yet approved (subtracted from what you can still request, not from *remaining*)

## Booking a meeting room

**Rooms** shows the week. Click an empty slot, or drag across one, to book it. Bookings run 08:00–19:00 in ten-minute steps, and offon won't let you overlap someone else's.

Add attendees and offon DMs them when the booking is made, then again three minutes before it starts. External guests can be typed in free-form — they don't need accounts.

Arrow keys move between weeks.

---

## For admins

### Adding someone

1. Invite them to your Slack workspace first
2. **Members → Add member**
3. Enter their **Slack member ID** and the **email on their Slack account**

To find a Slack member ID: click the person in Slack → **⋮ (More)** → **Copy member ID**. It starts with `U`.

Both fields matter. The Slack ID is where login codes and notifications go; the email is what they type to sign in.

### When someone leaves

**Members → ⋯ → Deactivate.** Don't delete them.

Deactivating stops their sign-in and drops them from reminders, while their attendance history stays intact — which is the point, since it's a record of what happened. They also stay visible on past bookings they attended.

### Approvals

**Approvals** collects pending leave and correction requests in one queue, with a badge in the nav so nothing sits unnoticed. Approve or reject each one; rejections can carry a reason, which is DM'd to the requester.

Approving a leave request recalculates the day count against the *current* holiday list — so adding a holiday after someone requested leave still applies at approval time.

### Reminders and holidays

**Settings** has two reminder toggles, both off until you turn them on:

- **Missing clock-in** — DMs anyone with no clock-in, every weekday at 10:00. People on leave are skipped.
- **Missing clock-out** — DMs anyone who clocked in but never clocked out, every weekday at 19:00.

Neither sends anything the moment you enable it; they start on the next weekday.

The same page manages **public holidays**. Holidays behave like weekends: excluded from leave day counts, and nobody can take leave on them.

### Getting the data out

**Calendar → Download** exports a month as a spreadsheet. Admins can export the whole organization; everyone can export their own.
