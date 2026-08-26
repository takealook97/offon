'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/client';

export type AttendeeOption = {
  id: number;
  name: string;
  position: string | null;
  role: 'EMPLOYEE' | 'ADMIN';
};

/**
 * Multi-select for internal attendees.
 *
 * Follows the same interaction rules as the single-select picker used for exports:
 * a fixed-height list so the modal never resizes, arrow keys and Enter, and a guard for composing input.
 * Unlike the single-select it keeps the search text after a choice, so several can be picked in a row,
 * and each one is added as a chip above the list.
 */
export function AttendeePicker({
  value,
  onChange,
  excludeId,
}: {
  value: AttendeeOption[];
  onChange: (next: AttendeeOption[]) => void;
  /** The organiser. There is no reason to add them as an attendee, so they are left out of the list. */
  excludeId?: number;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<AttendeeOption[]>([]);
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
    const pool = excludeId ? members.filter((m) => m.id !== excludeId) : members;
    const filtered = q
      ? pool.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.position ?? '').toLowerCase().includes(q),
        )
      : pool;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [members, query, excludeId]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const isSelected = (id: number) => value.some((v) => v.id === id);

  // Multi-select, so a click toggles and the search text stays, which suits picking a whole team in a row.
  const toggle = (m: AttendeeOption) => {
    onChange(isSelected(m.id) ? value.filter((v) => v.id !== m.id) : [...value, m]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter is ignored while an input method is still composing a character. Without that, the
    // half-formed character commits late and is appended to the search text.
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
      if (target) toggle(target);
    }
  };

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((m) => (
            <li key={m.id}>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-1 text-xs text-secondary-foreground">
                {m.name}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v.id !== m.id))}
                  aria-label={t('room.excludeLabel', { name: m.name })}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('room.searchPlaceholder')}
          className="h-10 pl-9 pr-9"
          role="combobox"
          aria-expanded={true}
          aria-controls="attendee-listbox"
          aria-autocomplete="list"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setHighlight(0);
            }}
            aria-label={t('room.clearSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {/* Fixed height with internal scrolling, so the modal stays the same size whatever the result count. */}
      <ul
        ref={listRef}
        id="attendee-listbox"
        role="listbox"
        aria-multiselectable
        className="h-44 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover"
      >
        {matches.length === 0 ? (
          <li className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {t('room.noResults')}
          </li>
        ) : (
          matches.map((m, idx) => {
            const selected = isSelected(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  data-idx={idx}
                  aria-selected={selected}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => toggle(m)}
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
                      <span className="truncate text-xs text-muted-foreground">
                        {m.position}
                      </span>
                    )}
                  </span>
                  {selected && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
