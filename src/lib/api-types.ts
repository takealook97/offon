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
    breakMinutes?: number;
    attendanceStatus?: 'WORKING' | 'ON_BREAK' | 'DONE';
    leaveType?: 'FULL_DAY' | 'HALF_DAY_AM' | 'HALF_DAY_PM';
    leaveStatus?: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    reason?: 'CLOCK_IN' | 'CLOCK_OUT';
    memberName?: string;
    /** Attendance events only. True for a session still running, with a null endAt. The client uses it to choose the midnight-clipped label. */
    isOpenSession?: boolean;
  };
};

export type DailyAttendanceTotal = {
  workedMinutes: number;
  breakMinutes: number;
  attendanceStatus: 'WORKING' | 'ON_BREAK' | 'DONE';
};

export type CalendarEventsResponse =
  | {
      ok: true;
      events: CalendarEvent[];
      /** Local `yyyy-MM-dd` keys mapped to that day's midnight-clipped totals. Only days attendance touches appear. */
      dailyTotals: Record<string, DailyAttendanceTotal>;
    }
  | { ok: false; error: string };

export type LoginRequestBody = { email: string };
export type LoginVerifyBody = { email: string; code: string };

export type ApiOk<T = Record<string, never>> = { ok: true } & T;
export type ApiErr = { ok: false; error: string };
