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

  // Native non-passive wheel handler on the dropdown panel. Radix Dialog
  // wraps its tree with `react-remove-scroll` which globally blocks wheel
  // events outside the dialog content. Our panel is portal'd to
  // document.body so it gets caught by that lock — without this, the user
  // sees the list but the mouse-wheel does nothing. We bypass the lock by:
  //   1. Attaching `wheel` as a NATIVE listener (React 19's JSX `onWheel`
  //      is passive, so `preventDefault()` would be ignored).
  //   2. Manually adjusting `panel.scrollTop += deltaY` and preventing the
  //      default + propagation so `react-remove-scroll`'s body lock leaves
  //      our scroll alone.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (el.scrollHeight <= el.clientHeight) return; // nothing to scroll
      el.scrollTop += e.deltaY;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [focused, query, list.length]);

  const handleSelect = (item) => {
    onChange(item.id);
    setQuery('');
    setFocused(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  // Decide whether to flip the panel above the input. Rule: flip up whenever
  // there's MORE room above than below. This keeps the dropdown comfortably
  // visible regardless of where the input sits inside the dialog.
  const panelMaxHeight = 320;
  let flipUp = false;
  let availableHeight = panelMaxHeight;
  if (rect) {
    const spaceBelow = window.innerHeight - rect.inputBottom - 16;
    const spaceAbove = rect.inputTop - 16;
    flipUp = spaceAbove > spaceBelow && spaceBelow < panelMaxHeight;
    availableHeight = Math.min(panelMaxHeight, Math.max(120, flipUp ? spaceAbove : spaceBelow));
  }
  // Panel height: when there are matches, scale by row count (44px per row +
  // 28px sticky header). When the list is empty (0 matches), reserve a fixed
  // ~80px so the "No items found" empty state doesn't get clipped or — when
  // flipped up — overlap the input above it.
  const estimatedPanelHeight = list.length === 0 ? 80 : Math.min(availableHeight, list.length * 44 + 28);
  let panelTop = rect ? rect.inputBottom + 4 : 0;
  if (rect && flipUp) {
    // Don't allow negative top (would push panel above viewport, hidden);
    // clamp at 8px from top edge so it stays usable even when the input is
    // near the top of the viewport with little space below it.
    panelTop = Math.max(8, rect.inputTop - estimatedPanelHeight - 4);
  }

  return (
    <div ref={wrapRef} className="relative">
      {selected ? (
        <div
          className="flex items-center justify-between h-10 w-full rounded-sm border border-[#D1D5DB] bg-[#F0F9FF] px-3 py-2 text-sm"
          data-testid={testId}
          // Native tooltip on the chip — when the part number / name overflows
          // its column, hovering reveals the full label so the user doesn't
          // have to expand the dialog or scroll horizontally to read it.
          title={`${selected.part_number || ''}${selected.part_number && selected.name ? ' · ' : ''}${selected.name || ''}${selected.description ? `\n${selected.description}` : ''}`}
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
            className={`h-10 w-full rounded-sm border border-[#D1D5DB] bg-white pl-8 ${query ? 'pr-9' : 'pr-3'} py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D3557] disabled:opacity-50`}
            data-testid={testId}
            autoComplete="off"
          />
          {/* In-input clear button — visible whenever the user has typed
              something but hasn't picked a match yet. Solves the "0 results
              and panel blocks me from editing" complaint by giving a single
              click to wipe the query and start over. */}
          {query && !disabled && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setQuery(''); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[#9CA3AF] hover:text-[#9B1C1C] hover:bg-[#FDE8E8] rounded"
              title="Clear search"
              data-testid={`${testId || 'ss'}-clear-input`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {!selected && focused && query.trim() && rect && createPortal(
        <div
          ref={panelRef}
          className="bg-white border border-[#E5E7EB] rounded-sm shadow-lg overflow-y-auto overscroll-contain"
          style={{
            position: 'fixed',
            top: panelTop,
            left: rect.left,
            width: rect.width,
            maxHeight: availableHeight,
            zIndex: 9999,
            // Radix Dialog's RemoveScroll / ScrollLock sets `pointer-events: none`
            // on <body> when a modal dialog is open. Since this panel is portal'd
            // to document.body, it inherits that "no hit-testing" unless we
            // explicitly opt back in here.
            pointerEvents: 'auto',
          }}
          data-testid={`${testId || 'ss'}-panel`}
          // Radix Dialog / Popover etc. register a DismissableLayer that cancels
          // pointerdown events happening outside their DOM subtree. Because this
          // panel is portal'd to document.body (outside the Dialog content),
          // Radix treats clicks here as "outside" → option onClick never fires.
          // Stopping propagation on pointerdown/mousedown lets the option click
          // register normally while still allowing outside-click detection for
          // clicks truly outside both the dialog and this panel.
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          // Manual wheel handling is attached as a NATIVE non-passive
          // listener via `useEffect` below — React 19 attaches JSX
          // `onWheel` as PASSIVE which makes `preventDefault()` a no-op.
        >
          <div className="px-3 py-1 text-[10px] text-[#6B7280] uppercase tracking-wide border-b border-[#F3F4F6] sticky top-0 bg-white">
            {list.length} match{list.length !== 1 ? 'es' : ''} for "{query}"
          </div>
          {list.length === 0 ? (
            <div className="p-3 text-xs text-[#9CA3AF] text-center italic">No items found</div>
          ) : (
            list.map(i => {
              // Show live availability inline so the user picks an item knowing
              // how much stock is on hand — critical for sales invoicing and
              // production planning. Green when in-stock, amber when low (≤
              // reorder_level), red when zero/negative.
              const stock = Number(i.current_stock ?? 0);
              const reorder = Number(i.reorder_level ?? 0);
              const uom = i.unit_of_measure || i.uom || '';
              const stockColor = stock <= 0
                ? 'bg-[#FDE8E8] text-[#9B1C1C]'
                : (reorder > 0 && stock <= reorder)
                  ? 'bg-[#FEF3C7] text-[#92400E]'
                  : 'bg-[#DEF7EC] text-[#03543F]';
              return (
              <button
                key={i.id}
                type="button"
                // IMPORTANT: Radix Dialog's DismissableLayer intercepts `click`
                // events on portal'd siblings, causing our onClick to never fire
                // (the input blurs and the panel unmounts before click completes).
                // Using `onMouseDown` instead fires BEFORE the blur/unmount race.
                onMouseDown={(e) => { e.preventDefault(); handleSelect(i); }}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[#F3F4F6] border-b border-[#F9FAFB] last:border-0"
                data-testid={`${testId || 'ss'}-option-${i.id}`}
              >
                <div className="flex items-start gap-2">
                  <span className="mono font-semibold text-xs shrink-0">{i.part_number}</span>
                  {/* Allow the name to wrap onto multiple lines so long item
                      names are visible without hover (user feedback: search
                      results were getting truncated to ellipsis). */}
                  <span className="break-words flex-1">{i.name}</span>
                  <span className={`text-[10px] mono px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${stockColor}`} title={`In-stock: ${stock} ${uom}${reorder > 0 ? ` · Reorder ≤ ${reorder}` : ''}`}>
                    {stock} {uom}
                  </span>
                  {showCategory && i.category && (
                    <span className="text-[10px] text-[#6B7280] italic shrink-0">({i.category.replace('_', ' ')})</span>
                  )}
                </div>
                {i.description && (
                  <div className="text-[11px] text-[#6B7280] break-words mt-0.5">{i.description}</div>
                )}
              </button>
              );
            })
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};
