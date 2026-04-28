import { useState, useCallback } from 'react';

/**
 * useDraggableRows — minimal HTML5 drag-and-drop row reordering for any
 * line-item array (PO, Quotation, Tax Invoice, etc.).
 *
 * Usage:
 *   const { dragIndex, dropTarget, getRowProps } = useDraggableRows(
 *     formData.lines,
 *     (next) => setFormData({ ...formData, lines: next })
 *   );
 *   ...
 *   <tr key={i} {...getRowProps(i)}>
 *     <td className="row-num drag-handle" title="Drag to reorder">{i + 1}</td>
 *     ...
 *   </tr>
 *
 * Visual hint: rows being dragged drop their opacity to 50%; the row currently
 * under the cursor gets a 2px navy top/bottom border (depending on direction)
 * via the `is-drop-target` class — styled in /app/frontend/src/index.css.
 */
export const useDraggableRows = (rows, onReorder) => {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const handleDragStart = useCallback((idx) => (e) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox: dataTransfer must carry something
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) { /* noop */ }
  }, []);

  const handleDragOver = useCallback((idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && dragIndex !== idx) setDropTarget(idx);
  }, [dragIndex]);

  const handleDragLeave = useCallback(() => (e) => {
    // Only clear when the cursor truly leaves the row (not when entering a child)
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((idx) => (e) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null); setDropTarget(null); return;
    }
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    onReorder(next);
    setDragIndex(null);
    setDropTarget(null);
  }, [dragIndex, rows, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  // Returns props to spread onto the <tr>. Apps still attach the visible
  // drag handle to the row-num cell for affordance.
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
