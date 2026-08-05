'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Calendar, Views, type SlotInfo } from 'react-big-calendar';
import { addWeeks, endOfWeek, format, getDay, startOfWeek } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { CALENDAR_MESSAGES, WEEK_OPTS, formats, localizer } from '@/lib/rbc-localizer';
import type { RoomBookingDTO, RoomBookingsResponse, RoomDTO } from '@/lib/api-types';
import {
  DEFAULT_BOOKING_MINUTES,
  MEETING_TYPE_LABEL,
  ROOM_CLOSE_MINUTES,
  ROOM_OPEN_MINUTES,
  ROOM_STEP_MINUTES,
  bookingsOnDate,
  clampEndToNextBooking,
  defaultEndWall,
  findConflict,
  minutesToHhMm,
  toWallString,
  wallDate,
  type BookingSlot,
} from '@/lib/room-booking';
import { CalendarToolbar } from '../calendar/CalendarToolbar';
import { BookingDialog, type BookingDraft } from './BookingDialog';
import { BookingDetailDialog } from './BookingDetailDialog';

/**
 * Kept at module scope. A fresh Date on every render changes the key of the library's slot cache
 * each time, forcing needless recomputation. Only the hours and minutes are read.
 */
const MIN_TIME = new Date(1970, 0, 1, ROOM_OPEN_MINUTES / 60, 0, 0);
const MAX_TIME = new Date(1970, 0, 1, ROOM_CLOSE_MINUTES / 60, 0, 0);
/** step x timeslots = 60 minutes. A group is exactly an hour, so the gutter is labelled only on the hour. */
const SLOTS_PER_GROUP = 60 / ROOM_STEP_MINUTES;

type UiBooking = {
  id: number;
  title: string;
  start: Date;
  end: Date;
  allDay: false;
  resource: RoomBookingDTO;
};

/** A Date to a wall clock, assuming the browser matches the org timezone, as the rest of the calendar does. */
const toWall = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/**
 * Only the start time goes inside the event. Adding the end fills the width and truncates
 * the title, which is the part people actually need. The full range is in the detail view.
 */
const roomFormats = {
  ...formats,
  eventTimeRangeFormat: ({ start }: { start: Date }) => format(start, 'HH:mm'),
};

/** The next ten-minute boundary after now, in minutes. */
function nextStepMinutes(now: Date): number {
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.ceil(current / ROOM_STEP_MINUTES) * ROOM_STEP_MINUTES;
}

