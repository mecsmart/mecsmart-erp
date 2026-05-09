import React from 'react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card';

/**
 * Compact item hover-card — shows Name, Description, and Current Stock when
 * the user hovers over a part-number / item label. Used in BOM parent/line
 * displays so factory floor users can confirm stock availability without
 * navigating to the Items page.
 *
 * Props:
 *   - item: full item object from /api/items (or items[lite=1]). At minimum
 *     needs `name`, optionally `description` and `current_stock`.
 *   - children: the trigger element (the visible part number / pill).
 */
export function ItemHoverCard({ item, children }) {
  if (!item) return children;
  const stock = item.current_stock ?? item.stock ?? null;
  const uom = item.unit_of_measure || item.uom || 'pcs';
  return (
    <HoverCard openDelay={250} closeDelay={80}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3 z-[10000]" sideOffset={8} align="start">
        <div className="text-xs text-[#1D3557] font-bold uppercase tracking-wide mb-1">
          {item.part_number ? `${item.part_number} · ${item.name}` : item.name}
        </div>
        {item.description ? (
          <div className="text-xs text-[#374151] leading-snug mb-2 whitespace-pre-line">
            {item.description}
          </div>
        ) : (
          <div className="text-xs italic text-[#9CA3AF] mb-2">No description</div>
        )}
        <div className="border-t border-[#E5E7EB] pt-2 flex items-center justify-between text-xs">
          <span className="text-[#6B7280]">Current Stock</span>
          <span className={`font-mono font-semibold ${stock === null ? 'text-[#9CA3AF]' : stock <= 0 ? 'text-[#9B1C1C]' : 'text-[#03543F]'}`}>
            {stock === null ? '—' : `${stock} ${uom}`}
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default ItemHoverCard;
