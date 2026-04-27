import { useEffect, useCallback } from 'react';

/**
 * Attach drag-to-resize handles to every <th> inside the table whose ref is
 * passed in. Handles are appended once per <th> and survive re-renders.
 *
 * Usage:
 *   const tableRef = useRef(null);
 *   useResizableColumns(tableRef, [items.length]); // pass dependencies that indicate table is ready
 *   return <table ref={tableRef} className="data-table">…</table>;
 *
 * The handle is a 6px-wide div hugging the right edge. Mouse-down begins a
 * resize session: the th's width is set inline in pixels, and is updated as
 * the cursor moves. Releasing the mouse ends the session. No state is stored —
 * widths persist on the DOM until the table unmounts. (Good enough for this
 * UX; the user can re-resize any time.)
 *
 * @param {React.RefObject} tableRef - ref to the table element
 * @param {Array} deps - additional dependencies to trigger re-attachment (e.g., [items.length])
 */
export default function useResizableColumns(tableRef, deps = []) {
  useEffect(() => {
    const table = tableRef?.current;
    if (!table) return;

    const ths = table.querySelectorAll('thead th');
    if (!ths.length) return;

    // LOCK column widths to their browser-computed natural distribution AND
    // switch the table to fixed layout. Without this, sorting (which changes
    // which rows are at the top) causes the browser to reflow the columns
    // because table-layout:auto sizes columns by content. Locking widths +
    // table-layout:fixed makes columns stable while still allowing the
    // resize handles to widen/narrow them.
    requestAnimationFrame(() => {
      const widths = Array.from(ths).map((th) => th.getBoundingClientRect().width);
      ths.forEach((th, i) => {
        const w = widths[i];
        if (w && !th.style.width) {
          th.style.width = w + 'px';
          th.style.minWidth = w + 'px';
          th.style.maxWidth = w + 'px';
        }
      });
      table.style.tableLayout = 'fixed';
    });

    const cleanups = [];
    ths.forEach((th) => {
      // Avoid double-attaching when React re-renders rows (the same th element
      // may be reused).
      if (th.querySelector(':scope > .col-resizer')) return;

      const handle = document.createElement('div');
      handle.className = 'col-resizer';
      th.appendChild(handle);

      let startX = 0;
      let startWidth = 0;

      const onMove = (e) => {
        const dx = e.clientX - startX;
        const next = Math.max(40, startWidth + dx);
        th.style.width = next + 'px';
        th.style.minWidth = next + 'px';
        th.style.maxWidth = next + 'px';
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = th.getBoundingClientRect().width;
        handle.classList.add('resizing');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
      handle.addEventListener('mousedown', onDown);

      cleanups.push(() => {
        handle.removeEventListener('mousedown', onDown);
        if (handle.parentNode) handle.parentNode.removeChild(handle);
      });
    });

    return () => { cleanups.forEach((fn) => fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRef, ...deps]);
}
