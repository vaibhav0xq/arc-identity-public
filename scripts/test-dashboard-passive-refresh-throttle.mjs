import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(source.includes("const PASSIVE_REFRESH_MIN_INTERVAL_MS = 60_000;"), "passive refresh interval should be at least 60 seconds");
expect(source.includes("lastPassiveRefreshAtRef"), "focus, visibility, and passive session refreshes should share one throttle store");
expect(source.includes("const passiveTrigger = trigger === \"focus\" || trigger === \"visibility\" || (trigger === \"session\" && hasCurrentWalletData);"), "session reloads with visible wallet data should be treated as passive refreshes");
expect(source.includes("Date.now() - lastPassiveRefreshAt < PASSIVE_REFRESH_MIN_INTERVAL_MS"), "passive refresh should be throttled before loading");
expect(source.includes("markPassiveRefresh(wallet);"), "accepted manual/passive activity should update the passive throttle timestamp");
expect(source.includes("const passiveRefresh = trigger === \"focus\" || trigger === \"visibility\" || (trigger === \"session\" && Boolean(identity || displayedSnapshotRef.current));"), "dashboard load should avoid manual refresh UI for passive triggers");
expect(source.includes("setRefreshMessage(score?.refreshInProgress && !hadCachedDashboard && !identity ? intelligenceStateCopy(\"indexing\")"), "server refreshInProgress should only show an indexing message when no data is visible");
expect(source.includes("loadState === \"refreshing_background_intelligence\" && !identity"), "background refreshing copy should not render over an existing dashboard");
expect(!source.includes("realCached || hadCachedDashboard ? \"Refreshing wallet intelligence. Current data remains visible.\""), "cached/session loads should not reuse the manual refresh banner");
expect(source.includes("dashboard_passive_refresh_skipped") && source.includes("reason: \"manual_refresh_active\""), "passive refresh should skip while manual refresh is active");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenario: "passive dashboard refresh is quiet, shared-throttled, and cannot reuse manual refresh UI"
  }, null, 2));
}
