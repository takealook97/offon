'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/lib/i18n/client';
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
  const { t } = useTranslation();
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
        toast.error(data.error ?? t('settings.saveFailed'));
        return;
      }
      toast.success(next ? t('settings.notifyOn') : t('settings.notifyOff'));
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <BellRing className="size-3.5" /> {t('settings.notifications')}
          </CardDescription>
          <CardTitle className="text-lg">{t('settings.missingInTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                htmlFor="missing-clockin-toggle"
                className="text-sm font-medium"
              >
                {t('settings.missingInSwitch')}
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('settings.missingInBody')} {t('settings.missingInExample')}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('settings.missingInHint')}
              </p>
            </div>
            <Switch
              id="missing-clockin-toggle"
              checked={state.missingClockInNotifyEnabled}
              onCheckedChange={(v) =>
                toggle('missingClockInNotifyEnabled', v)
              }
              disabled={pending}
              aria-label={t('settings.missingInToggle')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <BellRing className="size-3.5" /> {t('settings.notifications')}
          </CardDescription>
          <CardTitle className="text-lg">{t('settings.missingOutTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                htmlFor="missing-clockout-toggle"
                className="text-sm font-medium"
              >
                {t('settings.missingOutSwitch')}
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('settings.missingOutBody')} {t('settings.missingOutExample')}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('settings.missingOutHint')}
              </p>
            </div>
            <Switch
              id="missing-clockout-toggle"
              checked={state.missingClockOutNotifyEnabled}
              onCheckedChange={(v) =>
                toggle('missingClockOutNotifyEnabled', v)
              }
              disabled={pending}
              aria-label={t('settings.missingOutToggle')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
