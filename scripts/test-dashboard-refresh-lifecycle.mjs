import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(source.includes("const refreshRequestIdRef = useRef(0);"), "manual refresh should track request ids");
expect(source.includes("const refreshInFlightRef = useRef(false);"), "manual refresh should block rapid duplicate requests synchronously");
expect(source.includes("refreshInFlightRef.current"), "refresh in-flight ref should be used");
expect(source.includes("dashboard_manual_refresh_stale_response_ignored"), "stale refresh responses should be ignored");
expect(source.includes("refreshed.ok === false || refreshed.refreshStatus === \"failed\""), "failed refresh payloads should not be treated as success");
expect(source.includes("Refresh failed. Cached wallet intelligence is still shown."), "timeout/failure copy should exit loading state and keep cached data");
expect(source.includes("Refreshing wallet intelligence. Current data remains visible."), "active refresh should explain that current data remains visible");
expect(source.includes("const dashboardStatusMessage = refreshing"), "dashboard should derive one visible status message from refresh/cache state");
expect(!source.includes("setRefreshMessage(\"Refreshing wallet intelligence...\")"), "active refresh should not use ambiguous standalone refreshing copy");
expect(!source.includes("{loadState === \"showing_cached_data\" ? <p"), "cached status should not render as a second independent banner during active refresh");
expect(source.includes("setRefreshing(false);"), "refreshing state should always be cleared for the active request");
expect(source.includes("disabled={refreshing}"), "refresh buttons should be disabled while refresh is in progress");
expect(source.includes("setLoadState(identity ? \"refresh_failed_showing_cached_data\" : \"loading_cached_profile\")"), "failed refresh should preserve cached dashboard data when available");
expect(source.includes("const refreshAbortRef = useRef<AbortController | null>(null);"), "manual refresh should keep an abort controller for timeout, unmount, and wallet switch");
expect(source.includes("abortRefreshIfWalletChanged(wallet, wallet ? \"wallet_changed\" : \"wallet_disconnected\");"), "wallet switch/disconnect should abort and invalidate active refreshes");
expect(source.includes("refreshActiveWalletRef.current = wallet.toLowerCase();"), "manual refresh should bind request ownership to the starting wallet");
expect(source.includes("!isCurrentRefresh(requestId, wallet)"), "manual refresh should ignore results that are no longer current for this wallet");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenario: "manual refresh lifecycle exits refreshing state on success, failure, timeout, and stale response"
  }, null, 2));
}
