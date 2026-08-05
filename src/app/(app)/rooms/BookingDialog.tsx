'use client';

import { useMemo, useState, useTransition } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import type { RoomBookingDTO } from '@/lib/api-types';
import {
  MEETING_TYPES,
  MEETING_TYPE_LABEL,
  ROOM_CLOSE_MINUTES,
  ROOM_OPEN_MINUTES,
  ROOM_STEP_MINUTES,
  findConflict,
  minutesToHhMm,
  toWallString,
  validateBookingRange,
  wallMinutes,
  type BookingSlot,
  type MeetingTypeValue,
} from '@/lib/room-booking';
import { AttendeePicker, type AttendeeOption } from './AttendeePicker';

type Item = [value: string, label: string];

/** The bookable hours. The last one is an end time only; the predicate below rules it out as a start. */
const HOUR_ITEMS: Item[] = Array.from(
  { length: ROOM_CLOSE_MINUTES / 60 - ROOM_OPEN_MINUTES / 60 + 1 },
  (_, i) => {
    const h = ROOM_OPEN_MINUTES / 60 + i;
    return [String(h).padStart(2, '0'), `${h}h`];
  },
);

const MIN_ITEMS: Item[] = Array.from({ length: 60 / ROOM_STEP_MINUTES }, (_, i) => {
  const m = i * ROOM_STEP_MINUTES;
  return [String(m).padStart(2, '0'), `${m}m`];
});

