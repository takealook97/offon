'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function LeaveActions({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const approve = () =>
    start(async () => {
      const res = await fetch('/api/leave/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? '승인 실패');
        return;
      }
      toast.success('승인되었습니다');
      router.refresh();
    });

  const reject = () =>
    start(async () => {
      const res = await fetch('/api/leave/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, reason: reason || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? '반려 실패');
        return;
      }
      toast.success('반려되었습니다');
      setRejectOpen(false);
      setReason('');
      router.refresh();
    });

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={approve} disabled={pending} className="gap-1.5">
          <Check className="size-4" />
          승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRejectOpen(true)}
          disabled={pending}
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <X className="size-4" />
          반려
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>연차 반려</DialogTitle>
            <DialogDescription>반려 사유는 신청자에게 Slack DM으로 전달됩니다 (선택).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">반려 사유 (선택)</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 프로젝트 마감일과 겹쳐 일정 조정이 필요합니다"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button variant="destructive" onClick={reject} disabled={pending}>
              {pending ? '처리 중…' : '반려'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
