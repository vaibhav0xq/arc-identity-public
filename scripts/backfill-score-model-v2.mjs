const baseUrl = (process.env.BASE_URL || "").replace(/\/$/, "");
const confirmed = process.env.CONFIRM_SCORE_MODEL_BACKFILL === "true";
const delayMs = Math.max(250, Number(process.env.BACKFILL_DELAY_MS || 1000));

if (!confirmed) {
  console.error("Refusing to run. Set CONFIRM_SCORE_MODEL_BACKFILL=true after applying the V2 migration and deploying the matching app version.");
  process.exit(1);
}
if (!/^https?:\/\//.test(baseUrl)) {
  console.error("Set BASE_URL to the deployed ARC Identity origin.");
  process.exit(1);
}

const directoryResponse = await fetch(`${baseUrl}/api/users?limit=250`, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(15000)
});
if (!directoryResponse.ok) {
  throw new Error(`Directory request failed with ${directoryResponse.status}`);
}
const directory = await directoryResponse.json();
const users = Array.isArray(directory.users) ? directory.users : [];
console.log(`Starting controlled V2 score refresh for ${users.length} claimed profile(s).`);

let succeeded = 0;
let failed = 0;
for (const [index, user] of users.entries()) {
  const wallet = user.walletAddress ?? user.wallet ?? user.profile?.walletAddress;
  const username = user.username ?? user.profile?.username ?? wallet;
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet ?? "")) {
    console.warn(`[${index + 1}/${users.length}] skipped ${username}: invalid wallet`);
    failed += 1;
    continue;
  }

  try {
    const response = await fetch(`${baseUrl}/api/score/${wallet}/refresh`, {
      method: "POST",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(120000)
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) {
      throw new Error(body?.message || body?.error || `HTTP ${response.status}`);
    }
    console.log(`[${index + 1}/${users.length}] ${username}: score ${body.arcIdentityScore}, model ${body.scoreModelVersion ?? "check API"}`);
    succeeded += 1;
  } catch (error) {
    console.error(`[${index + 1}/${users.length}] ${username}: ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }

  if (index < users.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

console.log(`V2 backfill complete. Succeeded: ${succeeded}. Failed: ${failed}.`);
if (failed > 0) process.exitCode = 1;