export function RoomCalendar({ viewerId }: { viewerId: number }) {
  const [rooms, setRooms] = useState<RoomDTO[]>([]);
  const [bookings, setBookings] = useState<RoomBookingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [detail, setDetail] = useState<RoomBookingDTO | null>(null);

  const range = useMemo(
    () => ({
      start: startOfWeek(date, WEEK_OPTS),
      end: endOfWeek(date, WEEK_OPTS),
    }),
    [date],
  );

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
    setLoading(true);
    fetch(`/api/rooms/bookings?${qs}`)
      .then((r) => r.json())
      .then((data: RoomBookingsResponse) => {
        if (cancelled) return;
        if (data && 'ok' in data && data.ok) {
          setRooms(data.rooms);
          setBookings(data.bookings);
        } else {
          setRooms([]);
          setBookings([]);
          toast.error(
            (data && 'error' in data && data.error) || 'Could not load the bookings',
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRooms([]);
          setBookings([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, refreshKey]);

  const events: UiBooking[] = useMemo(
    () =>
      bookings.map((b) => ({
        id: b.id,
        title: b.title,
        start: new Date(b.start),
        end: new Date(b.end),
        allDay: false as const,
        resource: b,
      })),
    [bookings],
  );

  /** Wall-clock slots used for overlap checks, covering the whole week on screen. */
  const slots: BookingSlot[] = useMemo(
    () =>
      bookings.map((b) => ({
        id: b.id,
        start: toWall(new Date(b.start)),
        end: toWall(new Date(b.end)),
      })),
    [bookings],
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const eventPropGetter = useCallback(
    (event: UiBooking) => ({
      className:
        event.resource.type === 'INTERNAL'
          ? 'rbc-event-room-internal'
          : 'rbc-event-room-external',
    }),
    [],
  );

  const dayPropGetter = useCallback((d: Date) => {
    const dow = getDay(d);
    if (dow === 0) return { className: 'rbc-day-sun' };
    if (dow === 6) return { className: 'rbc-day-sat' };
    return {};
  }, []);

  /** Stops a drag from running into someone else's booking, by refusing the selection outright. */
  const handleSelecting = useCallback(
    ({ start, end }: { start: Date; end: Date }) =>
      !findConflict(slots, toWall(start), toWall(end)),
    [slots],
  );

  const openDraft = useCallback(
    (startWall: string, endWall: string) => {
      const daySlots = bookingsOnDate(slots, wallDate(startWall));
      const clamped = clampEndToNextBooking(daySlots, startWall, endWall);
      if (!clamped) {
        toast.error('That slot is already booked');
        return;
      }
      setDraft({ mode: 'create', start: startWall, end: clamped });
    },
    [slots],
  );

  const handleSelectSlot = useCallback(
    (slot: SlotInfo) => {
      if (rooms.length === 0) return;
      const now = new Date();
      const day = wallDate(toWall(slot.start));
      const today = wallDate(toWall(now));

      if (day < today) {
        toast.error('A date in the past cannot be booked');
        return;
      }

      // A past slot on today is not refused. The start is pulled forward to the next
      // ten-minute boundary and the dialog opens, where the exact time can be chosen.
      let startWall = toWall(slot.start);
      if (day === today && startWall < toWall(now)) {
        const bumped = Math.max(nextStepMinutes(now), ROOM_OPEN_MINUTES);
        if (bumped >= ROOM_CLOSE_MINUTES) {
          toast.error('There is no bookable time left today');
          return;
        }
        startWall = toWallString(day, bumped);
      }

      // A click gives RBC a single ten-minute slot, so widen it to the default length.
      // A drag keeps the range chosen, unless the start moved, in which case the default length applies.
      const dragged = slot.action === 'select' && toWall(slot.start) === startWall;
      const endWall = dragged
        ? toWall(slot.end)
        : defaultEndWall(startWall, DEFAULT_BOOKING_MINUTES);
      openDraft(startWall, endWall);
    },
    [rooms.length, openDraft],
  );

  // A week spanning New Year (2026-12-28 to 2027-01-03) needs the year on the far end too, or it cannot be read.
  const spansYears = range.start.getFullYear() !== range.end.getFullYear();
  const weekLabel = `${format(range.start, 'd MMMM yyyy')} – ${format(
    range.end,
    spansYears ? 'd MMMM yyyy' : 'd MMMM',
  )}`;

  const draftDayBookings = draft ? bookingsOnDate(slots, wallDate(draft.start)) : [];
  const roomId = rooms[0]?.id;

  return (
    <div className="space-y-3 p-2 sm:p-4">
      <CalendarToolbar
        label={weekLabel}
        onPrev={() => setDate((d) => addWeeks(d, -1))}
        onNext={() => setDate((d) => addWeeks(d, 1))}
        onToday={() => setDate(new Date())}
        right={<Legend />}
      />

      {rooms.length === 0 && !loading ? (
        <p className="rounded-lg border border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No rooms are available
        </p>
      ) : (
        // On mobile all seven days stay and the grid scrolls sideways (.rbc-rooms-scroll in
        <div className="rbc-rooms-scroll">
          <div
            className={cn(
              'rbc-rooms h-[calc(100svh-260px)] min-h-[520px] transition-opacity',
              loading && 'opacity-70',
            )}
            // Used to draw the closing-time label (:last-child::after in globals.css),
            // because RBC labels only the start of each group and so omits the last hour.
            style={
              {
                '--room-close-label': `'${minutesToHhMm(ROOM_CLOSE_MINUTES)}'`,
              } as CSSProperties
            }
          >
            <Calendar
              localizer={localizer}
              culture="ko"
              formats={roomFormats}
              events={events}
              view={Views.WEEK}
              onView={() => {}}
              views={[Views.WEEK]}
              defaultView={Views.WEEK}
              date={date}
              onNavigate={setDate}
              toolbar={false}
              startAccessor="start"
              endAccessor="end"
              allDayAccessor="allDay"
              step={ROOM_STEP_MINUTES}
              timeslots={SLOTS_PER_GROUP}
              min={MIN_TIME}
              max={MAX_TIME}
              scrollToTime={MIN_TIME}
              // 'ignoreEvents' keeps a drag begun on top of an event from turning into a slot selection.
              selectable="ignoreEvents"
              // On touch a short swipe passes through as horizontal scrolling; only a held press starts a selection.
              longPressThreshold={400}
              onSelectSlot={handleSelectSlot}
              onSelecting={handleSelecting}
              onSelectEvent={(e: UiBooking) => setDetail(e.resource)}
              eventPropGetter={eventPropGetter}
              dayPropGetter={dayPropGetter}
              messages={CALENDAR_MESSAGES}
              style={{ height: '100%' }}
            />
          </div>
        </div>
      )}

      {draft && roomId !== undefined && (
        <BookingDialog
          key={`${draft.mode}-${draft.booking?.id ?? draft.start}`}
          draft={draft}
          roomId={roomId}
          viewerId={viewerId}
          dayBookings={draftDayBookings}
          open
          onOpenChange={(o) => !o && setDraft(null)}
          onDone={refresh}
        />
      )}

      {detail && (
        <BookingDetailDialog
          key={detail.id}
          booking={detail}
          open
          onOpenChange={(o) => !o && setDetail(null)}
          onEdit={() => {
            setDraft({
              mode: 'edit',
              start: toWall(new Date(detail.start)),
              end: toWall(new Date(detail.end)),
              booking: detail,
            });
            setDetail(null);
          }}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function Legend() {
  // The dot colours match the grid event colours (rbc-event-room-* in globals.css),
  // following the same convention as the other calendar's legend: blue for leave, green for work.
  return (
    <ul className="flex items-center gap-3 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-emerald-500" />
        {MEETING_TYPE_LABEL.INTERNAL}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-blue-500" />
        {MEETING_TYPE_LABEL.EXTERNAL}
      </li>
    </ul>
  );
}
