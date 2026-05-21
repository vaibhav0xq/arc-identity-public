const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const activeRefresh = String(process.env.ACTIVE_REFRESH ?? "").toLowerCase() === "true";

const testUsers = [
  { username: "vaibhav_meta.arcid", wallet: "0xbb30481982786ea53fe1856e0745eec814d83252" },
  { username: "creepy.arcid", wallet: "0xb8886451fa8a90ab12ec422de0cd9526e2d55806" },
  { username: "bunnyyxtan.arcid", wallet: "0x70b474010e1bf0c4a087a3eadeb157ea515872f6" },
  { username: "rajg.arcid", wallet: "0xef0642c9d173db4be17eb19e8d6c74eb86d1f2bc" },
  { username: "asrith.arcid", wallet: "0x2f7d463bd7192a76e9323e32858602e63c184fd8" }
];

async function request(path, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    const json = text && (response.headers.get("content-type") ?? "").includes("application/json") ? JSON.parse(text) : null;
    return { ok: true, response, json, text, durationMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      response: { ok: false, status: 0 },
      json: null,
      text: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started
    };
  }
}

function scoreValue(payload) {
  return Number(
    typeof payload?.score === "number"
      ? payload.score
      : payload?.scoreValue ?? payload?.arcIdentityScore ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0
  );
}

function directoryMatch(users, wallet) {
  return (users ?? []).find((user) => String(user?.profile?.walletAddress ?? user?.walletAddress ?? user?.wallet ?? "").toLowerCase() === wallet.toLowerCase()) ?? null;
}

function compareSources(result) {
  const sources = [
    ["scoreApi", result.scoreApi],
    ["profileScore", result.profileScore],
    ["directoryScore", result.directoryScore],
    ["publicProfileScore", result.publicProfileScore]
  ].filter(([, value]) => Number(value) > 0);
  const unique = Array.from(new Set(sources.map(([, value]) => Number(value))));
  if (unique.length <= 1) return [];
  const max = Math.max(...unique);
  return sources.filter(([, value]) => Number(value) !== max).map(([name, value]) => ({
    source: name,
    value,
    expected: max
  }));
}

const results = [];
const warnings = [];
const failures = [];

for (const user of testUsers) {
  const wallet = user.wallet.toLowerCase();
  const row = {
    username: user.username,
    wallet,
    scoreApi: 0,
    profileScore: 0,
    directoryScore: 0,
    publicProfileScore: 0,
    ok: false,
    status: "pending",
    mismatches: [],
    timings: {}
  };

  if (activeRefresh) {
    const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
    row.timings.refreshMs = refresh.durationMs;
    if (!refresh.response.ok) warnings.push({ username: user.username, wallet, warning: "refresh_failed", details: refresh.json ?? refresh.text });
  }

  const score = await request(`/api/score/${wallet}?t=${Date.now()}`);
  row.timings.scoreApiMs = score.durationMs;
  if (score.response.ok) row.scoreApi = scoreValue(score.json);
  else warnings.push({ username: user.username, wallet, warning: "score_api_failed", details: score.json ?? score.text });

  const profile = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
  row.timings.profileByWalletMs = profile.durationMs;
  if (profile.response.status === 404) {
    row.status = "skipped_missing_profile";
    warnings.push({ username: user.username, wallet, warning: "profile_missing_skipped" });
    results.push(row);
    continue;
  }
  if (profile.response.ok) {
    row.profileScore = scoreValue(profile.json);
    const serverUsername = profile.json?.profile?.username ?? profile.json?.username ?? "";
    if (serverUsername && serverUsername.toLowerCase() !== user.username.toLowerCase()) {
      warnings.push({ username: user.username, wallet, warning: "username_mismatch", serverUsername });
      row.username = serverUsername;
    }
  } else {
    warnings.push({ username: user.username, wallet, warning: "profile_by_wallet_failed", details: profile.json ?? profile.text });
  }

  const debug = await request(`/api/debug/score-sources/${wallet}?t=${Date.now()}`);
  row.timings.debugMs = debug.durationMs;
  if (debug.response.ok) {
    row.publicProfileScore = Number(debug.json?.publicProfileScore ?? debug.json?.profileRouteScore ?? 0);
    if (!row.scoreApi) row.scoreApi = Number(debug.json?.scoreApiScore ?? 0);
    if (!row.directoryScore) row.directoryScore = Number(debug.json?.directoryApiScore ?? debug.json?.directoryScore ?? 0);
    if (debug.json?.sourceMismatch) warnings.push({ username: row.username, wallet, warning: "debug_source_mismatch", details: debug.json?.mismatches ?? [] });
  } else {
    warnings.push({ username: row.username, wallet, warning: "debug_score_sources_failed", status: debug.response.status });
  }

  const directory = await request(`/api/users?q=${encodeURIComponent(row.username)}&limit=10&t=${Date.now()}`);
  row.timings.directoryMs = directory.durationMs;
  if (directory.response.ok) {
    const match = directoryMatch(directory.json?.users ?? [], wallet);
    if (match) row.directoryScore = scoreValue(match);
    else warnings.push({ username: row.username, wallet, warning: "directory_missing_user" });
  } else {
    warnings.push({ username: row.username, wallet, warning: "directory_failed", details: directory.json ?? directory.text });
  }

  row.mismatches = compareSources(row);
  row.ok = row.mismatches.length === 0 && row.scoreApi > 0 && row.profileScore > 0 && row.directoryScore > 0 && row.publicProfileScore > 0;
  row.status = row.ok ? "ok" : "mismatch";
  if (!row.ok) failures.push({
    username: row.username,
    wallet,
    mismatches: row.mismatches,
    scores: {
      scoreApi: row.scoreApi,
      profileScore: row.profileScore,
      directoryScore: row.directoryScore,
      publicProfileScore: row.publicProfileScore
    }
  });
  results.push(row);
}

const skipped = results.filter((row) => row.status === "skipped_missing_profile").length;
const checked = results.length - skipped;

console.table(results.map((row) => ({
  username: row.username,
  scoreApi: row.scoreApi,
  profile: row.profileScore,
  directory: row.directoryScore,
  publicProfile: row.publicProfileScore,
  status: row.status
})));

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  activeRefresh,
  checked,
  skipped,
  results,
  warnings,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
