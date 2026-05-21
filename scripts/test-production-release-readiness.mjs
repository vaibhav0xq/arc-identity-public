const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const activeWallet = process.env.ACTIVE_TEST_WALLET || "";
const activeUsername = process.env.ACTIVE_TEST_USERNAME || "";
const warnings = [];

async function resolveActiveProfile(wallet, fallbackUsername) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return { walletForTests: "", username: fallbackUsername, claimed: false };
  try {
    const response = await fetch(`${baseUrl}/api/profile/by-wallet/${wallet.toLowerCase()}?t=${Date.now()}`, {
      headers: { "Content-Type": "application/json" }
    });
    if (response.status === 404) {
      warnings.push({
        name: "active-wallet",
        warning: "ACTIVE_TEST_WALLET is not claimed according to profile-by-wallet; skipping active-wallet-only suites.",
        wallet
      });
      return { walletForTests: "", username: "", claimed: false };
    }
    if (!response.ok) return { walletForTests: wallet, username: fallbackUsername, claimed: false };
    const data = await response.json();
    const serverUsername = data?.profile?.username ?? data?.username ?? "";
    if (serverUsername && fallbackUsername && serverUsername.toLowerCase() !== fallbackUsername.toLowerCase()) {
      warnings.push({
        name: "active-username",
        warning: "ACTIVE_TEST_USERNAME mismatch; using server username",
        provided: fallbackUsername,
        serverUsername
      });
    }
    return { walletForTests: wallet, username: serverUsername || fallbackUsername, claimed: Boolean(serverUsername || fallbackUsername) };
  } catch (error) {
    warnings.push({
      name: "active-username",
      warning: "Could not resolve server username; using ACTIVE_TEST_USERNAME as provided.",
      error: error instanceof Error ? error.message : String(error)
    });
    return { walletForTests: wallet, username: fallbackUsername, claimed: Boolean(fallbackUsername) };
  }
}

const activeProfile = await resolveActiveProfile(activeWallet, activeUsername);
const activeWalletForTests = activeProfile.walletForTests;
const resolvedActiveUsername = activeProfile.username;

const tests = [
  ["onboarding", "test-onboarding-flow.mjs", {}],
  ["profile-by-wallet", "test-profile-by-wallet.mjs", {}],
  ["score-fairness", "test-score-fairness.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests }],
  ["score-regression", "test-score-regression.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests }],
  ["score-source-consistency", "test-score-source-consistency.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests, ACTIVE_TEST_USERNAME: resolvedActiveUsername }],
  ["refresh-canonical-sync", "test-refresh-canonical-sync.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests, ACTIVE_TEST_USERNAME: resolvedActiveUsername }],
  ["launch-readiness", "test-launch-readiness.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests }],
  ["attestations-identity-gate", "test-attestations-identity-gate.mjs", {}],
  ["directory-readiness", "test-directory-readiness.mjs", {}],
  ["wallet-switch-state", "test-wallet-switch-state.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests }],
  ["identity-ui-state-race", "test-identity-ui-state-race.mjs", {}],
  ["api-performance", "test-api-performance.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests }],
  ["production-stability", "test-production-stability-report.mjs", { ACTIVE_TEST_WALLET: activeWalletForTests, ACTIVE_TEST_USERNAME: resolvedActiveUsername }]
];

const { spawn } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");

function runScript(name, script, extraEnv) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
      env: { ...process.env, BASE_URL: baseUrl, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      resolve({
        name,
        script,
        ok: code === 0,
        code,
        durationMs: Date.now() - started,
        stdout: stdout.trim().slice(-4000),
        stderr: stderr.trim().slice(-4000)
      });
    });
  });
}

const results = [];
for (const [name, script, env] of tests) {
  if ((name === "score-regression" || name === "score-source-consistency" || name === "refresh-canonical-sync" || name === "launch-readiness" || name === "api-performance" || name === "production-stability" || name === "wallet-switch-state") && !activeWalletForTests) {
    results.push({ name, script, ok: true, skipped: true, warning: "ACTIVE_TEST_WALLET not set" });
    continue;
  }
  results.push(await runScript(name, script, env));
}

const failures = results.filter((result) => !result.ok);
warnings.push(...results.filter((result) => result.skipped || result.warning).map((result) => ({ name: result.name, warning: result.warning ?? "skipped" })));

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  testedWallets: { activeWallet: activeWalletForTests || null, providedActiveWallet: activeWallet || null, activeUsername: resolvedActiveUsername || null, providedActiveUsername: activeUsername || null },
  failures,
  warnings,
  timings: results.map((result) => ({ name: result.name, durationMs: result.durationMs ?? 0, skipped: Boolean(result.skipped) })),
  releaseBlockers: failures.map((failure) => failure.name)
}, null, 2));

if (failures.length) process.exit(1);
