'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type SettingKey =
  | 'missingClockInNotifyEnabled'
  | 'missingClockOutNotifyEnabled';

type Props = {
  initial: {
    missingClockInNotifyEnabled: boolean;
    missingClockOutNotifyEnabled: boolean;
    updatedAt: Date;
  };
};

export function SettingsPanel({ initial }: Props) {
  const [state, setState] = useState({
    missingClockInNotifyEnabled: initial.missingClockInNotifyEnabled,
    missingClockOutNotifyEnabled: initial.missingClockOutNotifyEnabled,
  });
  const [pending, start] = useTransition();

  const toggle = (key: SettingKey, next: boolean) => {
    const prev = state[key];
    setState((s) => ({ ...s, [key]: next }));
    start(async () => {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setState((s) => ({ ...s, [key]: prev }));
        toast.error(data.error ?? 'Could not save the settings');
        return;
      }
      toast.success(next ? 'Reminders on' : 'Reminders off');
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <BellRing className="size-3.5" /> Reminders
          </CardDescription>
          <CardTitle className="text-lg">Missing clock-in DM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                htmlFor="missing-clockin-toggle"
                className="text-sm font-medium"
              >
                Send a 10:00 missing clock-in reminder
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Each weekday morning, anyone with no clock-in, leave aside,
                is sent a DM reading &ldquo;There is no clock-in recorded
                yet. Please take a look.&rdquo;
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nothing is sent right away; it starts on the next weekday at 10:00.
              </p>
            </div>
            <Switch
              id="missing-clockin-toggle"
              checked={state.missingClockInNotifyEnabled}
              onCheckedChange={(v) =>
                toggle('missingClockInNotifyEnabled', v)
              }
              disabled={pending}
              aria-label="Toggle missing clock-in DMs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <BellRing className="size-3.5" /> Reminders
          </CardDescription>
          <CardTitle className="text-lg">Missing clock-out DM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                htmlFor="missing-clockout-toggle"
                className="text-sm font-medium"
              >
                Send a 19:00 missing clock-out reminder
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Each weekday evening, anyone who clocked in but not out
                is sent a DM reading &ldquo;There is no clock-out recorded
                yet. Please clock out.&rdquo;
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nothing is sent right away; it starts on the next weekday at 19:00.
              </p>
            </div>
            <Switch
              id="missing-clockout-toggle"
              checked={state.missingClockOutNotifyEnabled}
              onCheckedChange={(v) =>
                toggle('missingClockOutNotifyEnabled', v)
              }
              disabled={pending}
              aria-label="Toggle missing clock-out DMs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
