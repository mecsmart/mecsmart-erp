import React, { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

/**
 * Searchable item dropdown — filter by part number OR name.
 * Props:
 *   items: full list of items (id, part_number, name, category)
 *   value: currently selected id
 *   onChange: callback (id)
 *   placeholder: string
 *   filter: optional (item) => boolean to pre-filter list
 *   showCategory: default true — shows (category) label next to name
 *   testId: data-testid for the trigger
 */
export const SearchableItemSelect = ({ items = [], value, onChange, placeholder = 'Select item', filter, showCategory = true, testId, disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const selected = items.find(i => i.id === value);

  const list = (filter ? items.filter(filter) : items).filter(i => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (i.part_number || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q);
  });

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        data-testid={testId}
        className="flex h-10 w-full items-center justify-between rounded-sm border border-[#D1D5DB] bg-white px-3 py-2 text-sm disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-[#1D3557]"
      >
        <span className={`truncate ${selected ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>
          {selected ? <><span className="mono font-medium">{selected.part_number}</span> - {selected.name}{showCategory && <span className="text-[#9CA3AF]"> ({selected.category})</span>}</> : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-[#6B7280] shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-sm shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-[#E5E7EB] bg-[#F9FAFB]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by Part No or Name…"
                className="w-full pl-8 pr-7 py-1.5 text-sm border border-[#D1D5DB] rounded-sm focus:outline-none focus:ring-1 focus:ring-[#1D3557]"
                data-testid={`${testId || 'item'}-search-input`}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827]">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="text-[10px] text-[#6B7280] mt-1">{list.length} of {(filter ? items.filter(filter) : items).length} items</div>
          </div>
          <div className="overflow-y-auto flex-1">
            {list.length === 0 ? (
              <div className="p-3 text-xs text-[#9CA3AF] text-center">No items match "{query}"</div>
            ) : (
              list.slice(0, 200).map(i => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => { onChange(i.id); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#F3F4F6] border-b border-[#F9FAFB] last:border-0 ${value === i.id ? 'bg-[#E1EFFE] text-[#1E429F] font-medium' : ''}`}
                  data-testid={`${testId || 'item'}-option-${i.id}`}
                >
                  <span className="mono text-xs font-medium">{i.part_number}</span>
                  <span className="ml-2">{i.name}</span>
                  {showCategory && <span className="text-[#9CA3AF] text-xs ml-1">({i.category})</span>}
                </button>
              ))
            )}
            {list.length > 200 && (
              <div className="p-2 text-[10px] text-[#9CA3AF] text-center italic">Showing first 200. Refine your search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
