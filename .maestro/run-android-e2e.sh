#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.maestro/bin:$PATH"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

adb reverse tcp:8787 tcp:8787
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk

maestro test .maestro/smoke.yaml --debug-output /tmp/maestro-debug
maestro test .maestro/widget-checkoff-seed.yaml --debug-output /tmp/maestro-debug/widget-seed

SEED_OUTPUT="$(node -e '
  (async () => {
    const base = "http://127.0.0.1:8787";
    const loginRes = await fetch(base + "/api/v1/dev/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    if (!loginRes.ok) throw new Error("test-login failed: " + loginRes.status);
    const { token } = await loginRes.json();
    const headers = { Authorization: "Bearer " + token };
    const listsRes = await fetch(base + "/api/v1/lists", { headers });
    if (!listsRes.ok) throw new Error("lists fetch failed: " + listsRes.status);
    const { lists } = await listsRes.json();
    const list = (lists || []).find((l) => l.name === "Widget Checkoff List");
    if (!list) throw new Error("Widget Checkoff List not found");
    const todosRes = await fetch(base + "/api/v1/todos?listId=" + encodeURIComponent(list.id), { headers });
    if (!todosRes.ok) throw new Error("todos fetch failed: " + todosRes.status);
    const { todos } = await todosRes.json();
    for (const name of ["Widget Task One", "Widget Task Two", "Widget Task Three"]) {
      const t = (todos || []).find((x) => x.text === name);
      if (!t || t.completed) throw new Error("Expected open seeded task: " + name);
    }
    const mid = todos.find((x) => x.text === "Widget Task Two");
    console.log(list.id + " " + mid.id);
  })().catch((e) => { console.error(e); process.exit(1); });
')"
read -r LIST_ID MIDDLE_TASK_ID <<< "$SEED_OUTPUT"
echo "Seeded widget list=${LIST_ID} middleTask=${MIDDLE_TASK_ID}"

FOUND_SNAPSHOT=0
for _ in $(seq 1 20); do
  if adb shell run-as io.christran.synx cat shared_prefs/expo.modules.widgets.xml 2>/dev/null | grep -q "$MIDDLE_TASK_ID"; then
    FOUND_SNAPSHOT=1
    break
  fi
  sleep 1
done
if [ "$FOUND_SNAPSHOT" -ne 1 ]; then
  echo "Pinned widget snapshot did not contain ${MIDDLE_TASK_ID}"
  adb shell run-as io.christran.synx cat shared_prefs/expo.modules.widgets.xml || true
  exit 1
fi

adb shell am broadcast \
  -a expo.modules.widgets.ACTION_WIDGET_INTERACTION \
  -n io.christran.synx/.PinnedListWidgetProvider \
  --es expo.modules.widgets.extra.SOURCE PinnedListWidget \
  --es expo.modules.widgets.extra.TARGET "complete:${MIDDLE_TASK_ID}"

FOUND_PENDING=0
for _ in $(seq 1 10); do
  if adb shell run-as io.christran.synx cat shared_prefs/expo.modules.widgets.xml 2>/dev/null | grep -q "pendingCompletedAt"; then
    FOUND_PENDING=1
    break
  fi
  sleep 1
done
if [ "$FOUND_PENDING" -ne 1 ]; then
  echo "Widget snapshot did not record pendingCompletedAt after broadcast"
  adb shell run-as io.christran.synx cat shared_prefs/expo.modules.widgets.xml || true
  adb logcat -d -t 80 || true
  exit 1
fi

maestro test .maestro/widget-checkoff-verify.yaml --debug-output /tmp/maestro-debug/widget-verify

LIST_ID="$LIST_ID" node -e '
  (async () => {
    const base = "http://127.0.0.1:8787";
    const loginRes = await fetch(base + "/api/v1/dev/test-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const { token } = await loginRes.json();
    const headers = { Authorization: "Bearer " + token };
    const todosRes = await fetch(base + "/api/v1/todos?listId=" + encodeURIComponent(process.env.LIST_ID), { headers });
    const { todos } = await todosRes.json();
    const byText = Object.fromEntries((todos || []).map((t) => [t.text, t]));
    if (byText["Widget Task One"]?.completed !== false) {
      throw new Error("Widget Task One should remain incomplete: " + JSON.stringify(byText["Widget Task One"]));
    }
    if (byText["Widget Task Two"]?.completed !== true) {
      throw new Error("Widget Task Two should be completed: " + JSON.stringify(byText["Widget Task Two"]));
    }
    if (byText["Widget Task Three"]?.completed !== false) {
      throw new Error("Widget Task Three should remain incomplete: " + JSON.stringify(byText["Widget Task Three"]));
    }
    console.log("Verified only middle widget task completed");
  })().catch((e) => { console.error(e); process.exit(1); });
'
