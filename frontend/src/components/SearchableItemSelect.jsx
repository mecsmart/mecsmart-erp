import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';

/**
 * Searchable item dropdown — INLINE variant (search-first).
 * Type to see matches immediately; click a match to select.
 *
 * The dropdown panel is rendered through a `react-dom` portal anchored to
 * `document.body` and positioned with `position: fixed` from the input's
 * bounding rect. This sidesteps the common bug where an enclosing
 * `overflow-x-auto` (e.g. the line-items-grid scroll container or a Dialog
 * with overflow-y-auto) clips the dropdown.
 *
 * Props:
 *   items: full list of items (id, part_number, name, description, category)
 *   value: currently selected id
 *   onChange: callback (id)
 *   placeholder: string
 *   filter: optional (item) => boolean to pre-filter list
 *   showCategory: default true — shows (category) label next to name
 *   testId: data-testid prefix
 *   disabled: bool
 *   allowClear: bool — show X when an item is selected
 */
export const SearchableItemSelect = ({
  items = [],
  value,
  onChange,
  placeholder = 'Type to search by part no., name, or description…',
  filter,
  showCategory = true,
  testId,
  disabled,
  allowClear = true,
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [rect, setRect] = useState(null); // input's getBoundingClientRect — drives the portal panel position
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  const selected = items.find(i => i.id === value);

  const baseList = filter ? items.filter(filter) : items;
  const list = baseList.filter(i => {
    if (!query.trim()) return false; // Wait for at least one keystroke before flooding
    const q = query.toLowerCase();
    return (
      (i.part_number || '').toLowerCase().includes(q) ||
      (i.name || '').toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q)
    );
  }).slice(0, 200);

  // Track outside-click → close panel
  useEffect(() => {
    const handler = (e) => {
      const insideWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const insidePanel = panelRef.current && panelRef.current.contains(e.target);
      if (!insideWrap && !insidePanel) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Recompute panel position whenever the input's rect changes (focus, scroll,
  // resize, dialog reposition). Using `position: fixed` means we re-read from
  // viewport coords, which stay accurate during ancestor scrolls.
  useLayoutEffect(() => {
    if (!focused || !inputRef.current) return undefined;
    const update = () => {
      const r = inputRef.current.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width, inputBottom: r.bottom, inputTop: r.top });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [focused, query]);

  const handleSelect = (item) => {
    onChange(item.id);
    setQuery('');
    setFocused(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  // Decide whether to flip the panel above the input when there's not enough
  // space below. Computed from `rect`.
  const panelMaxHeight = 320;
  const flipUp = rect && (window.innerHeight - rect.inputBottom < panelMaxHeight + 16) && rect.inputTop > panelMaxHeight + 16;

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
            ref={inputRef}
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

      {!selected && focused && query.trim() && rect && createPortal(
        <div
          ref={panelRef}
          className="bg-white border border-[#E5E7EB] rounded-sm shadow-lg overflow-y-auto"
          style={{
            position: 'fixed',
            top: flipUp ? rect.inputTop - Math.min(panelMaxHeight, list.length * 44 + 28) - 4 : rect.inputBottom + 4,
            left: rect.left,
            width: rect.width,
            maxHeight: panelMaxHeight,
            zIndex: 9999,
          }}
          data-testid={`${testId || 'ss'}-panel`}
        >
          <div className="px-3 py-1 text-[10px] text-[#6B7280] uppercase tracking-wide border-b border-[#F3F4F6] sticky top-0 bg-white">
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
                <div className="flex items-center gap-2">
                  <span className="mono font-semibold text-xs">{i.part_number}</span>
                  <span className="truncate">{i.name}</span>
                  {showCategory && i.category && (
                    <span className="ml-auto text-[10px] text-[#6B7280] italic shrink-0">({i.category.replace('_', ' ')})</span>
                  )}
                </div>
                {i.description && (
                  <div className="text-[11px] text-[#6B7280] truncate mt-0.5">{i.description}</div>
                )}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};
