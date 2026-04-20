---
name: calendar-events
description: offon 캘린더(react-big-calendar) 이벤트 데이터 shape, `/api/calendar/events` 응답 규약, 근태·연차·누락 표시 패턴 작업에 반드시 사용. "캘린더에 X 표시 추가", "캘린더 색상 바꿔줘", "이벤트 shape 수정" 요청에 트리거.
---

# 캘린더 이벤트 규약

## 라이브러리
- `react-big-calendar` (MIT) + `date-fns` localizer
- 월/주/일 뷰 기본 제공

## 이벤트 shape (API 응답 + 클라이언트 공통)
```ts
// src/lib/api-types.ts
export type CalendarEventKind = 'ATTENDANCE' | 'LEAVE' | 'MISSING';

export type CalendarEvent = {
  id: string;                        // 고유 ID (kind + 원본 PK)
  title: string;                     // 표시 제목
  start: string;                     // ISO 8601 (KST로 계산된 UTC ISO)
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
클라이언트에서는 `start`/`end`를 `new Date(iso)`로 변환해 `react-big-calendar`에 전달.

## API 규약 — `GET /api/calendar/events`
- Query: `start=YYYY-MM-DD&end=YYYY-MM-DD` (KST 기준)
- 본인 데이터만 반환. `requireSession()` 적용.
- 응답:
  ```json
  { "events": [ { /* CalendarEvent */ } ] }
  ```

## 생성 규칙
### ATTENDANCE
- `clockInAt`/`clockOutAt`이 둘 다 존재하면 1개 이벤트:
  - `start = clockInAt`, `end = clockOutAt`, `allDay = false`
  - `title = "출근 09:00 - 퇴근 18:00 (480분)"` 같은 형식
- `clockInAt`만 있는 진행 중 기록은 `status='WORKING'`, `end` 생략 가능(전용 표시).

### LEAVE
- `APPROVED` 또는 `REQUESTED`만 표시 (`REJECTED`는 생략).
- `FULL_DAY`: `allDay=true`, `start = startDate`, `end = endDate + 1day`(react-big-calendar은 end exclusive).
- `HALF_DAY_AM`/`HALF_DAY_PM`: `allDay=false`, 임의 시간대(AM: 09:00~13:00, PM: 13:00~18:00).
- `title`은 `{이름} 연차(종일)` / `(오전)` / `(오후)`, `leaveStatus='REQUESTED'`는 `[대기]` prefix.

### MISSING
- 과거 평일 중 `status='MISSING'`인 `Attendance` 엔트리만 표시.
- `allDay=true`, `title='근태 누락'`.

## 색상 매핑 (클라이언트)
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
`react-big-calendar/lib/css/react-big-calendar.css`를 `globals.css`에서 `@import` 또는 컴포넌트 상단에서 import.

## 변경 시 주의
- shape을 바꾸면 backend, API type, frontend 3곳을 함께 수정.
- `end` exclusive 규칙을 어기면 `FULL_DAY` 연차가 하루 짧아 보인다(흔한 버그).
