import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(source.includes("type DashboardLoadTrigger = \"initial\" | \"session\" | \"focus\" | \"visibility\""), "dashboard loads should distinguish passive focus/visibility refresh from initial/session loads");
expect(source.includes("const PASSIVE_REFRESH_MIN_INTERVAL_MS = 60_000;"), "passive refresh should have an explicit 60 second minimum interval");
expect(source.includes("lastPassiveRefreshAtRef"), "passive refresh should be throttled per wallet");
expect(source.includes("Date.now() - lastPassiveRefreshAt < PASSIVE_REFRESH_MIN_INTERVAL_MS"), "passive refresh should not run more than once per interval per wallet");
expect(source.includes("dashboard_passive_refresh_skipped"), "passive refresh skips should be logged for diagnostics");
expect(source.includes("reason: \"manual_refresh_active\""), "focus refresh should not run while a manual refresh is active");
expect(source.includes("void load({ trigger });"), "focus/session handlers should pass their trigger into dashboard loading");
expect(source.includes("const passiveRefresh = trigger === \"focus\" || trigger === \"visibility\" || (trigger === \"session\""), "dashboard loading should know when it is passive");
expect(source.includes("if (!passiveRefresh) setRefreshMessage"), "passive refresh should not show the manual refresh banner");
expect(source.includes("setLoadState(\"ready\");") && source.includes("setRefreshMessage(\"\");"), "passive focus refresh should settle quietly when data is already visible");
expect(source.includes("dashboard_load_skipped_during_manual_refresh"), "dashboard loads should not compete with active manual refreshes");
expect(!source.includes("window.addEventListener(\"focus\", reloadFromSessionChange)"), "focus handler should not reuse the session reload path without trigger/throttle");
expect(source.includes("document.addEventListener(\"visibilitychange\", onVisibilityChange);"), "visibility refresh should share the same passive throttle");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenario: "passive focus refresh is throttled, quiet, and cannot compete with manual refresh"
  }, null, 2));
}
