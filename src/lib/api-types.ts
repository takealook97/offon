export type CalendarEventKind = 'ATTENDANCE' | 'LEAVE' | 'MISSING';

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  resource: {
    kind: CalendarEventKind;
    workedMinutes?: number;
    overtimeMinutes?: number;
    attendanceStatus?: 'WORKING' | 'DONE';
    leaveType?: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';
    leaveStatus?: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    reason?: 'CLOCK_IN' | 'CLOCK_OUT';
    memberName?: string;
  };
};

export type CalendarEventsResponse = { events: CalendarEvent[] };

export type LoginRequestBody = { email: string };
export type LoginVerifyBody = { email: string; code: string };

export type ApiOk<T = Record<string, never>> = { ok: true } & T;
export type ApiErr = { ok: false; error: string };
