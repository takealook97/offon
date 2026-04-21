'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

export function CancelLeaveButton({
  id,
  wasApproved,
}: {
  id: number;
  wasApproved: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const cancel = () =>
    start(async () => {
      const res = await fetch('/api/leave/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? '취소 실패');
        return;
      }
      toast.success('취소되었습니다');
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        취소
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>연차 신청 취소</DialogTitle>
            <DialogDescription>
              {wasApproved
                ? '승인된 연차를 취소하면 사용한 잔여가 환원됩니다. 진행할까요?'
                : '신청을 취소하시겠습니까?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              돌아가기
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={pending}>
              {pending ? '처리 중…' : '취소하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
