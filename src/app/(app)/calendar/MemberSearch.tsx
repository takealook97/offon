'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { CalendarView } from './CalendarView';

type Member = {
  id: number;
  name: string;
  position: string | null;
  role: 'EMPLOYEE' | 'ADMIN';
};

export function MemberSearch() {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    fetch('/api/members')
      .then((r) => r.json())
      .then((data) => setMembers(data?.members ?? []))
      .catch(() => setMembers([]));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.position ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [members, query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 120)}
            placeholder="Search by name or position"
            className="h-11 pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {focus && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelected(m);
                    setQuery(m.name);
                    setFocus(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                    selected?.id === m.id && 'bg-accent',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    {m.position && (
                      <span className="text-xs text-muted-foreground">{m.position}</span>
                    )}
                  </span>
                  {m.role === 'ADMIN' && (
                    <span className="text-xs text-muted-foreground">Admin</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{selected.name}</span>
              {selected.position && (
                <span className="ml-2 text-muted-foreground">{selected.position}</span>
              )}
              {selected.role === 'ADMIN' && (
                <span className="ml-2 text-xs text-muted-foreground">· admin</span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(null);
                setQuery('');
              }}
            >
              Clear selection
            </Button>
          </div>
          <CalendarView key={selected.id} memberId={selected.id} />
        </div>
      ) : (
        <div className="flex h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
          <Search className="mb-2 size-5" />
          <p>Search for a teammate by name or title</p>
        </div>
      )}
    </div>
  );
}
