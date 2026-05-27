'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { MemberPicker, type PickerMember } from './MemberPicker';

const MIN_YEAR = 2026;
const MIN_MONTH = 5; // the feature went live in 2026-05

function filenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through to plain */
    }
  }
  const plain = cd.match(/filename="([^"]+)"/i);
  return plain ? plain[1] : null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportButton({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(curYear);
  const [month, setMonth] = useState(curMonth);
  const [adminTarget, setAdminTarget] = useState<'all' | 'individual'>('all');
  const [member, setMember] = useState<PickerMember | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = MIN_YEAR; y <= curYear; y++) arr.push(y);
    return arr;
  }, [curYear]);

  const monthBounds = (y: number) => ({
    lo: y === MIN_YEAR ? MIN_MONTH : 1,
    hi: y === curYear ? curMonth : 12,
  });
  const isMonthValid = (y: number, m: number) => {
    const { lo, hi } = monthBounds(y);
    return m >= lo && m <= hi;
  };
  const clampMonth = (y: number, m: number) => {
    const { lo, hi } = monthBounds(y);
    return Math.min(hi, Math.max(lo, m));
  };

  const handleYearChange = (v: string) => {
    const y = Number(v);
    setYear(y);
    setMonth((m) => clampMonth(y, m));
  };

  const needMember = isAdmin && adminTarget === 'individual';
  const canDownload = !loading && (!needMember || !!member);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      let scope: 'self' | 'member' | 'all';
      if (!isAdmin) {
        scope = 'self';
      } else if (adminTarget === 'all') {
        scope = 'all';
      } else {
        scope = 'member';
        if (member) params.set('memberId', String(member.id));
      }
      params.set('scope', scope);

      const res = await fetch(`/api/export/attendance?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        let msg = 'The download failed';
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* binary/empty body */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const fallback = `attendance_${year}${String(month).padStart(2, '0')}.xlsx`;
      const filename =
        filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallback;
      triggerDownload(blob, filename);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The download failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="size-4" />
          Download
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Download attendance</DialogTitle>
          <DialogDescription>Pick a year and month to export attendance as a spreadsheet.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Year">
              <Select value={String(year)} onValueChange={handleYearChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Month">
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)} disabled={!isMonthValid(year, m)}>
                      {m}Month
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Scope</p>
              <div className="inline-flex w-full gap-1 rounded-md bg-muted p-0.5">
                <ToggleBtn active={adminTarget === 'all'} onClick={() => setAdminTarget('all')}>
                  Everyone
                </ToggleBtn>
                <ToggleBtn
                  active={adminTarget === 'individual'}
                  onClick={() => setAdminTarget('individual')}
                >
                  Just me
                </ToggleBtn>
              </div>
              {adminTarget === 'individual' && (
                <MemberPicker value={member} onChange={setMember} />
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancelled
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleDownload} disabled={!canDownload}>
            {loading ? 'Building…' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-background font-medium text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
