export const KYRO_USERNAME_SUFFIX = ".kyro";
export const LEGACY_USERNAME_SUFFIX = ".arcid";

// Matches both the current .kyro suffix and the legacy .arcid suffix so old
// usernames, routes and cached values keep resolving after the rebrand.
export const USERNAME_SUFFIX_PATTERN = /\.(arcid|kyro)$/i;

export function normalizeUsernameInput(input?: string | null) {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .replace(USERNAME_SUFFIX_PATTERN, "");
}

export function toArcUsername(input?: string | null) {
  const base = normalizeUsernameInput(input);
  if (!base) throw new Error("Username required");
  if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(base)) {
    throw new Error("Use 3-30 lowercase letters, numbers, underscores or hyphens");
  }
  return `${base}${KYRO_USERNAME_SUFFIX}`;
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

// Both suffixes resolve to the same identity. Database rows claimed before the
// rebrand store name.arcid; new claims store name.kyro. Lookups must try both.
export function usernameLookupCandidates(input?: string | null) {
  const base = normalizeUsernameInput(input);
  if (!base) return [];
  return [`${base}${KYRO_USERNAME_SUFFIX}`, `${base}${LEGACY_USERNAME_SUFFIX}`];
}

export function profileRouteFor(username?: string | null) {
  const canonical = toArcUsername(username);
  return `/profile/${canonical}`;
}

/* Boundary validation for any API input that claims to be a username
   (audit finding F-05). This is intentionally LOOSER than the claim-time
   canonical rule (toArcUsername: 3-30 characters): the boundary check
   enforces charset and outer length bounds (2-64) so raw inputs carrying
   PostgREST metacharacters, emoji or kilobyte strings are rejected before
   they reach lookups or filter strings. Claim-time strictness is unchanged. */
export const USERNAME_INPUT_MIN_LENGTH = 2;
export const USERNAME_INPUT_MAX_LENGTH = 64;
export const USERNAME_INPUT_RULE =
  "Usernames use 2 to 64 lowercase letters, numbers, underscores or hyphens, with an optional .kyro suffix.";

export function isValidUsernameInput(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < USERNAME_INPUT_MIN_LENGTH || trimmed.length > USERNAME_INPUT_MAX_LENGTH) return false;
  const base = trimmed.replace(USERNAME_SUFFIX_PATTERN, "");
  if (base.length < USERNAME_INPUT_MIN_LENGTH) return false;
  return /^[a-z0-9][a-z0-9_-]*$/.test(base);
}
