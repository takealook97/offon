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
    /** Attendance events only. The AttendanceSession id, used to open a correction. */
    sessionId?: number;
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

// ── Meeting-room bookings ──────────────────────────────────────────────
// These never share a screen with attendance and leave events, so CalendarEvent is not
// reused. Its `resource` gathers every kind's optional fields into one flat shape, and
// adding room fields there would force every existing consumer to handle a new case.

export type MeetingType = 'INTERNAL' | 'EXTERNAL';

export type RoomDTO = { id: number; name: string };

export type RoomAttendeeDTO = {
  id: number;
  name: string;
  position: string | null;
  /** A member who has left, soft-deleted. Kept in the list but dimmed, so the record stays true to what happened. */
  inactive: boolean;
};

export type RoomBookingDTO = {
  id: number;
  roomId: number;
  /** Why the room was booked. Doubles as the calendar event title. */
  title: string;
  type: MeetingType;
  /** A UTC ISO string. The client builds its calendar event from `new Date(...)`. */
  start: string;
  end: string;
  organizer: { id: number; name: string };
  attendees: RoomAttendeeDTO[];
  externalAttendees: string | null;
  /** Computed by the server: whether the viewer is the organiser or an admin. */
  canManage: boolean;
};

export type RoomBookingsResponse =
  | ApiOk<{ rooms: RoomDTO[]; bookings: RoomBookingDTO[] }>
  | ApiErr;
