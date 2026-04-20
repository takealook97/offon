---
name: calendar-events
description: The shape of the calendar's events, the contract of the events endpoint, and how attendance, leave and missing records are drawn. Use it for anything touching the calendar.
---

# Calendar event conventions

## The library
- `react-big-calendar` (MIT) + `date-fns` localizer
- Month, week and day views come with it

## The event shape, shared by the API and the client
```ts
// src/lib/api-types.ts
export type CalendarEventKind = 'ATTENDANCE' | 'LEAVE' | 'MISSING';

export type CalendarEvent = {
  id: string;                        // unique: the kind plus the source primary key
  title: string;                     // what is displayed
  start: string;                     // a UTC ISO 8601 instant
  end: string;                       // ISO 8601
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
The client converts start and end into Dates before handing them to react-big-calendar.

## The contract of `GET /api/calendar/events`
- Query: a start and an end date
- Returns only your own data, behind a session check.
- The response:
  ```json
  { "events": [ { /* CalendarEvent */ } ] }
  ```

## How events are built
### ATTENDANCE
- With both a clock-in and a clock-out, one event:
  - `start = clockInAt`, `end = clockOutAt`, `allDay = false`
  - The title carries the times and the duration
- A record with only a clock-in is still running and may omit its end.

### LEAVE
- Only approved and pending leave is drawn; rejected is omitted.
- A full day is an all-day event running to the day after its end, because the library treats the end as exclusive.
- Half days are timed events, morning and afternoon.
- The title carries the name and which kind of leave it is, with a pending prefix where it applies.

### MISSING
- Only attendance rows flagged as missing on a past weekday are drawn.
- `allDay=true`, `title='Missing'`.

## Colours
```ts
function eventStyleGetter(event: CalendarEvent) {
  const colors = {
    ATTENDANCE: '#10b981', // emerald
    LEAVE: event.resource.leaveStatus === 'REQUESTED' ? '#f59e0b' : '#3b82f6', // amber / blue
    MISSING: '#ef4444', // red
  };
  return { style: { backgroundColor: colors[event.resource.kind], borderColor: colors[event.resource.kind] } };
}
```

## Localizer (`src/app/(app)/calendar/page.tsx`)
```ts
'use client';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { ko } });
```

## CSS
Import the library's stylesheet, either from `globals.css` or at the top of the component.

## When changing any of this
- Changing the shape means changing three places together: the route, the type and the client.
- Breaking the exclusive-end rule makes every full-day leave look a day short. It is the most common bug here.
