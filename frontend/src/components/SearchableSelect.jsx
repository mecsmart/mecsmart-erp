import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Pencil } from 'lucide-react';

/**
 * Generic searchable dropdown — INLINE search-first variant.
 * Works for any entity list (suppliers, customers, warehouses…).
 * Type to see matches immediately; click to select. Selected item shows as a chip.
 *
 * Props:
 *   options: array of items
 *   value: currently selected id
 *   onChange: callback (id)
 *   getLabel: (option) => string
 *   getSecondary: (option) => string
 *   matchFields: array of field names to search (defaults: ['name','code'])
 *   placeholder: string
 *   testId: data-testid
 *   disabled: bool
 */
export const SearchableSelect = ({
  options = [],
  value,
  onChange,
  getLabel = (o) => o?.name || '',
  getSecondary = (o) => o?.code || '',
  matchFields = ['name', 'code'],
  placeholder = 'Type to search…',
  testId,
  disabled = false,
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  // When `editing` is true, the search input is shown even though a value is
  // already selected — letting the user pick a different option during an
  // edit flow without first clearing the selection. Reverts to the chip on
  // blur if no new pick is made.
  const [editing, setEditing] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => o.id === value);

  const filtered = (() => {
    // Show ALL options (capped at 100) when the dropdown is open and no
    // query has been typed yet — this is what most users expect from a
    // dropdown (click → see entries). Typing then narrows the list.
    if (!query.trim()) return options.slice(0, 100);
    const q = query.toLowerCase();
    return options.filter(o =>
      matchFields.some(f => String(o?.[f] || '').toLowerCase().includes(q))
    ).slice(0, 100);
  })();

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setFocused(false);
        setEditing(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset editing mode if the parent swaps `value` programmatically
  useEffect(() => { setEditing(false); setQuery(''); }, [value]);

  const handleSelect = (o) => {
    onChange(o.id);
    setQuery('');
    setFocused(false);
    setEditing(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setEditing(false);
  };

  const enterEditMode = () => {
    if (disabled) return;
    setEditing(true);
    setFocused(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const showSearchInput = !selected || editing;

  return (
    <div ref={wrapRef} className="relative">
      {!showSearchInput ? (
        <div
          className="flex items-center justify-between h-10 w-full rounded-sm border border-[#D1D5DB] bg-[#F0F9FF] px-3 py-2 text-sm"
          data-testid={testId}
        >
          <button
            type="button"
            onClick={enterEditMode}
            disabled={disabled}
            className="flex items-center gap-2 truncate flex-1 text-left hover:opacity-80"
            data-testid={`${testId || 'ss'}-change`}
            title="Click to change"
          >
            {getSecondary(selected) && <span className="mono text-xs font-semibold">{getSecondary(selected)}</span>}
            <span className="text-[#111827] truncate">{getLabel(selected)}</span>
            <Pencil className="w-3 h-3 text-[#6B7280] shrink-0 ml-1" />
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-[#6B7280] hover:text-[#9B1C1C] ml-2 shrink-0"
              data-testid={`${testId || 'ss'}-clear`}
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocused(true); }}
            onFocus={() => setFocused(true)}
            placeholder={selected ? `Current: ${getLabel(selected)} — search to change…` : placeholder}
            disabled={disabled}
            className="h-10 w-full rounded-sm border border-[#D1D5DB] bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D3557] disabled:opacity-50"
            data-testid={testId}
            autoComplete="off"
          />
          {editing && selected && (
            <button
              type="button"
              onClick={() => { setEditing(false); setQuery(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#6B7280] hover:text-[#1D3557] underline"
              data-testid={`${testId || 'ss'}-cancel-edit`}
            >
              cancel
            </button>
          )}
        </div>
      )}

      {showSearchInput && focused && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-sm shadow-lg max-h-64 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] text-[#6B7280] uppercase tracking-wide border-b border-[#F3F4F6]">
            {query.trim()
              ? `${filtered.length} match${filtered.length !== 1 ? 'es' : ''} for "${query}"`
              : `${options.length} option${options.length !== 1 ? 's' : ''}${options.length > 100 ? ' — showing first 100, type to filter' : ''}`}
          </div>
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-[#9CA3AF] text-center italic">{query.trim() ? 'No match' : 'No options available'}</div>
          ) : (
            filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => handleSelect(o)}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[#F3F4F6] border-b border-[#F9FAFB] last:border-0"
                data-testid={`${testId || 'ss'}-option-${o.id}`}
              >
                {getSecondary(o) && <span className="mono font-semibold text-xs">{getSecondary(o)}</span>}
                <span className="ml-2">{getLabel(o)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
