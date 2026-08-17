import { useRef } from 'react';

import './HorizontalDragRail.css';

const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [data-no-rail-drag="true"]';

const HorizontalDragRail = ({
  children,
  className = '',
  ariaLabel = 'Scrollable content',
  peek = true,
}) => {
  const railRef = useRef(null);
  const dragRef = useRef({
    active: false,
    dragged: false,
    startX: 0,
    scrollLeft: 0,
    pointerId: null,
  });

  const startDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const rail = railRef.current;
    if (!rail) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(INTERACTIVE_SELECTOR)) {
      dragRef.current = {
        active: false,
        dragged: false,
        startX: 0,
        scrollLeft: rail.scrollLeft,
        pointerId: null,
      };
      return;
    }

    dragRef.current = {
      active: true,
      dragged: false,
      startX: event.clientX,
      scrollLeft: rail.scrollLeft,
      pointerId: event.pointerId,
    };

    rail.classList.add('is-pointer-down');

    try {
      rail.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional; normal scrolling still works without it.
    }
  };

  const moveDrag = (event) => {
    const state = dragRef.current;
    const rail = railRef.current;

    if (!state.active || !rail) return;

    const delta = event.clientX - state.startX;
    if (Math.abs(delta) > 5) {
      state.dragged = true;
      rail.classList.add('is-dragging');
    }

    if (!state.dragged) return;

    event.preventDefault();
    rail.scrollLeft = state.scrollLeft - delta;
  };

  const finishDrag = (event) => {
    const rail = railRef.current;
    if (!rail) return;

    dragRef.current.active = false;
    rail.classList.remove('is-pointer-down');
    rail.classList.remove('is-dragging');

    try {
      if (dragRef.current.pointerId !== null) {
        rail.releasePointerCapture(dragRef.current.pointerId);
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }

    if (event?.pointerId === dragRef.current.pointerId) {
      dragRef.current.pointerId = null;
    }
  };

  const stopDraggedClick = (event) => {
    if (!dragRef.current.dragged) return;

    event.preventDefault();
    event.stopPropagation();
    dragRef.current.dragged = false;
  };

  const handleWheel = (event) => {
    const rail = railRef.current;
    if (!rail) return;

    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    }
  };

  return (
    <div className={`echoo-rail-shell ${peek ? 'has-peek' : ''}`}>
      <div
        ref={railRef}
        className={`echoo-drag-rail ${className}`}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onClickCapture={stopDraggedClick}
        onWheel={handleWheel}
        onDragStart={(event) => event.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
};

export default HorizontalDragRail;
