import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useDraggableRows — minimal HTML5 drag-and-drop row reordering for any
 * line-item array (PO, Quotation, Tax Invoice, etc.).
 *
 * Auto-scrolls the nearest scrollable ancestor (or the window) when the cursor
 * approaches the top/bottom edge during a drag. This avoids the "screen frozen,
 * can't reach the row I want" UX.
 *
 * Usage:
 *   const { getRowProps } = useDraggableRows(
 *     formData.lines,
 *     (next) => setFormData({ ...formData, lines: next })
 *   );
 *   ...
 *   <tr key={i} {...getRowProps(i)}>
 *     <td className="row-num drag-handle" title="Drag to reorder">{i + 1}</td>
 *     ...
 *   </tr>
 *
 * Visual hint: rows being dragged drop their opacity to 40%; the row currently
 * under the cursor gets a 2px navy top border via `is-drop-target` (styled in
 * /app/frontend/src/index.css).
 */

// Edge band (px from viewport top / bottom) within which we auto-scroll while
// dragging. Wider band = easier to trigger; tighter = less accidental scroll.
const SCROLL_EDGE = 80;
// Pixels per animation frame at the edge. Higher = faster scroll; we ramp by
// proximity to the edge (closer → faster).
const SCROLL_MAX_SPEED = 18;


function findScrollableAncestor(el) {
  let node = el && el.parentElement;
  while (node && node !== document.body) {
    const cs = window.getComputedStyle(node);
    const oy = cs.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null; // fall back to window
}


export const useDraggableRows = (rows, onReorder) => {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Auto-scroll machinery — refs only, no re-render on every dragover frame.
  const scrollSpeedRef = useRef(0);
  const scrollContainerRef = useRef(null);
  const rafRef = useRef(null);

  const stopAutoScroll = useCallback(() => {
    scrollSpeedRef.current = 0;
    scrollContainerRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tickScroll = useCallback(() => {
    const speed = scrollSpeedRef.current;
    if (speed === 0) {
      rafRef.current = null;
      return;
    }
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop += speed;
    } else {
      window.scrollBy(0, speed);
    }
    rafRef.current = requestAnimationFrame(tickScroll);
  }, []);

  // Cleanup any in-flight rAF on unmount
  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  const updateAutoScroll = useCallback((clientY, currentTarget) => {
    // Resolve & cache the container on first hit of a drag — cheap on subsequent calls.
    if (!scrollContainerRef.current) {
      scrollContainerRef.current = findScrollableAncestor(currentTarget);
    }
    const container = scrollContainerRef.current;
    let topEdge = 0;
    let bottomEdge = window.innerHeight;
    if (container) {
      const r = container.getBoundingClientRect();
      topEdge = r.top;
      bottomEdge = r.bottom;
    }
    const distFromTop = clientY - topEdge;
    const distFromBottom = bottomEdge - clientY;

    let speed = 0;
    if (distFromTop < SCROLL_EDGE) {
      // Closer to the edge → faster (linear ramp). Negative = scroll up.
      const intensity = (SCROLL_EDGE - distFromTop) / SCROLL_EDGE;
      speed = -Math.ceil(SCROLL_MAX_SPEED * Math.max(0, Math.min(1, intensity)));
    } else if (distFromBottom < SCROLL_EDGE) {
      const intensity = (SCROLL_EDGE - distFromBottom) / SCROLL_EDGE;
      speed = Math.ceil(SCROLL_MAX_SPEED * Math.max(0, Math.min(1, intensity)));
    }
    scrollSpeedRef.current = speed;
    if (speed !== 0 && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tickScroll);
    }
  }, [tickScroll]);

  const handleDragStart = useCallback((idx) => (e) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) { /* noop */ }
  }, []);

  const handleDragOver = useCallback((idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && dragIndex !== idx) setDropTarget(idx);
    updateAutoScroll(e.clientY, e.currentTarget);
  }, [dragIndex, updateAutoScroll]);

  const handleDragLeave = useCallback(() => (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((idx) => (e) => {
    e.preventDefault();
    stopAutoScroll();
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null); setDropTarget(null); return;
    }
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    onReorder(next);
    setDragIndex(null);
    setDropTarget(null);
  }, [dragIndex, rows, onReorder, stopAutoScroll]);

  const handleDragEnd = useCallback(() => {
    stopAutoScroll();
    setDragIndex(null);
    setDropTarget(null);
  }, [stopAutoScroll]);

  const getRowProps = useCallback((idx) => ({
    draggable: true,
    onDragStart: handleDragStart(idx),
    onDragOver: handleDragOver(idx),
    onDragLeave: handleDragLeave(idx),
    onDrop: handleDrop(idx),
    onDragEnd: handleDragEnd,
    className: [
      dragIndex === idx ? 'is-dragging' : '',
      dropTarget === idx ? 'is-drop-target' : '',
    ].filter(Boolean).join(' '),
  }), [dragIndex, dropTarget, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd]);

  return { dragIndex, dropTarget, getRowProps };
};
