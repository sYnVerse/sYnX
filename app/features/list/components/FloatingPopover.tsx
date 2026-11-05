import React, { useEffect, useLayoutEffect, useSyncExternalStore, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { computePopoverPosition } from "../popover-position";

interface FloatingPopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
}

const emptySubscribe = () => () => {};

export const FloatingPopover: React.FC<FloatingPopoverProps> = ({
  open,
  onClose,
  triggerRef,
  align = "end",
  className = "",
  children,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const updatePosition = useCallback(() => {
    if (!open || !triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverEl = popoverRef.current;
    const popoverSize = {
      width: popoverEl.offsetWidth,
      height: popoverEl.offsetHeight,
    };
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const pos = computePopoverPosition({
      triggerRect,
      popoverSize,
      viewport,
      align,
      offset: 4,
      padding: 8,
    });

    setCoords({
      top: pos.top,
      left: pos.left,
      maxHeight: pos.maxHeight,
    });
  }, [open, triggerRef, align]);

  // Use layout effect for immediate positioning upon opening
  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

  // Recalculate on scroll, resize, or child DOM mutation
  useEffect(() => {
    if (!open) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && popoverRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updatePosition();
      });
      resizeObserver.observe(popoverRef.current);
    }

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      resizeObserver?.disconnect();
    };
  }, [open, updatePosition]);

  // Dismiss on outside click and Escape key
  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: coords ? `${coords.top}px` : "-9999px",
        left: coords ? `${coords.left}px` : "-9999px",
        maxHeight: coords ? `${coords.maxHeight}px` : undefined,
        maxWidth: "calc(100vw - 16px)",
        zIndex: 9999,
      }}
      className={className}
    >
      {children}
    </div>,
    document.body
  );
};
