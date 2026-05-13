import { useEffect } from 'react';

/**
 * Attach drag-to-resize handles to every <th> inside the table whose ref is
 * passed in. Handles are appended once per <th> and survive re-renders.
 *
 * Usage:
 *   const tableRef = useRef(null);
 *   useResizableColumns(tableRef, [items.length]);
 *   return <table ref={tableRef} className="data-table">…</table>;
 *
 * Implementation notes:
 *  - Locks each <th> to its natural-distribution width on mount and switches
 *    the <table> to `table-layout: fixed`. Sorting / filtering / re-rendering
 *    no longer reflow column widths.
 *  - When the user drags a column wider, the NEXT sibling <th> is shrunk by
 *    the same delta (clamped to MIN_WIDTH) — so the total table width
 *    REMAINS CONSTANT. This prevents the page from expanding beyond the
 *    viewport when a column is enlarged. If the next sibling is already at
 *    its minimum, the drag stops (no further widening) instead of pushing
 *    the table past its container.
 *  - Resize handles are 6px-wide divs hugging the right edge. Mouse-down
 *    begins a resize session.
 *
 * @param {React.RefObject} tableRef - ref to the table element
 * @param {Array} deps - additional deps that signal the table is ready
 */
export default function useResizableColumns(tableRef, deps = []) {
  useEffect(() => {
    const table = tableRef?.current;
    if (!table) return;

    const ths = table.querySelectorAll('thead th');
    if (!ths.length) return;

    const syncTableWidth = () => {
      let total = 0;
      ths.forEach((th) => { total += th.getBoundingClientRect().width; });
      table.style.width = total + 'px';
      table.style.minWidth = total + 'px';
    };

    // One-shot lock-in of natural widths + flip to fixed layout. Without RAF
    // the column widths may still be 0 because layout hasn't been computed.
    requestAnimationFrame(() => {
      const widths = Array.from(ths).map((th) => th.getBoundingClientRect().width);
      let total = 0;
      ths.forEach((th, i) => {
        const w = Math.max(40, widths[i] || 80);
        total += w;
        if (!th.style.width) {
          th.style.width = w + 'px';
          th.style.minWidth = w + 'px';
          th.style.maxWidth = w + 'px';
        }
      });
      table.style.tableLayout = 'fixed';
      table.style.width = total + 'px';
      table.style.minWidth = total + 'px';
      // Hard upper bound — once locked, the table cannot grow wider than its
      // initial natural width (sum of column natural widths). Subsequent
      // drags redistribute width AMONG columns rather than pushing the table
      // off-screen.
      table.style.maxWidth = total + 'px';
    });

    const cleanups = [];
    // Minimum allowed column width — anything thinner becomes unreadable.
    const MIN_WIDTH = 40;
    // Lock <th> widths via inline style so the table stays in sync. Resizing
    // a single column will steal width from the immediate-next column rather
    // than expanding the table.
    const setThWidth = (th, w) => {
      const clamped = Math.max(MIN_WIDTH, w);
      th.style.width = clamped + 'px';
      th.style.minWidth = clamped + 'px';
      th.style.maxWidth = clamped + 'px';
    };
    ths.forEach((th, idx) => {
      // Avoid double-attaching when React re-renders rows (same <th> reused).
      if (th.querySelector(':scope > .col-resizer')) return;

      const handle = document.createElement('div');
      handle.className = 'col-resizer';
      th.appendChild(handle);

      let startX = 0;
      let startWidth = 0;
      let startNextWidth = 0;
      // The next-sibling <th> we'll steal width from when this column is
      // widened. May be null if this is the LAST column.
      let nextTh = null;
      // True briefly after a drag — used to suppress the synthetic click
      // event the browser fires on mouseup, which would otherwise reach the
      // <th>'s onClick={togglePartNumberSort} and reorder the items.
      let didResize = false;

      const onMove = (e) => {
        didResize = true;
        const dx = e.clientX - startX;
        if (nextTh) {
          // Steal width from the next column. Clamp so neither column shrinks
          // below MIN_WIDTH — i.e. the user can't drag past the point where
          // the next column would disappear.
          const maxIncrease = startNextWidth - MIN_WIDTH;  // how much we can take
          const maxDecrease = startWidth - MIN_WIDTH;       // how much this can lose
          const delta = Math.min(maxIncrease, Math.max(-maxDecrease, dx));
          setThWidth(th, startWidth + delta);
          setThWidth(nextTh, startNextWidth - delta);
        } else {
          // No sibling to steal from — just resize this column and let the
          // table grow (preserving the prior behavior for the last column).
          setThWidth(th, startWidth + dx);
          syncTableWidth();
        }
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Reset the resize flag on the next tick — AFTER the synthetic click
        // event fires (and is swallowed by `onClickCapture` below).
        setTimeout(() => { didResize = false; }, 0);
      };
      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = th.getBoundingClientRect().width;
        // Capture the current width of the next sibling THE INSTANT the drag
        // starts. We re-fetch every drag because columns may have been
        // resized by previous drags.
        nextTh = ths[idx + 1] || null;
        startNextWidth = nextTh ? nextTh.getBoundingClientRect().width : 0;
        didResize = false;
        handle.classList.add('resizing');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
      handle.addEventListener('mousedown', onDown);

      // Block the click event on EITHER the handle itself OR the <th>
      // immediately after a resize. Without this, the th's onClick fires
      // and re-sorts the table — exactly the user-reported bug.
      const onHandleClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      handle.addEventListener('click', onHandleClick);

      const onThClickCapture = (e) => {
        if (didResize) {
          e.stopPropagation();
          e.preventDefault();
        }
      };
      // Capture phase so we run BEFORE React's synthetic onClick handler.
      th.addEventListener('click', onThClickCapture, true);

      cleanups.push(() => {
        handle.removeEventListener('mousedown', onDown);
        handle.removeEventListener('click', onHandleClick);
        th.removeEventListener('click', onThClickCapture, true);
        if (handle.parentNode) handle.parentNode.removeChild(handle);
      });
    });

    return () => { cleanups.forEach((fn) => fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRef, ...deps]);
}
