/**
 * Patches expo-widgets@58.0.23 for Android:
 * 1. Deep linking via Glance actionStartActivity when target starts with "open:"
 * 2. Exposes getSnapshot() on Android WidgetObject / WidgetsModule to read persisted widget props & pendingOps
 * 3. Injects exact width & height dimensions into widget environment on Android
 * 4. Augments TypeScript definitions and JS wrapper for getSnapshot()
 */

const fs = require('fs');
const path = require('path');

const expoWidgetsDir = path.resolve(__dirname, '..', 'node_modules', 'expo-widgets');

if (!fs.existsSync(expoWidgetsDir)) {
  console.log('[patch-expo-widgets] expo-widgets not found, skipping patch.');
  process.exit(0);
}

function patchFile(filePath, transforms) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-expo-widgets] File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  for (const { name, check, target, replacement } of transforms) {
    if (check && content.includes(check)) {
      // Already patched
      continue;
    }
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      modified = true;
      console.log(`[patch-expo-widgets] Applied: ${name}`);
    } else {
      console.warn(`[patch-expo-widgets] Target not found for: ${name}`);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

// 1. Patch WidgetInteractionAction.kt for deep linking
const interactionActionPath = path.join(
  expoWidgetsDir,
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'widgets',
  'WidgetInteractionAction.kt'
);

patchFile(interactionActionPath, [
  {
    name: 'Glance actionStartActivity for open: deep links',
    check: 'target.startsWith("open:")',
    target: 'internal fun WidgetInteraction.toGlanceAction(context: Context): Action {\n  val intent = when (source) {',
    replacement: `internal fun WidgetInteraction.toGlanceAction(context: Context): Action {
  if (target.startsWith("open:")) {
    val uriString = target.removePrefix("open:")
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse(uriString)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return androidx.glance.appwidget.action.actionStartActivity(launchIntent)
  }
  val intent = when (source) {`,
  },
  {
    name: 'Glance actionStartActivity for open: deep links (CRLF)',
    check: 'target.startsWith("open:")',
    target: 'internal fun WidgetInteraction.toGlanceAction(context: Context): Action {\r\n  val intent = when (source) {',
    replacement: `internal fun WidgetInteraction.toGlanceAction(context: Context): Action {\r\n  if (target.startsWith("open:")) {\r\n    val uriString = target.removePrefix("open:")\r\n    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse(uriString)).apply {\r\n      setPackage(context.packageName)\r\n      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)\r\n    }\r\n    return androidx.glance.appwidget.action.actionStartActivity(launchIntent)\r\n  }\r\n  val intent = when (source) {`,
  },
]);

// 2. Patch WidgetObject.kt to add getSnapshot()
const widgetObjectPath = path.join(
  expoWidgetsDir,
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'widgets',
  'WidgetObject.kt'
);

patchFile(widgetObjectPath, [
  {
    name: 'WidgetObject.getSnapshot()',
    check: 'fun getSnapshot()',
    target: '  fun updateSnapshot(props: Map<String, Any?>) {\n    WidgetsStorage.set(context, "__expo_widgets_${name}_props", props)\n    reload()\n  }',
    replacement: `  fun updateSnapshot(props: Map<String, Any?>) {
    WidgetsStorage.set(context, "__expo_widgets_\${name}_props", props)
    reload()
  }

  fun getSnapshot(): Map<String, Any?>? {
    return WidgetsLayoutRegistry.props(context, name)
  }`,
  },
  {
    name: 'WidgetObject.getSnapshot() (CRLF)',
    check: 'fun getSnapshot()',
    target: '  fun updateSnapshot(props: Map<String, Any?>) {\r\n    WidgetsStorage.set(context, "__expo_widgets_${name}_props", props)\r\n    reload()\r\n  }',
    replacement: `  fun updateSnapshot(props: Map<String, Any?>) {\r\n    WidgetsStorage.set(context, "__expo_widgets_\${name}_props", props)\r\n    reload()\r\n  }\r\n\r\n  fun getSnapshot(): Map<String, Any?>? {\r\n    return WidgetsLayoutRegistry.props(context, name)\r\n  }`,
  },
]);

// 3. Patch WidgetsModule.kt to expose getSnapshot() to JS
const widgetsModulePath = path.join(
  expoWidgetsDir,
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'widgets',
  'WidgetsModule.kt'
);

patchFile(widgetsModulePath, [
  {
    name: 'WidgetsModule expose getSnapshot',
    check: 'Function("getSnapshot")',
    target: '      Function("updateSnapshot") { widget: WidgetObject, props: Map<String, Any?> ->\n        widget.updateSnapshot(props)\n      }',
    replacement: `      Function("updateSnapshot") { widget: WidgetObject, props: Map<String, Any?> ->
        widget.updateSnapshot(props)
      }

      Function("getSnapshot") { widget: WidgetObject ->
        widget.getSnapshot()
      }`,
  },
  {
    name: 'WidgetsModule expose getSnapshot (CRLF)',
    check: 'Function("getSnapshot")',
    target: '      Function("updateSnapshot") { widget: WidgetObject, props: Map<String, Any?> ->\r\n        widget.updateSnapshot(props)\r\n      }',
    replacement: `      Function("updateSnapshot") { widget: WidgetObject, props: Map<String, Any?> ->\r\n        widget.updateSnapshot(props)\r\n      }\r\n\r\n      Function("getSnapshot") { widget: WidgetObject ->\r\n        widget.getSnapshot()\r\n      }`,
  },
]);

// 4. Patch ExpoWidgetsPeekWidget.kt for width and height in environment
const peekWidgetPath = path.join(
  expoWidgetsDir,
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'widgets',
  'ExpoWidgetsPeekWidget.kt'
);

patchFile(peekWidgetPath, [
  {
    name: 'ExpoWidgetsPeekWidget size injection',
    check: '"width" to size.width',
    target: '    val environment = getWidgetEnvironment(appContext)\n    val node = evaluateLayout(appContext, layout, props, environment)',
    replacement: `    val environment = getWidgetEnvironment(appContext) + mapOf(
      "width" to size.width.value.toDouble(),
      "height" to size.height.value.toDouble()
    )
    val node = evaluateLayout(appContext, layout, props, environment)`,
  },
  {
    name: 'ExpoWidgetsPeekWidget size injection (CRLF)',
    check: '"width" to size.width',
    target: '    val environment = getWidgetEnvironment(appContext)\r\n    val node = evaluateLayout(appContext, layout, props, environment)',
    replacement: `    val environment = getWidgetEnvironment(appContext) + mapOf(\r\n      "width" to size.width.value.toDouble(),\r\n      "height" to size.height.value.toDouble()\r\n    )\r\n    val node = evaluateLayout(appContext, layout, props, environment)`,
  },
]);

// 5. Patch JS Widgets.js and TypeScript Widgets.d.ts
const widgetsJsPath = path.join(expoWidgetsDir, 'build', 'Widgets.js');
patchFile(widgetsJsPath, [
  {
    name: 'Widgets.js getSnapshot()',
    check: 'getSnapshot()',
    target: '    /**\n   * Returns the current timeline entries for the widget',
    replacement: `    /**\n   * Returns the currently persisted snapshot props on Android.\n   */ getSnapshot() {\n        if (Platform.OS === 'android') {\n            return this.nativeWidgetObject.getSnapshot?.() ?? null;\n        }\n        return null;\n    }\n    /**\n   * Returns the current timeline entries for the widget`,
  },
  {
    name: 'Widgets.js getSnapshot() (CRLF)',
    check: 'getSnapshot()',
    target: '    /**\r\n   * Returns the current timeline entries for the widget',
    replacement: `    /**\r\n   * Returns the currently persisted snapshot props on Android.\r\n   */ getSnapshot() {\r\n        if (Platform.OS === 'android') {\r\n            return this.nativeWidgetObject.getSnapshot?.() ?? null;\r\n        }\r\n        return null;\r\n    }\r\n    /**\r\n   * Returns the current timeline entries for the widget`,
  },
]);

const widgetsDtsPath = path.join(expoWidgetsDir, 'build', 'Widgets.d.ts');
patchFile(widgetsDtsPath, [
  {
    name: 'Widgets.d.ts getSnapshot()',
    check: 'getSnapshot():',
    target: '    /**\n     * Returns the current timeline entries for the widget',
    replacement: `    /**\n     * Returns the currently persisted snapshot props on Android.\n     * @platform android\n     */\n    getSnapshot(): PropsType | null;\n    /**\n     * Returns the current timeline entries for the widget`,
  },
  {
    name: 'Widgets.d.ts getSnapshot() (CRLF)',
    check: 'getSnapshot():',
    target: '    /**\r\n     * Returns the current timeline entries for the widget',
    replacement: `    /**\r\n     * Returns the currently persisted snapshot props on Android.\r\n     * @platform android\r\n     */\r\n    getSnapshot(): PropsType | null;\r\n    /**\r\n     * Returns the current timeline entries for the widget`,
  },
]);

console.log('[patch-expo-widgets] Done patching expo-widgets.');
