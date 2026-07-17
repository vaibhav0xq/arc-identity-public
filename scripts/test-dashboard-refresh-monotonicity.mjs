import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(source.includes("type DisplayedDashboardSnapshot"), "dashboard should track the currently displayed wallet intelligence snapshot");
expect(source.includes("function dashboardSnapshotFreshness"), "dashboard should derive a comparable freshness timestamp for every snapshot");
expect(source.includes("score?.lastIndexedAt"), "freshness should include lastIndexedAt");
expect(source.includes("score?.scoreUpdatedAt"), "freshness should include canonical scoreUpdatedAt");
expect(source.includes("identity?.snapshot?.createdAt"), "freshness should include saved snapshot createdAt");
expect(source.includes("chain.indexedAt"), "freshness should include chain indexed timestamps");
expect(source.includes("function shouldApplyDashboardSnapshot"), "dashboard should gate all incoming snapshots before applying them");
expect(source.includes("incomingFreshness < current.freshnessMs"), "older snapshots should be rejected");
expect(source.includes("dashboard_snapshot_stale_ignored"), "stale snapshot rejection should be logged for diagnostics");
expect(source.includes("local_cache_hydration"), "local cache hydration should be freshness guarded");
expect(source.includes("MAX_PROMINENT_LOCAL_CACHE_AGE_MS"), "dashboard should define a safe age limit for prominent local-cache score hydration");
expect(source.includes("dashboard_local_cache_too_old_for_prominent_score"), "dashboard should skip very old local cache instead of flashing stale scores");
expect(source.includes("Date.now() - cacheFreshness > MAX_PROMINENT_LOCAL_CACHE_AGE_MS"), "dashboard should compare local cache freshness before rendering it prominently");
expect(source.includes("manual_refresh_response"), "manual refresh responses should be freshness guarded");
expect(source.includes("rememberDisplayedSnapshot(wallet, appliedIdentity, appliedScore)"), "manual refresh should remember the accepted snapshot atomically");
expect(source.includes("rememberDisplayedSnapshot(wallet, enriched, effectiveScore)"), "dashboard loads should remember the accepted snapshot atomically");
expect(source.includes("setScoreMeta(appliedScore);") && source.includes("setIdentity(appliedIdentity);"), "score metadata and identity should be applied from the same accepted refresh payload");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenario: "newer dashboard intelligence snapshots cannot be overwritten by older cache/API responses"
  }, null, 2));
}
