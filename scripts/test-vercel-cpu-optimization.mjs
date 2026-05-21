import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const dashboard = read("app/dashboard/page.tsx");
const scoreRoute = read("app/api/score/[wallet]/route.ts");
const refreshRoute = read("app/api/score/[wallet]/refresh/route.ts");
const developerDemo = read("components/DeveloperApiDemo.tsx");
const chainExplorer = read("components/ChainCoverageExplorer.tsx");

expect(
  scoreRoute.includes("if (!hasCachedScore && refreshRecommended && !refreshInProgress)") &&
    scoreRoute.includes("void triggerWalletRefresh(wallet).promise.catch(() => undefined);"),
  "GET /api/score should only auto-start indexing when no cached wallet intelligence snapshot exists"
);

expect(
  refreshRoute.includes("publicNoStoreHeaders") &&
    refreshRoute.includes("await runWalletRefresh(wallet)") &&
    !refreshRoute.includes("s-maxage"),
  "manual score refresh route should stay uncached and force the refresh path"
);

expect(
  dashboard.includes("const trustData = normalizedProfile.trustGraph") &&
    dashboard.includes("?? await fetchJsonWithTimeout<TrustGraph>(`/api/trust/${wallet}`") &&
    dashboard.includes("normalizedProfile.trustGraph ?? trustData ?? null"),
  "dashboard should not fetch /api/trust when the profile API already returned trust graph data"
);

expect(
  dashboard.includes("const PASSIVE_REFRESH_MIN_INTERVAL_MS = 60_000;") &&
    dashboard.includes("lastPassiveRefreshAtRef") &&
    dashboard.includes("reason: \"manual_refresh_active\""),
  "dashboard passive refresh should remain shared-throttled and skip while manual refresh is active"
);

expect(
  developerDemo.includes("onClick={fetchScore}") &&
    !developerDemo.includes("useEffect") &&
    developerDemo.includes("disabled={loading}"),
  "Developer API demo should fetch only after explicit user click and disable duplicate requests"
);

expect(
  chainExplorer.includes("const [open, setOpen] = useState(false)") &&
    !chainExplorer.includes("fetch("),
  "chain explorer should not perform heavy API fetches before the modal opens"
);

const result = {
  ok: failures.length === 0,
  failures,
  scenario: "conservative Vercel CPU optimization checks"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
