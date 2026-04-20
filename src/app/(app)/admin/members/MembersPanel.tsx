'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Plus, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/cn';

export type MemberRow = {
  id: number;
  name: string;
  email: string | null;
  slackId: string;
  position: string | null;
  role: 'EMPLOYEE' | 'ADMIN';
  active: boolean;
  baseDays: number;
  bonusDays: number;
  usedDays: number;
};

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function remaining(m: MemberRow): number {
  return safe(m.baseDays) + safe(m.bonusDays) - safe(m.usedDays);
}

export function MembersPanel({ rows }: { rows: MemberRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateDialog />
      </div>

      {/* Desktop table */}
      <div className="hidden rounded-lg border border-border/60 bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>Slack ID</TableHead>
              <TableHead>직책</TableHead>
              <TableHead>권한</TableHead>
              <TableHead className="text-right">기본</TableHead>
              <TableHead className="text-right">추가</TableHead>
              <TableHead className="text-right">사용</TableHead>
              <TableHead className="text-right">잔여</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow
                key={m.id}
                className={cn(!m.active && 'bg-muted/30 text-muted-foreground')}
              >
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-muted-foreground">{m.email ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {m.slackId}
                </TableCell>
                <TableCell>{m.position ?? '—'}</TableCell>
                <TableCell>
                  <RoleBadge role={m.role} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                  {safe(m.baseDays)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                  {safe(m.bonusDays)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                  {safe(m.usedDays)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium tabular-nums">
                  {remaining(m)}
                </TableCell>
                <TableCell>
                  <StatusBadge active={m.active} />
                </TableCell>
                <TableCell>
                  <RowActions member={m} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {rows.map((m) => (
          <div
            key={m.id}
            className={cn(
              'rounded-lg border border-border/60 bg-card p-4',
              !m.active && 'opacity-60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{m.name}</span>
                  <RoleBadge role={m.role} />
                  <StatusBadge active={m.active} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {m.position ?? '—'} · {m.email ?? '이메일 없음'}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{m.slackId}</p>
              </div>
              <RowActions member={m} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                기본 <span className="font-mono tabular-nums">{safe(m.baseDays)}</span>
                <span className="mx-1.5">·</span>
                추가 <span className="font-mono tabular-nums">{safe(m.bonusDays)}</span>
                <span className="mx-1.5">·</span>
                사용 <span className="font-mono tabular-nums">{safe(m.usedDays)}</span>
              </span>
              <span className="font-mono font-medium tabular-nums">잔여 {remaining(m)}일</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: 'EMPLOYEE' | 'ADMIN' }) {
  if (role === 'ADMIN')
    return <Badge variant="outline" className="border-foreground/30">관리자</Badge>;
  return <Badge variant="secondary">직원</Badge>;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
      활성
    </Badge>
  ) : (
    <Badge variant="outline" className="border-border text-muted-foreground">
      비활성
    </Badge>
  );
}

function RowActions({ member }: { member: MemberRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const toggle = () =>
    start(async () => {
      const next = !member.active;
      if (!next && !confirm('해당 직원을 비활성화하시겠습니까?')) return;
      const res = await fetch('/api/admin/user/deactivate', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: member.id, active: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? (next ? '활성화 실패' : '비활성화 실패'));
        return;
      }
      toast.success(next ? '활성화되었습니다' : '비활성화되었습니다');
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="메뉴">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> 수정
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggle} disabled={pending}>
            {member.active ? (
              <>
                <UserMinus className="size-4 text-destructive" />
                <span className="text-destructive">비활성화</span>
              </>
            ) : (
              <>
                <UserPlus className="size-4 text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-300">활성화</span>
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditDialog open={editOpen} onOpenChange={setEditOpen} member={member} />
    </>
  );
}

function CreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: '',
    email: '',
    slackId: '',
    position: '',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'ADMIN',
    baseDays: 15,
  });

  const submit = () =>
    start(async () => {
      const payload = {
        ...form,
        email: form.email || undefined,
        position: form.position || undefined,
      };
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? '생성 실패');
        return;
      }
      toast.success(`${form.name} 직원이 추가되었습니다`);
      setForm({ name: '', email: '', slackId: '', position: '', role: 'EMPLOYEE', baseDays: 15 });
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> 직원 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>직원 추가</DialogTitle>
          <DialogDescription>신규 직원의 기본 정보와 연차를 입력합니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="이름" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="이메일">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@company.com"
              />
            </Field>
            <Field label="Slack ID" required>
              <Input
                value={form.slackId}
                onChange={(e) => setForm((f) => ({ ...f, slackId: e.target.value }))}
                placeholder="U0AQ..."
                className="font-mono"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="직책">
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Field>
            <Field label="권한">
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as 'EMPLOYEE' | 'ADMIN' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">직원</SelectItem>
                  <SelectItem value="ADMIN">관리자</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="기본 연차 (일)">
              <Input
                type="number"
                min={0}
                max={365}
                value={form.baseDays}
                onChange={(e) => setForm((f) => ({ ...f, baseDays: Number(e.target.value) }))}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending || !form.name || !form.slackId}>
            {pending ? '추가 중…' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: MemberRow;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: member.name,
    email: member.email ?? '',
    slackId: member.slackId,
    position: member.position ?? '',
    role: member.role,
    baseDays: member.baseDays,
    bonusDays: member.bonusDays,
  });

  const remainingPreview = safe(form.baseDays) + safe(form.bonusDays) - safe(member.usedDays);

  const save = () =>
    start(async () => {
      const payload = {
        id: member.id,
        name: form.name,
        email: form.email || undefined,
        slackId: form.slackId,
        position: form.position || undefined,
        role: form.role,
        baseDays: form.baseDays,
        bonusDays: form.bonusDays,
      };
      const res = await fetch('/api/admin/user', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? '저장 실패');
        return;
      }
      toast.success('저장되었습니다');
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{member.name} 수정</DialogTitle>
          <DialogDescription>직원 정보와 연차를 수정합니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="이름" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="이메일">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Slack ID" required>
              <Input
                value={form.slackId}
                onChange={(e) => setForm((f) => ({ ...f, slackId: e.target.value }))}
                className="font-mono"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="직책">
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Field>
            <Field label="권한">
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as 'EMPLOYEE' | 'ADMIN' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">직원</SelectItem>
                  <SelectItem value="ADMIN">관리자</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <Label className="text-xs text-muted-foreground">연차</Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              <Field label="기본 (일)">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  step={0.5}
                  value={form.baseDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, baseDays: safe(Number(e.target.value)) }))
                  }
                />
              </Field>
              <Field label="추가 (일)">
                <Input
                  type="number"
                  min={-365}
                  max={365}
                  step={0.5}
                  value={form.bonusDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bonusDays: safe(Number(e.target.value)) }))
                  }
                />
              </Field>
              <div className="space-y-1.5">
                <Label className="text-xs">사용 (일)</Label>
                <Input
                  type="number"
                  value={safe(member.usedDays)}
                  disabled
                  className="bg-muted font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">잔여 (일)</Label>
                <Input
                  type="number"
                  value={remainingPreview}
                  disabled
                  className="bg-muted font-mono font-medium tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            취소
          </Button>
          <Button onClick={save} disabled={pending || !form.name || !form.slackId}>
            {pending ? '저장 중…' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
