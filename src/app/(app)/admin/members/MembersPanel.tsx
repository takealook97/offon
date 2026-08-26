'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Plus, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/client';
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
import { Switch } from '@/components/ui/switch';
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
  excludeMissingNotify: boolean;
  active: boolean;
  baseDays: number;
  bonusDays: number;
  // Approved leave that ended before today: the part actually taken.
  usedDays: number;
  // Approved leave ending today or later: already out of the balance but not yet taken.
  scheduledDays: number;
};

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function remaining(m: MemberRow): number {
  return (
    safe(m.baseDays) + safe(m.bonusDays) - safe(m.usedDays) - safe(m.scheduledDays)
  );
}

export function MembersPanel({ rows }: { rows: MemberRow[] }) {
  const { t } = useTranslation();
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
              <TableHead>{t('member.name')}</TableHead>
              <TableHead>{t('member.email')}</TableHead>
              <TableHead>Slack ID</TableHead>
              <TableHead>{t('member.position')}</TableHead>
              <TableHead>{t('member.role')}</TableHead>
              <TableHead className="w-[72px]">{t('member.baseDays')}</TableHead>
              <TableHead className="w-[72px]">{t('member.bonusDays')}</TableHead>
              <TableHead className="w-[72px]">{t('member.scheduledDays')}</TableHead>
              <TableHead className="w-[72px]">{t('member.usedDays')}</TableHead>
              <TableHead className="w-[72px]">{t('member.remainingDays')}</TableHead>
              <TableHead>{t('member.state')}</TableHead>
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
                <TableCell className="w-[72px] font-mono text-sm tabular-nums text-muted-foreground">
                  {safe(m.baseDays)}
                </TableCell>
                <TableCell className="w-[72px] font-mono text-sm tabular-nums text-muted-foreground">
                  {safe(m.bonusDays)}
                </TableCell>
                <TableCell className="w-[72px] font-mono text-sm tabular-nums text-muted-foreground">
                  {safe(m.scheduledDays)}
                </TableCell>
                <TableCell className="w-[72px] font-mono text-sm tabular-nums text-muted-foreground">
                  {safe(m.usedDays)}
                </TableCell>
                <TableCell className="w-[72px] font-mono text-sm font-medium tabular-nums">
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
                  {m.position ?? '—'} · {m.email ?? t('member.noEmail')}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{m.slackId}</p>
              </div>
              <RowActions member={m} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {t('member.baseDays')} <span className="font-mono tabular-nums">{safe(m.baseDays)}</span>
                <span className="mx-1.5">·</span>
                {t('member.bonusDays')} <span className="font-mono tabular-nums">{safe(m.bonusDays)}</span>
                <span className="mx-1.5">·</span>
                {t('member.scheduledDays')} <span className="font-mono tabular-nums">{safe(m.scheduledDays)}</span>
                <span className="mx-1.5">·</span>
                {t('member.usedDays')} <span className="font-mono tabular-nums">{safe(m.usedDays)}</span>
              </span>
              <span className="font-mono font-medium tabular-nums">{t('member.remainingWithDays', { days: remaining(m) })}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: 'EMPLOYEE' | 'ADMIN' }) {
  const { t } = useTranslation();
  if (role === 'ADMIN')
    return <Badge variant="outline" className="border-foreground/30">{t('member.roleAdmin')}</Badge>;
  return <Badge variant="secondary">{t('member.roleEmployee')}</Badge>;
}

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return active ? (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
      {t('member.active')}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-border text-muted-foreground">
      {t('member.inactive')}
    </Badge>
  );
}

function RowActions({ member }: { member: MemberRow }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const toggle = () =>
    start(async () => {
      const next = !member.active;
      if (!next && !confirm(t('member.deactivateConfirm'))) return;
      const res = await fetch('/api/admin/user/deactivate', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: member.id, active: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? (next ? t('member.activateFailed') : t('member.deactivateFailed')));
        return;
      }
      toast.success(next ? t('member.activated') : t('member.deactivated'));
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={t('member.menu')}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> {t('member.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggle} disabled={pending}>
            {member.active ? (
              <>
                <UserMinus className="size-4 text-destructive" />
                <span className="text-destructive">{t('member.deactivate')}</span>
              </>
            ) : (
              <>
                <UserPlus className="size-4 text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-300">{t('member.activate')}</span>
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
  const { t } = useTranslation();
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
        toast.error(data.error ?? t('member.createFailed'));
        return;
      }
      toast.success(t('member.added', { name: form.name }));
      setForm({ name: '', email: '', slackId: '', position: '', role: 'EMPLOYEE', baseDays: 15 });
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {t('member.add')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('member.add')}</DialogTitle>
          <DialogDescription>{t('member.addDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label={t('member.name')} required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('member.email')}>
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
            <Field label={t('member.position')}>
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Field>
            <Field label={t('member.role')}>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as 'EMPLOYEE' | 'ADMIN' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">{t('member.roleEmployee')}</SelectItem>
                  <SelectItem value="ADMIN">{t('member.roleAdmin')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('member.baseLeaveField')}>
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
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !form.name || !form.slackId}>
            {pending ? t('member.adding') : t('member.addAction')}
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
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: member.name,
    email: member.email ?? '',
    slackId: member.slackId,
    position: member.position ?? '',
    role: member.role,
    excludeMissingNotify: member.excludeMissingNotify,
    baseDays: member.baseDays,
    bonusDays: member.bonusDays,
  });

  const remainingPreview =
    safe(form.baseDays) +
    safe(form.bonusDays) -
    safe(member.usedDays) -
    safe(member.scheduledDays);

  const save = () =>
    start(async () => {
      const payload = {
        id: member.id,
        name: form.name,
        email: form.email || undefined,
        slackId: form.slackId,
        position: form.position || undefined,
        role: form.role,
        excludeMissingNotify: form.excludeMissingNotify,
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
        toast.error(data.error ?? t('member.saveFailed'));
        return;
      }
      toast.success(t('member.saved'));
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('member.editTitle', { name: member.name })}</DialogTitle>
          <DialogDescription>{t('member.editDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label={t('member.name')} required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('member.email')}>
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
            <Field label={t('member.position')}>
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Field>
            <Field label={t('member.role')}>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as 'EMPLOYEE' | 'ADMIN' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">{t('member.roleEmployee')}</SelectItem>
                  <SelectItem value="ADMIN">{t('member.roleAdmin')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label
                htmlFor={`exclude-missing-${member.id}`}
                className="text-sm font-medium"
              >
                {t('member.excludeNotify')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('member.excludeNotifyHint')}
              </p>
            </div>
            <Switch
              id={`exclude-missing-${member.id}`}
              checked={form.excludeMissingNotify}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, excludeMissingNotify: v }))
              }
              aria-label={t('member.excludeNotifyToggle')}
            />
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <Label className="text-xs text-muted-foreground">{t('member.leave')}</Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-5">
              <Field label={t('member.baseField')}>
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
              <Field label={t('member.bonusLeaveField')}>
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
                <Label className="text-xs">{t('member.scheduledLeaveField')}</Label>
                <Input
                  type="number"
                  value={safe(member.scheduledDays)}
                  disabled
                  className="bg-muted font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('member.usedField')}</Label>
                <Input
                  type="number"
                  value={safe(member.usedDays)}
                  disabled
                  className="bg-muted font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('member.remainingField')}</Label>
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
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={pending || !form.name || !form.slackId}>
            {pending ? t('member.saving') : t('member.save')}
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
