const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const activeWallet = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();

const failures = [];
const warnings = [];

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TEST_TIMEOUT_MS || 30000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    const json = text && (response.headers.get("content-type") ?? "").includes("application/json") ? JSON.parse(text) : null;
    return { ok: true, response, json, text };
  } catch (error) {
    const abort = error?.name === "AbortError";
    return {
      ok: false,
      response: { ok: false, status: 0 },
      json: null,
      text: abort ? `Request aborted after ${timeoutMs}ms` : error instanceof Error ? error.message : String(error),
      errorType: abort ? "AbortError" : "FetchError"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function addFailure(message, details) {
  failures.push({ message, details });
}

function assert(condition, message, details) {
  if (!condition) addFailure(message, details);
}

function scoreValue(payload) {
  return Number(payload?.score ?? payload?.arcIdentityScore ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0);
}

function indexedTx(payload) {
  return Number(payload?.indexedTx ?? payload?.totalTxCount ?? payload?.multiChain?.totalTxCount ?? payload?.profile?.txCount ?? 0);
}

function activeChains(payload) {
  return Number(payload?.activeChains?.length ?? payload?.multiChain?.activeChains?.length ?? payload?.activeChainCount ?? payload?.profile?.activeChainCount ?? 0);
}

function ageDays(payload) {
  return Number(payload?.globalWalletAgeDays ?? payload?.multiChain?.globalWalletAgeDays ?? payload?.profile?.globalWalletAgeDays ?? 0);
}

function component(payload, key) {
  return payload?.components?.[key] ?? null;
}

function isBaselineDowngrade(payload) {
  return scoreValue(payload) === 35 && indexedTx(payload) === 0 && activeChains(payload) === 0;
}

function assertScoreContract(payload, label) {
  assert(Number.isFinite(scoreValue(payload)), `${label} must include a numeric score`, payload);
  assert(scoreValue(payload) >= 0 && scoreValue(payload) <= 100, `${label} score must stay in 0-100`, payload);
  assert(payload?.breakdown, `${label} must keep backward-compatible breakdown`, payload);
  assert(payload?.explanations, `${label} must include explanations`, payload);
  assert(payload?.components, `${label} must include score components`, payload);

  const expected = {
    walletAge: 10,
    crossChain: 5,
    transactionActivity: 5,
    diversity: 15,
    arcActivity: 35,
    attestations: 30
  };
  for (const [key, max] of Object.entries(expected)) {
    const value = component(payload, key);
    assert(value, `${label} missing component ${key}`, payload?.components);
    if (!value) continue;
    assert(value.max === max, `${label} component ${key} should have max ${max}`, value);
    assert(Number.isFinite(value.points) && value.points >= 0 && value.points <= max, `${label} component ${key} points must be within max`, value);
    assert(typeof value.reason === "string" && value.reason.length > 0, `${label} component ${key} needs a reason`, value);
  }
}

const freshWallet = `0x${"f".repeat(39)}1`;
const fresh = await request(`/api/score/${freshWallet}?t=${Date.now()}`);
if (fresh.response.ok && fresh.json) {
  assertScoreContract(fresh.json, "fresh/unclaimed wallet score response");
  assert(!/no wallet activity detected/i.test(fresh.json.explanations?.crossChainActivity ?? "") || fresh.json.dataSource !== "provider_unavailable", "provider failure should not be described as confirmed no activity", fresh.json);
} else {
  warnings.push({
    test: "fresh score API",
    warning: fresh.errorType === "AbortError" ? fresh.text : `Could not reach ${baseUrl}; skipped HTTP fresh-wallet score checks.`,
    errorType: fresh.errorType ?? null
  });
}

if (/^0x[a-f0-9]{40}$/.test(activeWallet)) {
  const refresh = await request(`/api/score/${activeWallet}/refresh`, { method: "POST" });
  if (!refresh.response.ok) {
    const explicitProviderState = refresh.json?.dataSource === "provider_unavailable" || (refresh.json?.providerErrors ?? []).length > 0;
    if (refresh.errorType === "AbortError" || explicitProviderState) {
      warnings.push({ test: "active wallet refresh", warning: refresh.text || "Provider unavailable during refresh", details: refresh.json });
    } else {
      addFailure("active wallet refresh must return successfully or explicit provider state", refresh.json ?? refresh.text);
    }
  } else {
    assertScoreContract(refresh.json, "active wallet refresh");
  }

  const reads = [];
  for (let index = 0; index < 3; index += 1) {
    const score = await request(`/api/score/${activeWallet}?t=${Date.now()}-${index}`);
    if (!score.response.ok) {
      if (score.errorType === "AbortError") warnings.push({ test: `active wallet score read ${index + 1}`, warning: score.text });
      else addFailure(`active wallet score read ${index + 1} must succeed`, score.json ?? score.text);
      continue;
    }
    assertScoreContract(score.json, `active wallet score read ${index + 1}`);
    reads.push(score.json);
  }

  const latest = reads.at(-1);
  if (latest) {
    if (indexedTx(latest) > 0) assert(component(latest, "transactionActivity")?.points > 0, "indexed tx must contribute transaction activity points", latest);
    if (ageDays(latest) > 0) assert(component(latest, "walletAge")?.points > 0, "wallet age must contribute wallet age points", latest);
    if (activeChains(latest) > 0) assert(component(latest, "crossChain")?.points > 0, "active chains must contribute cross-chain points", latest);
    assert(!isBaselineDowngrade(latest), "active wallet must not regress to baseline 35/0/0", latest);
  }

  const deterministicA = await request(`/api/score/${activeWallet}?t=determinism-a`);
  const deterministicB = await request(`/api/score/${activeWallet}?t=determinism-b`);
  if (deterministicA.response.ok && deterministicB.response.ok) {
    assert(scoreValue(deterministicA.json) === scoreValue(deterministicB.json), "same cached inputs should produce same score", { a: deterministicA.json, b: deterministicB.json });
  } else {
    warnings.push({ test: "determinism reads", warning: "Skipped determinism comparison because one read failed or timed out.", a: deterministicA.text, b: deterministicB.text });
  }
} else {
  warnings.push({ test: "active wallet fairness", warning: "ACTIVE_TEST_WALLET not set; skipped active wallet invariant checks." });
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  activeWallet: activeWallet || null,
  warnings,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
