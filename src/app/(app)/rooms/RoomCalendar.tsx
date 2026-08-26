'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Calendar, Views, type SlotInfo } from 'react-big-calendar';
import { addDays, addWeeks, endOfWeek, format, getDay, startOfWeek } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { calendarMessages, WEEK_OPTS, calendarFormats, localizer } from '@/lib/rbc-localizer';
import type { RoomBookingDTO, RoomBookingsResponse, RoomDTO } from '@/lib/api-types';
import {
  DEFAULT_BOOKING_MINUTES,
  MEETING_TYPE_KEY,
  type RoomHours,
  ROOM_STEP_MINUTES,
  bookingsOnDate,
  clampEndToNextBooking,
  defaultEndWall,
  findConflict,
  minutesToHhMm,
  toWallString,
  wallDate,
  wallMinutes,
  type BookingSlot,
} from '@/lib/room-booking';
import { CalendarToolbar } from '../calendar/CalendarToolbar';
import { BookingDialog, type BookingDraft } from './BookingDialog';
import { BookingDetailDialog } from './BookingDetailDialog';
import { useTranslation } from '@/lib/i18n/client';
import { toGridDate, gridNow, fromGridDate } from '@/lib/time';

/**
 * Kept at module scope. A fresh Date on every render changes the key of the library's slot cache
 * each time, forcing needless recomputation. Only the hours and minutes are read.
 */

/** step x timeslots = 60 minutes. A group is exactly an hour, so the gutter is labelled only on the hour. */
const SLOTS_PER_GROUP = 60 / ROOM_STEP_MINUTES;

/**
 * Where a touch stops being a tap and becomes a press-and-drag, in milliseconds.
 * It has to match the library's own threshold, which clears its long-press timer on touchend, so
 * Letting go inside this window runs only our tap handling; holding past it runs only the library's
 * drag selection. If the two numbers disagree, one touch either opens the dialog twice or not at all.
 */
const LONG_PRESS_MS = 400;

/** Move further than this and it is a scroll, not a tap (px). */
const TAP_SLOP_PX = 10;

type UiBooking = {
  id: number;
  title: string;
  start: Date;
  end: Date;
  allDay: false;
  resource: RoomBookingDTO;
};

/** A grid Date to a wall-clock string. In grid coordinates the local fields are the org's wall clock. */
const toWall = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/**
 * Only the start time goes inside the event. Adding the end fills the width and truncates
 * the title, which is the part people actually need. The full range is in the detail view.
 */
const roomFormats = (locale: 'ko' | 'en') => ({
  ...calendarFormats(locale),
  eventTimeRangeFormat: ({ start }: { start: Date }) => format(start, 'HH:mm'),
});

/** The next ten-minute boundary after now, in minutes. */
function nextStepMinutes(now: Date): number {
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.ceil(current / ROOM_STEP_MINUTES) * ROOM_STEP_MINUTES;
}

