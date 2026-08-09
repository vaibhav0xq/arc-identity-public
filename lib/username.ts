export function normalizeUsernameInput(input?: string | null) {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.(?:kyro|arcid)$/i, "");
}

export function toArcUsername(input?: string | null) {
  const base = normalizeUsernameInput(input);
  if (!base) throw new Error("Username required");
  if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(base)) {
    throw new Error("Use 3-30 lowercase letters, numbers, underscores or hyphens");
  }
  return `${base}.kyro`;
}

export function maybeArcUsername(input?: string | null) {
  try {
    return toArcUsername(input);
  } catch {
    return null;
  }
}

export function usernameBase(username?: string | null) {
  return normalizeUsernameInput(username);
}

export function profileRouteFor(username?: string | null) {
  const canonical = toArcUsername(username);
  return `/profile/${canonical}`;
}
