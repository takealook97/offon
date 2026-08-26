'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/client';

export type PickerMember = {
  id: number;
  name: string;
  position: string | null;
  role: 'EMPLOYEE' | 'ADMIN';
};

/**
 * The member search an admin uses to pick whose records to export.
 * The results area is always shown at a fixed height and scrolls internally, so whatever the query or count
 * the modal never resizes and the list cannot spill out of it. The same holds on mobile.
 */
export function MemberPicker({
  value,
  onChange,
}: {
  value: PickerMember | null;
  onChange: (member: PickerMember | null) => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<PickerMember[]>([]);
  const [query, setQuery] = useState('');
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
    const filtered = q
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.position ?? '').toLowerCase().includes(q),
        )
      : members;
    // Sorted by name using the locale's own collation.
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [members, query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const choose = (m: PickerMember) => {
    onChange(m);
    setQuery(m.name);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter is ignored while an input method is still composing a character. Without that, the
    // half-formed character commits right after choose() clears the query and is appended to it.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = matches[highlight] ?? matches[0];
      if (target) choose(target);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('cal.searchMember')}
          className="h-10 pl-9 pr-9"
          role="combobox"
          aria-expanded={true}
          aria-controls="export-member-listbox"
          aria-autocomplete="list"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery('');
              setHighlight(0);
            }}
            aria-label={t('cal.clear')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {/* Fixed height with internal scrolling: the modal stays the same size whatever the result count, and nothing spills out of it. */}
      <ul
        ref={listRef}
        id="export-member-listbox"
        role="listbox"
        className="h-44 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover"
      >
        {matches.length === 0 ? (
          <li className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {t('cal.noResults')}
          </li>
        ) : (
          matches.map((m, idx) => {
            const selected = value?.id === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  data-idx={idx}
                  aria-selected={selected}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => choose(m)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                    selected
                      ? 'bg-accent text-foreground'
                      : idx === highlight
                        ? 'bg-accent/60'
                        : 'hover:bg-accent/50',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{m.name}</span>
                    {m.position && (
                      <span className="truncate text-xs text-muted-foreground">{m.position}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {m.role === 'ADMIN' && (
                      <span className="text-xs text-muted-foreground">{t('cal.admin')}</span>
                    )}
                    {selected && <Check className="size-4" />}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