function TimeSel({
  value,
  onValueChange,
  items,
  isDisabled,
  label,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: Item[];
  isDisabled?: (v: string) => boolean;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 w-[76px] shrink-0 px-2.5" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {items.map(([v, text]) => (
          <SelectItem key={v} value={v} disabled={isDisabled?.(v)}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const hourOf = (wall: string) => wall.slice(11, 13);
const minuteOf = (wall: string) => wall.slice(14, 16);

/** Assumes the browser clock matches the org timezone, as the rest of the calendar does. */
const nowWall = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");

export type BookingDraft = {
  mode: 'create' | 'edit';
  start: string;
  end: string;
  booking?: RoomBookingDTO;
};

export function BookingDialog({
  draft,
  roomId,
  viewerId,
  dayBookings,
  open,
  onOpenChange,
  onDone,
}: {
  draft: BookingDraft;
  roomId: number;
  viewerId: number;
  /** Confirmed bookings on the same day, so a clash is caught before submitting and a round trip is saved. */
  dayBookings: BookingSlot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const editingId = draft.mode === 'edit' ? draft.booking?.id : undefined;

  const [start, setStart] = useState(draft.start);
  const [end, setEnd] = useState(draft.end);
  const [type, setType] = useState<MeetingTypeValue>(draft.booking?.type ?? 'INTERNAL');
  const [title, setTitle] = useState(draft.booking?.title ?? '');
  const [attendees, setAttendees] = useState<AttendeeOption[]>(
    (draft.booking?.attendees ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      position: a.position,
      role: 'EMPLOYEE' as const,
    })),
  );
  const [externalAttendees, setExternalAttendees] = useState(
    draft.booking?.externalAttendees ?? '',
  );
  const [pending, startSubmit] = useTransition();

  const dateStr = start.slice(0, 10);
  const dateLabel = format(new Date(`${dateStr}T00:00:00`), 'EEE, d MMM yyyy', {
    locale: ko,
  });

  const setStartPart = (hour: string, minute: string) =>
    setStart(`${dateStr}T${hour}:${minute}`);
  const setEndPart = (hour: string, minute: string) =>
    setEnd(`${dateStr}T${hour}:${minute}`);

  /**
   * An option is enabled when the candidate time passes the rules.
   * An hour counts as available when any slot inside it does.
   */
  const now = nowWall();
  const startAllowed = (candidate: string) =>
    validateBookingRange(candidate, toWallString(dateStr, ROOM_CLOSE_MINUTES), now).ok;
  const endAllowed = (candidate: string) => validateBookingRange(start, candidate, now).ok;

  const startHourDisabled = (h: string) =>
    !MIN_ITEMS.some(([m]) => startAllowed(`${dateStr}T${h}:${m}`));
  const startMinuteDisabled = (m: string) =>
    !startAllowed(`${dateStr}T${hourOf(start)}:${m}`);
  const endHourDisabled = (h: string) =>
    !MIN_ITEMS.some(([m]) => endAllowed(`${dateStr}T${h}:${m}`));
  const endMinuteDisabled = (m: string) => !endAllowed(`${dateStr}T${hourOf(end)}:${m}`);

  const rangeCheck = validateBookingRange(start, end, now);
  const conflict = useMemo(
    () => findConflict(dayBookings, start, end, editingId),
    [dayBookings, start, end, editingId],
  );

  const error = !rangeCheck.ok
    ? rangeCheck.error
    : conflict
      ? `That time already has a booking from ${minutesToHhMm(wallMinutes(conflict.start))} to ${minutesToHhMm(
          wallMinutes(conflict.end),
        )} is already booked`
      : null;

  const canSubmit = !error && title.trim().length > 0;

  const submit = () =>
    startSubmit(async () => {
      const payload = {
        roomId,
        type,
        title: title.trim(),
        start,
        end,
        memberIds: attendees.map((a) => a.id),
        externalAttendees: externalAttendees.trim() || null,
      };
      const url =
        draft.mode === 'edit' ? `/api/rooms/bookings/${editingId}` : '/api/rooms/bookings';
      const res = await fetch(url, {
        method: draft.mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (!res) {
        toast.error('Request failed');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Request failed');
        // On a 409, where someone booked it first, only the view refreshes and the dialog stays open.
        // So the reason and attendees already typed survive and only the time has to change.
        if (res.status === 409) onDone();
        return;
      }
      toast.success(draft.mode === 'edit' ? 'Booking updated' : 'Room booked');
      onOpenChange(false);
      onDone();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {draft.mode === 'edit' ? 'Edit booking' : 'Book a room'}
          </DialogTitle>
          <DialogDescription>{dateLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Time</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <TimeSel
                label="Start hour"
                value={hourOf(start)}
                onValueChange={(h) => setStartPart(h, minuteOf(start))}
                items={HOUR_ITEMS}
                isDisabled={startHourDisabled}
              />
              <TimeSel
                label="Start minute"
                value={minuteOf(start)}
                onValueChange={(m) => setStartPart(hourOf(start), m)}
                items={MIN_ITEMS}
                isDisabled={startMinuteDisabled}
              />
              <span className="px-0.5 text-sm text-muted-foreground">~</span>
              <TimeSel
                label="End hour"
                value={hourOf(end)}
                onValueChange={(h) => setEndPart(h, minuteOf(end))}
                items={HOUR_ITEMS}
                isDisabled={endHourDisabled}
              />
              <TimeSel
                label="End minute"
                value={minuteOf(end)}
                onValueChange={(m) => setEndPart(hourOf(end), m)}
                items={MIN_ITEMS}
                isDisabled={endMinuteDisabled}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="booking-title">Subject</Label>
            <Input
              id="booking-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Sprint retro"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-1.5">
              {MEETING_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={type === t ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => setType(t)}
                >
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      t === 'INTERNAL' ? 'bg-emerald-500' : 'bg-blue-500',
                    )}
                  />
                  {MEETING_TYPE_LABEL[t]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Attendees</Label>
            <AttendeePicker value={attendees} onChange={setAttendees} excludeId={viewerId} />
          </div>

          {type === 'EXTERNAL' && (
            <div className="space-y-1.5">
              <Label htmlFor="booking-external">External attendees</Label>
              <Textarea
                id="booking-external"
                value={externalAttendees}
                onChange={(e) => setExternalAttendees(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. Jane Doe (Acme), John Smith (Globex)"
              />
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <Info className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelled
          </Button>
          <Button size="sm" onClick={submit} disabled={pending || !canSubmit}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {draft.mode === 'edit' ? 'Edit' : 'Book'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
