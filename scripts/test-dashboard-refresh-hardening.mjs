import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(source.includes("const mountedRef = useRef(false);"), "dashboard should track mount state for async refresh cleanup");
expect(source.includes("const refreshAbortRef = useRef<AbortController | null>(null);"), "refresh should use AbortController");
expect(source.includes("const refreshActiveWalletRef = useRef<string | null>(null);"), "refresh should bind to the active wallet");
expect(source.includes("function isCurrentRefresh(requestId: number, wallet: string)"), "refresh should have one current-request guard");
expect(source.includes("sessionWallet.toLowerCase() === wallet.toLowerCase()"), "current-request guard should verify the live session wallet");
expect(source.includes("function abortRefreshIfWalletChanged(nextWallet: string | null, reason: string)"), "wallet changes should abort active refreshes");
expect(source.includes("refreshRequestIdRef.current += 1;"), "aborting should invalidate stale refresh responses");
expect(source.includes("refreshAbortRef.current?.abort();"), "abort path should cancel the network request");
expect(source.includes("window.setTimeout(() => controller.abort(), 45000)"), "refresh should have a hard timeout");
expect(source.includes("!response.ok || !refreshed || refreshed.ok === false || refreshed.refreshStatus === \"failed\""), "failed API payloads should be treated as failed refreshes");
expect(source.includes("refreshed.walletAddress && refreshed.walletAddress.toLowerCase() !== wallet.toLowerCase()"), "refresh should reject cross-wallet responses");
expect(source.includes("setRefreshMessage(message);"), "refresh should surface a calm failure message");
expect(source.includes("Refresh failed. Cached wallet intelligence is still shown."), "refresh failure UI should not expose raw backend wording");
expect(!source.includes("setRefreshMessage(refreshError"), "raw refresh errors should not be rendered directly");
expect(!source.includes("setRefreshMessage(refreshed.error"), "raw API refresh errors should not be rendered directly");
expect(source.includes("refreshAbortRef.current?.abort();") && source.includes("mountedRef.current = false;"), "unmount should abort refresh and avoid setState after unmount");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenario: "dashboard refresh hardening covers duplicate, timeout, stale, wallet-switch, disconnect, and unmount safety"
  }, null, 2));
}
