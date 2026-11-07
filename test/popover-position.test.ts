import { describe, expect, it } from "vitest";
import { computePopoverPosition } from "../app/features/list/popover-position";

describe("computePopoverPosition (#140, #138)", () => {
  const defaultViewport = { width: 1024, height: 768 };
  const popoverSize = { width: 140, height: 180 };

  it("opens below by default when space allows", () => {
    const triggerRect = {
      top: 100,
      bottom: 130,
      left: 500,
      right: 580,
      width: 80,
      height: 30,
    };

    const pos = computePopoverPosition({
      triggerRect,
      popoverSize,
      viewport: defaultViewport,
      align: "end",
      offset: 4,
      padding: 8,
    });

    expect(pos.placement).toBe("bottom");
    expect(pos.top).toBe(134); // 130 + 4
    expect(pos.left).toBe(440); // 580 - 140
  });

  it("flips above trigger when opening on the last item near the bottom of viewport (#140)", () => {
    const triggerRect = {
      top: 700,
      bottom: 730,
      left: 500,
      right: 580,
      width: 80,
      height: 30,
    };

    const pos = computePopoverPosition({
      triggerRect,
      popoverSize,
      viewport: defaultViewport,
      align: "end",
      offset: 4,
      padding: 8,
    });

    // Space below is 768 - 730 - 4 - 8 = 26px (< 180px), space above is 700 - 4 - 8 = 688px (fits!)
    expect(pos.placement).toBe("top");
    expect(pos.top).toBe(516); // 700 - 4 - 180
    expect(pos.top).toBeGreaterThanOrEqual(8);
  });

  it("aligns to start when requested", () => {
    const triggerRect = {
      top: 100,
      bottom: 130,
      left: 200,
      right: 280,
      width: 80,
      height: 30,
    };

    const pos = computePopoverPosition({
      triggerRect,
      popoverSize,
      viewport: defaultViewport,
      align: "start",
      offset: 4,
      padding: 8,
    });

    expect(pos.left).toBe(200);
  });

  it("clamps left edge so popover never overflows the left of a narrow screen (#138)", () => {
    const narrowViewport = { width: 360, height: 640 };
    const widePopover = { width: 160, height: 120 };
    // Stopwatch button situated at left margin
    const triggerRect = {
      top: 200,
      bottom: 224,
      left: 24,
      right: 48,
      width: 24,
      height: 24,
    };

    const pos = computePopoverPosition({
      triggerRect,
      popoverSize: widePopover,
      viewport: narrowViewport,
      align: "end", // Old behavior tried to grow leftward from 48 -> -112
      offset: 4,
      padding: 8,
    });

    expect(pos.left).toBe(8); // Clamped to padding
    expect(pos.left + widePopover.width).toBeLessThanOrEqual(narrowViewport.width - 8);
  });

  it("clamps right edge so popover never overflows the right screen margin", () => {
    const narrowViewport = { width: 360, height: 640 };
    const triggerRect = {
      top: 200,
      bottom: 224,
      left: 320,
      right: 350,
      width: 30,
      height: 24,
    };

    const pos = computePopoverPosition({
      triggerRect,
      popoverSize,
      viewport: narrowViewport,
      align: "start",
      offset: 4,
      padding: 8,
    });

    // 320 + 140 = 460 > 360, so must clamp to 360 - 140 - 8 = 212
    expect(pos.left).toBe(212);
    expect(pos.left + popoverSize.width).toBeLessThanOrEqual(narrowViewport.width - 8);
  });

  it("sets a safe maxHeight when screen space is constrained", () => {
    const tinyViewport = { width: 320, height: 200 };
    const tallPopover = { width: 100, height: 300 };
    const triggerRect = {
      top: 150,
      bottom: 174,
      left: 50,
      right: 100,
      width: 50,
      height: 24,
    };

    const pos = computePopoverPosition({
      triggerRect,
      popoverSize: tallPopover,
      viewport: tinyViewport,
      offset: 4,
      padding: 8,
    });

    expect(pos.placement).toBe("top");
    expect(pos.maxHeight).toBeLessThanOrEqual(200);
    expect(pos.maxHeight).toBeGreaterThanOrEqual(80);
  });
});
