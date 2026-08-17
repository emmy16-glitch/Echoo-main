import React, {
  useRef,
} from "react";

import "./HorizontalDragRail.css";

const HorizontalDragRail = ({
  children,
  className = "",
  ariaLabel = "Scrollable content",
  peek = true,
}) => {
  const railRef =
    useRef(null);

  const dragRef =
    useRef({
      active: false,
      dragged: false,
      startX: 0,
      scrollLeft: 0,
      pointerId: null,
    });

  const startDrag =
    (
      event
    ) => {
      if (
        event.pointerType ===
          "mouse" &&
        event.button !==
          0
      ) {
        return;
      }

      const rail =
        railRef.current;

      if (!rail) {
        return;
      }

      dragRef.current = {
        active: true,
        dragged: false,
        startX:
          event.clientX,
        scrollLeft:
          rail.scrollLeft,
        pointerId:
          event.pointerId,
      };

      rail.classList.add(
        "is-pointer-down"
      );

      try {
        rail.setPointerCapture(
          event.pointerId
        );
      } catch {
        //
      }
    };

  const moveDrag =
    (
      event
    ) => {
      const state =
        dragRef.current;

      const rail =
        railRef.current;

      if (
        !state.active ||
        !rail
      ) {
        return;
      }

      const delta =
        event.clientX -
        state.startX;

      if (
        Math.abs(
          delta
        ) >
        5
      ) {
        state.dragged =
          true;

        rail.classList.add(
          "is-dragging"
        );
      }

      if (
        !state.dragged
      ) {
        return;
      }

      event.preventDefault();

      rail.scrollLeft =
        state.scrollLeft -
        delta;
    };

  const finishDrag =
    (
      event
    ) => {
      const rail =
        railRef.current;

      if (!rail) {
        return;
      }

      dragRef.current.active =
        false;

      rail.classList.remove(
        "is-pointer-down"
      );

      rail.classList.remove(
        "is-dragging"
      );

      try {
        if (
          dragRef.current
            .pointerId !==
          null
        ) {
          rail.releasePointerCapture(
            dragRef.current
              .pointerId
          );
        }
      } catch {
        //
      }

      if (
        event?.pointerId ===
        dragRef.current
          .pointerId
      ) {
        dragRef.current.pointerId =
          null;
      }
    };

  const stopDraggedClick =
    (
      event
    ) => {
      if (
        dragRef.current
          .dragged
      ) {
        event.preventDefault();
        event.stopPropagation();

        dragRef.current.dragged =
          false;
      }
    };

  const handleWheel =
    (
      event
    ) => {
      const rail =
        railRef.current;

      if (!rail) {
        return;
      }

      if (
        event.shiftKey &&
        Math.abs(
          event.deltaY
        ) >
          Math.abs(
            event.deltaX
          )
      ) {
        event.preventDefault();

        rail.scrollLeft +=
          event.deltaY;
      }
    };

  return (
    <div
      className={`echoo-rail-shell ${
        peek
          ? "has-peek"
          : ""
      }`}
    >
      <div
        ref={
          railRef
        }
        className={`echoo-drag-rail ${className}`}
        role="region"
        aria-label={
          ariaLabel
        }
        tabIndex={0}
        onPointerDown={
          startDrag
        }
        onPointerMove={
          moveDrag
        }
        onPointerUp={
          finishDrag
        }
        onPointerCancel={
          finishDrag
        }
        onLostPointerCapture={
          finishDrag
        }
        onClickCapture={
          stopDraggedClick
        }
        onWheel={
          handleWheel
        }
        onDragStart={(
          event
        ) =>
          event.preventDefault()
        }
      >
        {children}
      </div>
    </div>
  );
};

export default HorizontalDragRail;
