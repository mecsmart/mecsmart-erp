import React, { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

/**
 * Generic searchable dropdown — works for any entity list (suppliers, customers, warehouses…).
 * Props:
 *   options: array of items to render
 *   value: currently selected id
 *   onChange: callback (id)
 *   getLabel: (option) => string — shown in the trigger and as the main option label
 *   getSecondary: (option) => string — optional subtitle (e.g. supplier code)
 *   matchFields: array of field names to search against (defaults: ['name','code'])
 *   placeholder: string
 *   testId: data-testid for the trigger
 *   disabled: boolean
 */
export const SearchableSelect = ({
  options = [],
  value,
  onChange,
  getLabel = (o) => o?.name || '',
  getSecondary = (o) => o?.code || '',
  matchFields = ['name', 'code'],
  placeholder = 'Select…',
  testId,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const selected = options.find(o => o.id === value);

  const filtered = options.filter(o => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return matchFields.some(f => String(o?.[f] || '').toLowerCase().includes(q));
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
          {selected ? (
            <>
              {getSecondary(selected) && <span className="mono text-xs font-medium mr-1">{getSecondary(selected)}</span>}
              {getLabel(selected)}
            </>
          ) : placeholder}
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
                placeholder={`Search by ${matchFields.join(' or ')}…`}
                className="w-full pl-8 pr-7 py-1.5 text-sm border border-[#D1D5DB] rounded-sm focus:outline-none focus:ring-1 focus:ring-[#1D3557]"
                data-testid={`${testId || 'ss'}-search-input`}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827]">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="text-[10px] text-[#6B7280] mt-1">{filtered.length} of {options.length}</div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-[#9CA3AF] text-center">No match for "{query}"</div>
            ) : (
              filtered.slice(0, 200).map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange(o.id); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#F3F4F6] border-b border-[#F9FAFB] last:border-0 ${value === o.id ? 'bg-[#E1EFFE] text-[#1E429F] font-medium' : ''}`}
                  data-testid={`${testId || 'ss'}-option-${o.id}`}
                >
                  {getSecondary(o) && <span className="mono text-xs font-medium">{getSecondary(o)}</span>}
                  <span className={getSecondary(o) ? 'ml-2' : ''}>{getLabel(o)}</span>
                </button>
              ))
            )}
            {filtered.length > 200 && (
              <div className="p-2 text-[10px] text-[#9CA3AF] text-center italic">Showing first 200. Refine your search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
