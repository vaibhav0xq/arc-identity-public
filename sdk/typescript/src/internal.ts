/** Validate and encode a path segment value such as a wallet, username or receipt id. */
export function requirePathSegment(name: string, value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return encodeURIComponent(value.trim());
}
