'use client';

import { useTransition } from 'react';
import { format } from 'date-fns';
import { enUS, ko } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/cn';
import type { RoomBookingDTO } from '@/lib/api-types';
import { MEETING_TYPE_KEY } from '@/lib/room-booking';
import { useTranslation } from '@/lib/i18n/client';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
  onEdit,
  onDone,
}: {
  booking: RoomBookingDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useTranslation();
  const [pending, startCancel] = useTransition();
  const start = new Date(booking.start);
  const end = new Date(booking.end);
  const isInternal = booking.type === 'INTERNAL';

  const cancel = () =>
    startCancel(async () => {
      const res = await fetch(`/api/rooms/bookings/${booking.id}`, {
        method: 'DELETE',
      }).catch(() => null);
      if (!res) {
        toast.error(t('room.requestFailed'));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? t('room.cancelFailed'));
        return;
      }
      toast.success(t('room.cancelled'));
      onOpenChange(false);
      onDone();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                isInternal ? 'bg-emerald-500' : 'bg-blue-500',
              )}
            />
            <span className="min-w-0 truncate">{booking.title}</span>
          </DialogTitle>
          <DialogDescription>
            {format(start, 'yyyy-MM-dd (EEE)', { locale: locale === 'en' ? enUS : ko })} {format(start, 'HH:mm')} ~{' '}
            {format(end, 'HH:mm')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Row label={t('room.subject')}>{booking.title}</Row>
          <Row label={t('room.kind')}>{t(MEETING_TYPE_KEY[booking.type])}</Row>
          <Row label={t('room.organizer')}>{booking.organizer.name}</Row>
          {booking.attendees.length > 0 && (
            <Row label={t('room.attendees')}>
              <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                {booking.attendees.map((a) => (
                  <span
                    key={a.id}
                    className={cn(a.inactive && 'text-muted-foreground line-through')}
                  >
                    {a.name}
                    {a.inactive && t('room.leftCompany')}
                  </span>
                ))}
              </span>
            </Row>
          )}
          {booking.externalAttendees && (
            <Row label={t('room.externalRow')}>
              <span className="whitespace-pre-wrap break-words">
                {booking.externalAttendees}
              </span>
            </Row>
          )}
        </div>

        <DialogFooter>
          {booking.canManage ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t('room.cancelBooking')}
              </Button>
              <Button size="sm" onClick={onEdit} disabled={pending}>
                {t('room.edit')}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('room.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
