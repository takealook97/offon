---
name: calendar-events
description: The shape of offon's calendar events, the contract of `/api/calendar/events`, and how attendance, leave and missing records are drawn. Use it for anything touching react-big-calendar — adding a marker, changing colours, altering the event shape.
---

# Calendar event conventions

## The library
`react-big-calendar` (MIT) with a `date-fns` localizer. Month, week and day views come with it.

## The event shape, shared by the API and the client
```ts
// src/lib/api-types.ts
export type CalendarEventKind = 'ATTENDANCE' | 'LEAVE' | 'MISSING';

export type CalendarEvent = {
  id: string;                        // unique: the kind plus the source primary key
  title: string;
  start: string;                     // a UTC ISO 8601 instant
  end: string;
  allDay: boolean;
  resource: {
    kind: CalendarEventKind;
    // kind === 'ATTENDANCE'
    workedMinutes?: number;
    overtimeMinutes?: number;
    status?: 'WORKING' | 'DONE';
    // kind === 'LEAVE'
    leaveType?: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';
    leaveStatus?: 'REQUESTED' | 'APPROVED' | 'REJECTED';
    // kind === 'MISSING'
    reason?: 'CLOCK_IN' | 'CLOCK_OUT';
  };
};
```

The client turns `start` and `end` into Dates before handing them to the calendar — but not with a bare `new Date(iso)`. react-big-calendar places an event by the **local** fields of the Date it is given, so the instant has to be moved onto the org timezone's wall clock first, with `toGridDate` from `src/lib/time.ts`. Skipping that places events in whatever timezone the viewer's browser happens to be in, and the cells then disagree with the labels the server produced.

## The contract of `GET /api/calendar/events`
- Query: `start` and `end`, as instants.
- Returns only your own data unless you are an admin asking for someone else's; the decision lives in `src/lib/calendar-access.ts`.
- The response carries `events` and `dailyTotals`.

## How events are built

### Attendance
- One event per session, from its start to its end.
- A session still running is marked open, and its end is filled to now.
- The title carries the times and the duration; day-level totals ride along in `resource`.

### Leave
- Only approved leave is drawn.
- Full days are all-day events running from the start date to the day **after** the end date, because react-big-calendar treats the end as exclusive.
- Half days are timed events. Their hours are not fixed: they come from the org's working-hours setting, via `halfDayIsoRange` in `src/lib/calendar-utils.ts`.

### Missing
- Attendance rows flagged as missing, drawn as all-day events.

## Colours
Event colours are set in `globals.css` through the `rbc-event-*` classes rather than inline styles, so the calendar, the legend and the room grid stay in step. Do not introduce a new colour without checking the existing palette.

## When changing any of this
- Changing the shape means changing three places together: the route, the type in `src/lib/api-types.ts`, and the client.
- Breaking the exclusive-end rule makes every full-day leave look a day short. It is the most common bug here.
- Anything time-related goes through `src/lib/time.ts`. Never write a fixed UTC offset into a string; that bug has already shipped once, and it put leave on the wrong day for every organisation outside Seoul.
