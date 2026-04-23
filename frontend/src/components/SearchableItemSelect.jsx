import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Searchable item dropdown — INLINE variant (search-first).
 * Instead of click-to-open → search → select, the input is always a search box.
 * Type to see matches immediately; click a match to select.
 * Selected item is shown above the input with an "X" to clear.
 *
 * Props:
 *   items: full list of items (id, part_number, name, category)
 *   value: currently selected id
 *   onChange: callback (id)
 *   placeholder: string
 *   filter: optional (item) => boolean to pre-filter list
 *   showCategory: default true — shows (category) label next to name
 *   testId: data-testid prefix
 *   disabled: bool
 */
export const SearchableItemSelect = ({
  items = [],
  value,
  onChange,
  placeholder = 'Type to search item by part number or name…',
  filter,
  showCategory = true,
  testId,
  disabled,
  allowClear = true,
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef(null);

  const selected = items.find(i => i.id === value);

  const baseList = filter ? items.filter(filter) : items;
  const list = baseList.filter(i => {
    if (!query.trim()) return false; // Don't flood with all items on focus — wait for keystroke
    const q = query.toLowerCase();
    return (i.part_number || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q);
  }).slice(0, 100);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (item) => {
    onChange(item.id);
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
            <span className="mono text-xs font-semibold">{selected.part_number}</span>
            <span className="text-[#111827] truncate">{selected.name}</span>
            {showCategory && selected.category && (
              <span className="text-[10px] text-[#6B7280] italic">({selected.category.replace('_', ' ')})</span>
            )}
          </div>
          {!disabled && allowClear && (
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
            {list.length} match{list.length !== 1 ? 'es' : ''} for "{query}"
          </div>
          {list.length === 0 ? (
            <div className="p-3 text-xs text-[#9CA3AF] text-center italic">No items found</div>
          ) : (
            list.map(i => (
              <button
                key={i.id}
                type="button"
                onClick={() => handleSelect(i)}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[#F3F4F6] border-b border-[#F9FAFB] last:border-0"
                data-testid={`${testId || 'ss'}-option-${i.id}`}
              >
                <span className="mono font-semibold text-xs">{i.part_number}</span>
                <span className="ml-2">{i.name}</span>
                {showCategory && i.category && (
                  <span className="ml-2 text-[10px] text-[#6B7280] italic">({i.category.replace('_', ' ')})</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
