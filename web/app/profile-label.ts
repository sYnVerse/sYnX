/**
 * Text for the signed-in profile row at the bottom of the side menu.
 *
 * With a display name: the name on top, the email underneath.
 * Without one: the email on top and "Synced Profile" underneath (unchanged).
 */
export type ProfileLabel = {
  primary: string;
  secondary: string;
  initials: string;
};

function initialsFromName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("").toUpperCase();
  const first = Array.from(words[0])[0] ?? "";
  const last = Array.from(words[words.length - 1])[0] ?? "";
  return (first + last).toUpperCase();
}

export function getProfileLabel(input: {
  email: string;
  displayName?: string | null;
  displayNameSet?: boolean;
}): ProfileLabel {
  const email = input.email || "";
  const emailInitials = email.split("@")[0].substring(0, 2).toUpperCase();
  const name = input.displayNameSet ? (input.displayName || "").trim() : "";

  if (name) {
    return {
      primary: name,
      secondary: email,
      initials: initialsFromName(name) || emailInitials,
    };
  }

  return { primary: email, secondary: "Synced Profile", initials: emailInitials };
}
