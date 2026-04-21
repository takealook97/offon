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
        toast.error(data.error ?? '설정 저장에 실패했습니다');
        return;
      }
      toast.success(next ? '알림을 켰습니다' : '알림을 껐습니다');
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <BellRing className="size-3.5" /> 알림
          </CardDescription>
          <CardTitle className="text-lg">미출근 Slack DM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                htmlFor="missing-clockin-toggle"
                className="text-sm font-medium"
              >
                오전 10시 미출근 알림 전송
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                매 평일 오전 10시에 출근 기록이 없는 직원(연차·반차 제외)에게
                Slack DM을 보냅니다. 메시지: &ldquo;오전 10시 기준 출근 기록이
                없습니다. 확인 부탁드립니다.&rdquo;
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                켜는 즉시 전송되지는 않으며, 다음 평일 오전 10시부터 작동합니다.
              </p>
            </div>
            <Switch
              id="missing-clockin-toggle"
              checked={state.missingClockInNotifyEnabled}
              onCheckedChange={(v) =>
                toggle('missingClockInNotifyEnabled', v)
              }
              disabled={pending}
              aria-label="미출근 Slack DM 알림 토글"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <BellRing className="size-3.5" /> 알림
          </CardDescription>
          <CardTitle className="text-lg">미퇴근 Slack DM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label
                htmlFor="missing-clockout-toggle"
                className="text-sm font-medium"
              >
                오후 7시 미퇴근 알림 전송
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                매 평일 오후 7시에 출근은 했으나 퇴근 기록이 없는 직원에게
                Slack DM을 보냅니다. 메시지: &ldquo;오후 7시 기준 퇴근 기록이
                없습니다. 퇴근 처리 부탁드립니다.&rdquo;
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                켜는 즉시 전송되지는 않으며, 다음 평일 오후 7시부터 작동합니다.
              </p>
            </div>
            <Switch
              id="missing-clockout-toggle"
              checked={state.missingClockOutNotifyEnabled}
              onCheckedChange={(v) =>
                toggle('missingClockOutNotifyEnabled', v)
              }
              disabled={pending}
              aria-label="미퇴근 Slack DM 알림 토글"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
