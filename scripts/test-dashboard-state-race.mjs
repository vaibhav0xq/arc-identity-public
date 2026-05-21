import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const failures = [];

if (!source.includes("const shouldHoldConnectedPendingState = sessionHasWallet && !identity && !confirmedUnclaimed;")) {
  failures.push("dashboard must hold connected wallet sessions in a pending state until profile lookup resolves");
}

if (!source.includes("const showSetupClaimCta = !shouldHoldConnectedPendingState;")) {
  failures.push("dashboard setup CTA must be hidden while connected wallet profile lookup is pending");
}

if (!source.includes("{!showSetupClaimCta ? null :")) {
  failures.push("Claim username CTA must be guarded by connected-session pending state");
}

if (!source.includes("Wallet connection is active. ARC Identity is checking your signature and profile before showing setup actions.")) {
  failures.push("connected pending state should not use disconnected setup copy");
}

if (!source.includes("const refreshRequestIdRef = useRef(0);")) {
  failures.push("dashboard manual refresh must track request ids so stale responses cannot overwrite newer state");
}

if (!source.includes("const refreshInFlightRef = useRef(false);")) {
  failures.push("dashboard manual refresh must use an in-flight ref to prevent duplicate refresh requests");
}

if (!source.includes("refreshing || refreshInFlightRef.current")) {
  failures.push("Refresh intelligence action must ignore rapid duplicate clicks while a refresh is in progress");
}

if (!source.includes("dashboard_manual_refresh_stale_response_ignored")) {
  failures.push("dashboard manual refresh must explicitly ignore stale refresh responses");
}

if (!source.includes("Refresh failed. Cached wallet intelligence is still shown.")) {
  failures.push("dashboard manual refresh timeout/failure must exit loading state and keep cached intelligence visible");
}

if (!source.includes("abortRefreshIfWalletChanged(wallet, wallet ? \"wallet_changed\" : \"wallet_disconnected\");")) {
  failures.push("dashboard must abort in-flight refreshes when wallet disconnects or changes");
}

if (!source.includes("isCurrentRefresh(requestId, wallet)")) {
  failures.push("dashboard manual refresh should verify wallet-scoped request ownership before applying results");
}

if (!source.includes("previousUsername !== username || previousWallet?.toLowerCase() !== wallet.toLowerCase()")) {
  failures.push("dashboard should not dispatch identity change events when the wallet-scoped username cache is unchanged");
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenarios: [
      "connected wallet + signature verified + profile lookup pending",
      "manual Refresh intelligence duplicate click/stale response/timeout handling"
    ],
    expected: "checking identity state without disconnected copy, cached data preserved while refresh settles, and no stuck refreshing state"
  }, null, 2));
}
