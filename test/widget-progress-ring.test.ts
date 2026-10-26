import { describe, it, expect } from "vitest";
// Plain CommonJS so the Expo config plugin can load it at prebuild.
import ring from "../mobile/plugins/widget-progress-ring.js";
import progressWidgetSource from "../mobile/src/widgets/ListProgressWidget.tsx?raw";
import appJson from "../mobile/app.json";

const {
  ringArcPath,
  ringTrackPath,
  ringVectorXml,
  ringDrawableName,
  allRingDrawables,
  RING_RADIUS,
  RING_STROKE_WIDTH,
  RING_VIEWBOX,
  RING_THEMES,
} = ring;

describe("widget progress ring drawables", () => {
  it("uses the web ring's geometry and colors", () => {
    // Web ProgressRing: viewBox 44, r=18, strokeWidth 3, slate-800/80 track, indigo-500 arc.
    expect(RING_VIEWBOX).toBe(44);
    expect(RING_RADIUS).toBe(18);
    expect(RING_STROKE_WIDTH).toBe(3);
    expect(RING_THEMES.dark).toEqual({ track: "#CC1E293B", progress: "#FF6366F1" });
  });

  it("always draws the background track, even at 0%", () => {
    expect(ringArcPath(0)).toBe("");
    const xml = ringVectorXml("dark", 0);
    expect(xml).toContain(`android:pathData="${ringTrackPath()}"`);
    expect(xml).toContain('android:strokeColor="#CC1E293B"');
    expect(xml).not.toContain("#FF6366F1");
  });

  it("starts the arc at 12 o'clock and runs clockwise", () => {
    expect(ringArcPath(25)).toBe("M22,4 A18,18 0 0,1 40,22");
    expect(ringArcPath(50)).toBe("M22,4 A18,18 0 0,1 22,40");
    expect(ringArcPath(75)).toBe("M22,4 A18,18 0 1,1 4,22");
    expect(ringArcPath(100)).toBe("M22,4 A18,18 0 1,1 22,40 A18,18 0 1,1 22,4");
    expect(ringVectorXml("dark", 50)).toContain('android:strokeLineCap="round"');
  });

  it("names one drawable per theme and whole percent", () => {
    expect(ringDrawableName("dark", 49.6)).toBe("synx_widget_ring_dark_50");
    expect(ringDrawableName("light", -5)).toBe("synx_widget_ring_light_0");
    expect(ringDrawableName(undefined, 140)).toBe("synx_widget_ring_dark_100");
    const all = allRingDrawables();
    expect(all).toHaveLength(202);
    for (const { name } of all) expect(name).toMatch(/^[a-z0-9_]+$/);
  });

  it("is wired into the widget and the app config", () => {
    expect(progressWidgetSource).toContain("synx_widget_ring_${isDark ? 'dark' : 'light'}_${progressPercent}");
    expect(progressWidgetSource).not.toContain("CircularProgressIndicator progress");
    expect(appJson.expo.plugins).toContain("./plugins/withWidgetProgressRing");
  });
});
