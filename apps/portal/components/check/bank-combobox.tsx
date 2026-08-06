"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BANKS, type Bank } from "@xobriq/shared";

/**
 * Type-ahead bank picker — 42 banks is too long for a plain <select> to feel
 * calm. No dropdown/combobox library exists in this portal yet, so this is a
 * small self-contained implementation: type to filter, click to select.
 * Deliberately no arrow-key roving/full ARIA combobox pattern — click and
 * type-to-filter cover the real use case without the extra surface area.
 */
export function BankCombobox({
  bankId,
  onChange,
  disabled,
}: {
  bankId: number | undefined;
  onChange: (bankId: number | undefined) => void;
  disabled: boolean;
}) {
  const selected = useMemo(() => BANKS.find((b) => b.id === bankId), [bankId]);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.name ?? "");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [selected]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BANKS;
    return BANKS.filter((b) => b.name.toLowerCase().includes(q));
  }, [query]);

  function select(bank: Bank) {
    onChange(bank.id);
    setQuery(bank.name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">Bank</span>
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder="Search banks…"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (bankId !== undefined) onChange(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery(selected?.name ?? "");
            }
          }}
          className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none disabled:opacity-50"
        />
      </label>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-hairline bg-surface py-1 shadow-[0_8px_24px_-12px_rgba(26,24,21,0.16)]">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-soft">No banks match &ldquo;{query}&rdquo;</li>
          ) : (
            results.map((bank) => (
              <li key={bank.id}>
                <button
                  type="button"
                  onClick={() => select(bank)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-paper"
                >
                  {bank.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
