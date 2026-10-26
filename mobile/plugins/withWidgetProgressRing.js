/**
 * Expo config plugin: writes the List Progress widget's ring drawables into the
 * Android project at prebuild (res/drawable/synx_widget_ring_<theme>_<percent>.xml),
 * plus a keep rule so resource shrinking can't drop them.
 * See widget-progress-ring.js for the geometry.
 */
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");
const { allRingDrawables, RING_DRAWABLE_PREFIX } = require("./widget-progress-ring");

function withWidgetProgressRing(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const drawableDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "drawable"
      );
      await fs.promises.mkdir(drawableDir, { recursive: true });
      await Promise.all(
        allRingDrawables().map(({ name, xml }) =>
          fs.promises.writeFile(path.join(drawableDir, `${name}.xml`), xml, "utf8")
        )
      );
      // The widget looks the drawables up by name at runtime, so tell the resource
      // shrinker to keep them if shrinking is ever turned on for release builds.
      const rawDir = path.join(drawableDir, "..", "raw");
      await fs.promises.mkdir(rawDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(rawDir, "synx_widget_ring_keep.xml"),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources xmlns:tools="http://schemas.android.com/tools"\n' +
          `    tools:keep="@drawable/${RING_DRAWABLE_PREFIX}_*" />\n`,
        "utf8"
      );
      return cfg;
    },
  ]);
}

module.exports = withWidgetProgressRing;
