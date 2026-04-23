import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

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
  const wrapRef = useRef(null);

  const selected = options.find(o => o.id === value);

  const filtered = options.filter(o => {
    if (!query.trim()) return false;
    const q = query.toLowerCase();
    return matchFields.some(f => String(o?.[f] || '').toLowerCase().includes(q));
  }).slice(0, 100);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (o) => {
    onChange(o.id);
    setQuery('');
    setFocused(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  return (
    <div ref={wrapRef} className="relative">
      {selected ? (
        <div
          className="flex items-center justify-between h-10 w-full rounded-sm border border-[#D1D5DB] bg-[#F0F9FF] px-3 py-2 text-sm"
          data-testid={testId}
        >
          <div className="flex items-center gap-2 truncate">
            {getSecondary(selected) && <span className="mono text-xs font-semibold">{getSecondary(selected)}</span>}
            <span className="text-[#111827] truncate">{getLabel(selected)}</span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-[#6B7280] hover:text-[#9B1C1C] ml-2 shrink-0"
              data-testid={`${testId || 'ss'}-clear`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocused(true); }}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="h-10 w-full rounded-sm border border-[#D1D5DB] bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D3557] disabled:opacity-50"
            data-testid={testId}
            autoComplete="off"
          />
        </div>
      )}

      {!selected && focused && query.trim() && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-sm shadow-lg max-h-64 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] text-[#6B7280] uppercase tracking-wide border-b border-[#F3F4F6]">
            {filtered.length} match{filtered.length !== 1 ? 'es' : ''} for "{query}"
          </div>
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-[#9CA3AF] text-center italic">No match</div>
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
