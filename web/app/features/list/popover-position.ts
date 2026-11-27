export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface SizeLike {
  width: number;
  height: number;
}

export interface ComputePopoverOptions {
  triggerRect: RectLike;
  popoverSize: SizeLike;
  viewport: SizeLike;
  align?: "start" | "end";
  offset?: number;
  padding?: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
  maxHeight: number;
}

/**
 * Computes viewport-aware fixed coordinates for floating popovers so they
 * flip above when near the bottom of a scrollable view and clamp within
 * screen boundaries horizontally.
 */
export function computePopoverPosition(options: ComputePopoverOptions): PopoverPosition {
  const {
    triggerRect,
    popoverSize,
    viewport,
    align = "end",
    offset = 4,
    padding = 8,
  } = options;

  const spaceBelow = viewport.height - triggerRect.bottom - offset - padding;
  const spaceAbove = triggerRect.top - offset - padding;

  const fitsBelow = spaceBelow >= popoverSize.height;
  const fitsAbove = spaceAbove >= popoverSize.height;

  let placement: "top" | "bottom" = "bottom";
  let top: number;
  let maxHeight: number;

  if (fitsBelow) {
    placement = "bottom";
    top = triggerRect.bottom + offset;
    maxHeight = Math.max(80, spaceBelow);
  } else if (fitsAbove || spaceAbove > spaceBelow) {
    placement = "top";
    top = Math.max(padding, triggerRect.top - offset - popoverSize.height);
    maxHeight = Math.max(80, spaceAbove);
  } else {
    placement = "bottom";
    top = triggerRect.bottom + offset;
    maxHeight = Math.max(80, spaceBelow);
  }

  // Horizontal calculation & screen-edge clamp
  const initialLeft =
    align === "start"
      ? triggerRect.left
      : triggerRect.right - popoverSize.width;

  const maxLeft = Math.max(padding, viewport.width - popoverSize.width - padding);
  const left = Math.min(Math.max(padding, initialLeft), maxLeft);

  return {
    top: Math.round(top),
    left: Math.round(left),
    placement,
    maxHeight: Math.round(maxHeight),
  };
}
