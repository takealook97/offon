'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/client';

type PendingItem = { id: number; dateLabel: string; before: string; after: string };

export function PendingEditRequests({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch('/api/attendance/edit/pending')
      .then((r) => r.json())
      .then((d: { ok?: boolean; items?: PendingItem[] }) => {
        if (d?.ok && d.items) setItems(d.items);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const cancel = (id: number) => {
    setBusy(id);
    fetch('/api/attendance/edit/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((r) => r.json())
      .then((d: { ok?: boolean; error?: string }) => {
        if (d?.ok) {
          toast.success(t('cal.cancelled'));
          load();
        } else {
          toast.error(d?.error ?? t('cal.cancelFailed'));
        }
      })
      .catch(() => toast.error(t('cal.cancelFailed')))
      .finally(() => setBusy(null));
  };

  if (!loaded || items.length === 0) return null;

  return (
    <section className="rounded-lg border border-border/60 bg-card">
      <header className="border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('cal.pendingEdits', { count: items.length })}
        </h3>
      </header>
      <ul className="divide-y divide-border/60">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-mono text-xs tabular-nums text-muted-foreground">{it.dateLabel}</p>
              <p className="truncate text-muted-foreground line-through">{it.before}</p>
              <p className="truncate font-medium">{it.after}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancel(it.id)}
              disabled={busy === it.id}
              className="shrink-0 gap-1.5 self-end border-destructive/40 text-destructive hover:bg-destructive/10 sm:self-auto"
            >
              <X className="size-3.5" />
              {t('common.cancel')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
