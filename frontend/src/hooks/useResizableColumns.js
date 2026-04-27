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
 *  - Sets the <table>'s explicit width to the SUM of column widths (instead
 *    of leaving Tailwind's `w-full` to constrain it). When the user drags a
 *    column wider, the parent <table>'s width grows by the same delta — so
 *    the OTHER columns are not squeezed to compensate. The parent scroll
 *    container's `overflow-x: auto` then kicks in for horizontal scrolling.
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
    });

    const cleanups = [];
    ths.forEach((th) => {
      // Avoid double-attaching when React re-renders rows (same <th> reused).
      if (th.querySelector(':scope > .col-resizer')) return;

      const handle = document.createElement('div');
      handle.className = 'col-resizer';
      th.appendChild(handle);

      let startX = 0;
      let startWidth = 0;
      // True briefly after a drag — used to suppress the synthetic click
      // event the browser fires on mouseup, which would otherwise reach the
      // <th>'s onClick={togglePartNumberSort} and reorder the items.
      let didResize = false;

      const onMove = (e) => {
        didResize = true;
        const dx = e.clientX - startX;
        const next = Math.max(40, startWidth + dx);
        th.style.width = next + 'px';
        th.style.minWidth = next + 'px';
        th.style.maxWidth = next + 'px';
        // Grow the <table>'s width by the same delta so siblings keep their
        // widths and the parent gains horizontal scroll if needed.
        syncTableWidth();
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
