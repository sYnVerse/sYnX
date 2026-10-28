import { Alert } from "react-native";
import { apiClient } from "../api/client";

/**
 * "Use 'Name' as your display name?" — the provider name sYnX got from sYnID,
 * offered until the user accepts or says "No thanks". Both answers are saved on
 * the server, so the offer disappears on the web and in the app. The one-time
 * prompt after sign-in is shown at most once per app session; Settings shows the
 * same offer inline until it's answered.
 */

export type SuggestionOutcome =
  | { kind: "accepted"; displayName: string }
  | { kind: "dismissed" };

const listeners = new Set<(outcome: SuggestionOutcome) => void>();
let promptedThisSession = false;
let promptOpen = false;

/** Copy shared by the prompt and the Settings card (same wording as the web). */
export function suggestionMessage(name: string): string {
  return `Use "${name}" as your display name? It will be visible to people you share lists with.`;
}

/** Subscribe to accept / dismiss answers (Settings card). Returns an unsubscribe. */
export function subscribeDisplayNameSuggestion(
  fn: (outcome: SuggestionOutcome) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(outcome: SuggestionOutcome): void {
  listeners.forEach((fn) => fn(outcome));
}

/**
 * Save the server-stored suggestion as the display name (only if none is set).
 * Returns the saved name, or null when nothing changed.
 */
export async function acceptDisplayNameSuggestion(): Promise<string | null> {
  const res = await apiClient.post("/api/v1/settings/display-name-suggestion", {
    action: "accept",
  });
  const saved = res.data?.success === true && res.data?.displayNameSet === true;
  const name = saved ? String(res.data.displayName || "") : null;
  if (name) notify({ kind: "accepted", displayName: name });
  else notify({ kind: "dismissed" });
  return name;
}

/** Stop offering the provider name. */
export async function dismissDisplayNameSuggestion(): Promise<void> {
  await apiClient.post("/api/v1/settings/display-name-suggestion", { action: "dismiss" });
  notify({ kind: "dismissed" });
}

/**
 * Run after sign-in / app start with `suggestedDisplayName` from
 * GET /api/v1/settings (null once a name is set, accepted or dismissed).
 * Leaving the dialog without choosing asks again on the next app start.
 */
export function maybePromptDisplayNameSuggestion(suggestion: unknown): void {
  if (typeof suggestion !== "string" || !suggestion.trim()) return;
  if (promptedThisSession || promptOpen) return;
  promptedThisSession = true;
  promptOpen = true;
  const name = suggestion.trim();
  Alert.alert(
    "Display name",
    suggestionMessage(name),
    [
      {
        text: "No thanks",
        style: "cancel",
        onPress: () => {
          promptOpen = false;
          dismissDisplayNameSuggestion().catch(() => {});
        },
      },
      {
        text: "Use this name",
        onPress: () => {
          promptOpen = false;
          acceptDisplayNameSuggestion().catch(() => {
            Alert.alert("Couldn't save display name", "Check your connection and try again from Settings.");
          });
        },
      },
    ],
    {
      cancelable: true,
      onDismiss: () => {
        promptOpen = false;
      },
    }
  );
}

/** Forget the per-session prompt state (sign-out). */
export function resetDisplayNameSuggestion(): void {
  promptedThisSession = false;
  promptOpen = false;
}
