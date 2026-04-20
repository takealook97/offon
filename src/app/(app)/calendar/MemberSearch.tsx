'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

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

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const choose = (m: Member) => {
    setSelected(m);
    setQuery(m.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = matches[highlight] ?? matches[0];
      if (target) choose(target);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="이름 또는 직책 검색 · ↑↓ 선택 · Enter 확정"
            className="h-11 pl-9 pr-9"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="member-search-listbox"
            aria-activedescendant={
              open && matches[highlight] ? `member-opt-${matches[highlight].id}` : undefined
            }
          />
          {query && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery('');
                setSelected(null);
                setOpen(true);
              }}
              aria-label="지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {open && matches.length > 0 && (
          <ul
            ref={listRef}
            id="member-search-listbox"
            role="listbox"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
          >
            {matches.map((m, idx) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  id={`member-opt-${m.id}`}
                  data-idx={idx}
                  aria-selected={idx === highlight}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(m)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors',
                    idx === highlight ? 'bg-accent text-foreground' : 'hover:bg-accent/60',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    {m.position && (
                      <span className="text-xs text-muted-foreground">{m.position}</span>
                    )}
                  </span>
                  {m.role === 'ADMIN' && (
                    <span className="text-xs text-muted-foreground">관리자</span>
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
                <span className="ml-2 text-xs text-muted-foreground">· 관리자</span>
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
              선택 해제
            </Button>
          </div>
          <CalendarView key={selected.id} memberId={selected.id} />
        </div>
      ) : (
        <div className="flex h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
          <Search className="mb-2 size-5" />
          <p>이름이나 직책으로 팀원을 검색해 주세요</p>
          <p className="mt-1 text-xs">↑↓ 이동 · Enter 선택 · Esc 닫기</p>
        </div>
      )}
    </div>
  );
}