export function RoomCalendar({ viewerId, hours }: { viewerId: number; hours: RoomHours }) {
  // The grid's min and max must match what validation uses. If they drift, a slot can be clicked but is then refused.
  const minTime = useMemo(() => new Date(1970, 0, 1, hours.openMinutes / 60, 0, 0), [hours]);
  const maxTime = useMemo(() => new Date(1970, 0, 1, hours.closeMinutes / 60, 0, 0), [hours]);
  const { t, locale } = useTranslation();
  const [rooms, setRooms] = useState<RoomDTO[]>([]);
  const [bookings, setBookings] = useState<RoomBookingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(gridNow);
  const [refreshKey, setRefreshKey] = useState(0);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [detail, setDetail] = useState<RoomBookingDTO | null>(null);

  /**
   * Stops the click that dismissed the dialog from carrying on into the calendar and
   * immediately opening a new booking.
   *
   * Radix closes on pointerdown while RBC listens for mousedown. The overlay is already
   * gone in between, so RBC's elementFromPoint check finds the calendar cell underneath.
   */
  /** The calendar root that tap coordinates are resolved against to get a date and time. */
  const gridRef = useRef<HTMLDivElement>(null);

  const reopenBlockedUntil = useRef(0);
  const closeDialogs = useCallback(() => {
    reopenBlockedUntil.current = Date.now() + 300;
    setDraft(null);
    setDetail(null);
  }, []);

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
      // The range is in grid coordinates, so convert it back to real instants before sending.
      start: fromGridDate(range.start).toISOString(),
      end: fromGridDate(range.end).toISOString(),
    });
    // This screen fetches inside an effect rather than through a data library. The loading flag
    // is set immediately before the request, which is not the cascading render the lint rule warns about.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
            (data && 'error' in data && data.error) || t('room.loadFailed'),
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
  }, [range.start, range.end, refreshKey, t]);

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
        start: toWall(toGridDate(new Date(b.start))),
        end: toWall(toGridDate(new Date(b.end))),
      })),
    [bookings],
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  /** Moving a week at a time. Shared by the toolbar buttons and the arrow keys. */
  const shiftWeek = useCallback((delta: number) => setDate((d) => addWeeks(d, delta)), []);

  // Left and right arrows move a week, but not while typing or while a dialog or dropdown is open.
  // Those already use the arrow keys, and shifting the week behind them loses the context.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return;
      e.preventDefault();
      shiftWeek(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shiftWeek]);

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

      // If the start lands inside an existing booking, push it to where that booking ends.
      // Clicking a past slot pulls the start forward to now, and if a meeting happens to be
      // running right then, it used to be refused as already booked for no visible reason.
      // Repeating lets it step over back-to-back bookings, bounded by the slots in a day.
      let start = startWall;
      for (let i = 0; i < daySlots.length + 1; i += 1) {
        const blocking = daySlots.find((b) => b.start <= start && b.end > start);
        if (!blocking) break;
        start = blocking.end;
      }
      if (wallMinutes(start) >= hours.closeMinutes) {
        toast.error(t('room.dayFull'));
        return;
      }

      // Once the start has moved, the original end means nothing, so fall back to the default length.
      const end = start === startWall ? endWall : defaultEndWall(start, hours.closeMinutes);
      const clamped = clampEndToNextBooking(daySlots, start, end);
      if (!clamped) {
        toast.error(t('room.slotTaken'));
        return;
      }
      setDraft({ mode: 'create', start, end: clamped });
    },
    [slots, t, hours],
  );

  /**
   * Opens the booking dialog at the chosen start. Past days are refused; a past slot on
   * today is pulled forward to the next ten-minute boundary. The exact time can be adjusted
   * in the dialog, so the click itself is not blocked.
   */
  const openFromSlot = useCallback(
    (startWall: string, draggedEnd: string | null) => {
      if (rooms.length === 0) return;
      // Ignore this if it is the click that just dismissed the dialog leaking through.
      if (Date.now() < reopenBlockedUntil.current) return;

      const now = gridNow();
      const day = wallDate(startWall);
      const today = wallDate(toWall(now));
      if (day < today) {
        toast.error(t('room.pastDate'));
        return;
      }

      let start = startWall;
      if (day === today && start < toWall(now)) {
        const bumped = Math.max(nextStepMinutes(now), hours.openMinutes);
        if (bumped >= hours.closeMinutes) {
          toast.error(t('room.pastTimeToday'));
          return;
        }
        start = toWallString(day, bumped);
      }

      // Keep the end the drag produced. Even when the start is pulled forward to now, an end
      // after that is used as-is, so the remaining part of a range dragged from the past is not thrown away.
      const end =
        draggedEnd && draggedEnd > start
          ? draggedEnd
          : defaultEndWall(start, hours.closeMinutes, DEFAULT_BOOKING_MINUTES);
      openDraft(start, end);
    },
    [rooms.length, openDraft, t, hours],
  );

  const handleSelectSlot = useCallback(
    (slot: SlotInfo) => {
      // A click gives RBC a single ten-minute slot, so widen it to the default length.
      openFromSlot(toWall(slot.start), slot.action === 'select' ? toWall(slot.end) : null);
    },
    [openFromSlot],
  );

  /**
   * The path taken when the calendar is tapped on a touch screen.
   *
   * On touch, RBC only starts a slot selection from a long press. A touchmove or touchend
   * while its timer runs cancels it, so a short tap never fires at all, and with horizontal
   * scrolling in the mix nothing but a deliberate press opens a booking. So we resolve the
   * tap's coordinates into a date and time ourselves.
   */
  const slotFromPoint = useCallback(
    (clientX: number, clientY: number): string | null => {
      const root = gridRef.current;
      if (!root) return null;
      const cols = [
        ...root.querySelectorAll<HTMLElement>('.rbc-time-content .rbc-day-slot'),
      ];
      if (cols.length === 0) return null;

      const col = cols.find((c) => {
        const r = c.getBoundingClientRect();
        return clientX >= r.left && clientX < r.right;
      });
      if (!col) return null;

      const day = format(addDays(range.start, cols.indexOf(col)), 'yyyy-MM-dd');
      const r = col.getBoundingClientRect();
      // A tap outside the grid, such as on a day header, opens at the start of that day.
      const withinGrid = clientY >= r.top && clientY < r.bottom;
      const minutes = withinGrid
        ? hours.openMinutes +
          ((clientY - r.top) / r.height) * (hours.closeMinutes - hours.openMinutes)
        : hours.openMinutes;

      const snapped = Math.floor(minutes / ROOM_STEP_MINUTES) * ROOM_STEP_MINUTES;
      const clamped = Math.min(
        Math.max(snapped, hours.openMinutes),
        hours.closeMinutes - ROOM_STEP_MINUTES,
      );
      return toWallString(day, clamped);
    },
    [range.start, hours],
  );

  const touchStartRef = useRef<{ x: number; y: number; at: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Named touch so it does not shadow the translation function t.
    const touch = e.touches[0];
    touchStartRef.current = touch
      ? { x: touch.clientX, y: touch.clientY, at: Date.now() }
      : null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;

      const t = e.changedTouches[0];
      if (!t) return;
      // If it moved it was a scroll, and if it was held it belongs to RBC's long-press selection. Leave both alone.
      const moved = Math.hypot(t.clientX - start.x, t.clientY - start.y);
      if (moved > TAP_SLOP_PX || Date.now() - start.at > LONG_PRESS_MS) return;
      // Tapping a booking block belongs to onSelectEvent, which opens its detail.
      if ((e.target as HTMLElement).closest('.rbc-event')) return;

      const startWall = slotFromPoint(t.clientX, t.clientY);
      if (startWall) openFromSlot(startWall, null);
    },
    [slotFromPoint, openFromSlot],
  );

  // A week spanning New Year (2026-12-28 to 2027-01-03) needs the year on the far end too, or it cannot be read.
  const spansYears = range.start.getFullYear() !== range.end.getFullYear();
  const weekLabel = `${format(range.start, 'yyyy-MM-dd')} – ${format(
    range.end,
    spansYears ? 'yyyy-MM-dd' : 'MM-dd',
  )}`;

  const draftDayBookings = draft ? bookingsOnDate(slots, wallDate(draft.start)) : [];
  const roomId = rooms[0]?.id;

  return (
    <div className="space-y-3 p-2 sm:p-4">
      <CalendarToolbar
        label={weekLabel}
        onPrev={() => shiftWeek(-1)}
        onNext={() => shiftWeek(1)}
        onToday={() => setDate(gridNow())}
        right={<Legend />}
      />

      {rooms.length === 0 && !loading ? (
        <p className="rounded-lg border border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t('room.none')}
        </p>
      ) : (
        // On mobile all seven days stay and the grid scrolls sideways (.rbc-rooms-scroll in
        // globals.css). The height belongs to the scroll wrapper: on mobile it has to own both
        // axes, or the sticky time gutter will not follow horizontal movement.
        <div className="rbc-rooms-scroll h-[calc(100svh-260px)] min-h-[520px]">
          <div
            ref={gridRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className={cn('rbc-rooms h-full transition-opacity', loading && 'opacity-70')}
            // Used to draw the closing-time label (:last-child::after in globals.css),
            // because RBC labels only the start of each group and so omits the last hour.
            style={
              {
                '--room-close-label': `'${minutesToHhMm(hours.closeMinutes)}'`,
              } as CSSProperties
            }
          >
            <Calendar
              localizer={localizer}
              // RBC's idea of today defaults to the local clock. Make it follow the org timezone.
              getNow={gridNow}
              culture="ko"
              formats={roomFormats(locale)}
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
              min={minTime}
              max={maxTime}
              scrollToTime={minTime}
              // 'ignoreEvents' keeps a drag begun on top of an event from turning into a slot selection.
              selectable="ignoreEvents"
              // On touch a short swipe passes through as horizontal scrolling; only a held press starts a selection.
              // Short taps are picked up by handleTouchEnd above, which shares this threshold.
              longPressThreshold={LONG_PRESS_MS}
              onSelectSlot={handleSelectSlot}
              onSelecting={handleSelecting}
              onSelectEvent={(e: UiBooking) => setDetail(e.resource)}
              eventPropGetter={eventPropGetter}
              dayPropGetter={dayPropGetter}
              messages={calendarMessages(t)}
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
          hours={hours}
          dayBookings={draftDayBookings}
          open
          onOpenChange={(o) => !o && closeDialogs()}
          onDone={refresh}
        />
      )}

      {detail && (
        <BookingDetailDialog
          key={detail.id}
          booking={detail}
          open
          onOpenChange={(o) => !o && closeDialogs()}
          onEdit={() => {
            setDraft({
              mode: 'edit',
              start: toWall(toGridDate(new Date(detail.start))),
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
  const { t } = useTranslation();
  // The dot colours match the grid event colours (rbc-event-room-* in globals.css),
  // following the same convention as the other calendar's legend: blue for leave, green for work.
  return (
    <ul className="flex items-center gap-3 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-emerald-500" />
        {t(MEETING_TYPE_KEY.INTERNAL)}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-blue-500" />
        {t(MEETING_TYPE_KEY.EXTERNAL)}
      </li>
    </ul>
  );
}
