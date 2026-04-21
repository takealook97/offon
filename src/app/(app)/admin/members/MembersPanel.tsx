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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Slack ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[72px]">Base</TableHead>
              <TableHead className="w-[72px]">Add</TableHead>
              <TableHead className="w-[72px]">Used</TableHead>
              <TableHead className="w-[72px]">Remaining</TableHead>
              <TableHead>Status</TableHead>
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
                  {m.position ?? '—'} · {m.email ?? 'no email'}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{m.slackId}</p>
              </div>
              <RowActions member={m} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Base <span className="font-mono tabular-nums">{safe(m.baseDays)}</span>
                <span className="mx-1.5">·</span>
                Add <span className="font-mono tabular-nums">{safe(m.bonusDays)}</span>
                <span className="mx-1.5">·</span>
                Used <span className="font-mono tabular-nums">{safe(m.usedDays)}</span>
              </span>
              <span className="font-mono font-medium tabular-nums">Remaining {remaining(m)}Day</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: 'EMPLOYEE' | 'ADMIN' }) {
  if (role === 'ADMIN')
    return <Badge variant="outline" className="border-foreground/30">Admin</Badge>;
  return <Badge variant="secondary">An employee</Badge>;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="border-border text-muted-foreground">
      Inactive
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
      if (!next && !confirm('Deactivate this member?')) return;
      const res = await fetch('/api/admin/user/deactivate', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: member.id, active: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? (next ? 'Could not activate' : 'Could not deactivate'));
        return;
      }
      toast.success(next ? 'Activated' : 'Deactivated');
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Menu">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggle} disabled={pending}>
            {member.active ? (
              <>
                <UserMinus className="size-4 text-destructive" />
                <span className="text-destructive">Deactivate</span>
              </>
            ) : (
              <>
                <UserPlus className="size-4 text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-300">Activate</span>
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
        toast.error(data.error ?? 'Could not create that');
        return;
      }
      toast.success(`${form.name} was added`);
      setForm({ name: '', email: '', slackId: '', position: '', role: 'EMPLOYEE', baseDays: 15 });
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> Add member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Enter the new member\'s details and starting leave.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
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
            <Field label="Title">
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as 'EMPLOYEE' | 'ADMIN' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">An employee</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Base leave (days)">
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
            Cancelled
          </Button>
          <Button onClick={submit} disabled={pending || !form.name || !form.slackId}>
            {pending ? 'Adding…' : 'Add'}
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
    excludeMissingNotify: member.excludeMissingNotify,
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
        toast.error(data.error ?? 'Could not save that');
        return;
      }
      toast.success('Saved');
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{member.name} Edit</DialogTitle>
          <DialogDescription>Edit this person's details and leave.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
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
            <Field label="Title">
              <Input
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as 'EMPLOYEE' | 'ADMIN' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">An employee</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
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
                Skip attendance reminders
              </Label>
              <p className="text-xs text-muted-foreground">
                This person is never sent a missing clock-in or clock-out DM
              </p>
            </div>
            <Switch
              id={`exclude-missing-${member.id}`}
              checked={form.excludeMissingNotify}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, excludeMissingNotify: v }))
              }
              aria-label="Toggle attendance reminders"
            />
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <Label className="text-xs text-muted-foreground">Leave</Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              <Field label="Base (days)">
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
              <Field label="Bonus (days)">
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
                <Label className="text-xs">Used (days)</Label>
                <Input
                  type="number"
                  value={safe(member.usedDays)}
                  disabled
                  className="bg-muted font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Remaining (days)</Label>
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
            Cancelled
          </Button>
          <Button onClick={save} disabled={pending || !form.name || !form.slackId}>
            {pending ? 'Saving…' : 'Save'}
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
