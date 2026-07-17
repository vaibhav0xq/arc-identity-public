import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const confirm = process.argv.includes("--confirm");
const envPath = path.join(process.cwd(), ".env.local");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const env = Object.fromEntries(envText
  .split(/\r?\n/)
  .filter((line) => line && !line.trim().startsWith("#"))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
  }));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const protectedUsernames = new Set([
  "vaibhav_meta.arcid",
  "creepy.arcid",
  "bunnyyxtan.arcid",
  "rajg.arcid",
  "asrith.arcid"
]);

const cleanupPrefixes = [
  "test_",
  "wallet_",
  "directory_",
  "cleanuser_",
  "fresh_",
  "debug_",
  "demo_",
  "launch_",
  "attest_",
  "attlive_",
  "autotest_"
];

const localDbPath = path.join(process.cwd(), "data", "db.json");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase cleanup credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function normalizeWallet(wallet) {
  return String(wallet ?? "").trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username ?? "").trim().toLowerCase();
}

function usernameBase(username) {
  return normalizeUsername(username).replace(/\.arcid$/i, "");
}

function isProtectedUsername(username) {
  return protectedUsernames.has(normalizeUsername(username));
}

function isCleanupUsername(username) {
  if (!username || isProtectedUsername(username)) return false;
  const base = usernameBase(username);
  return cleanupPrefixes.some((prefix) => base.startsWith(prefix));
}

function inList(values) {
  return `(${values.map((value) => String(value).replace(/[(),]/g, "")).join(",")})`;
}

function chunks(values, size = 40) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

function isMissingOptionalTableError(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return message.includes("could not find the table")
    || message.includes("schema cache")
    || message.includes("relation does not exist")
    || message.includes("does not exist")
    || message.includes("pgrst205");
}

function optionalTableMissing(table, error, operation) {
  const message = String(error?.message ?? error ?? "Unknown error");
  console.warn("[arc-identity] cleanup_optional_table_missing", { table, operation, message });
  return { table, count: 0, deleted: 0, skipped: true, optionalMissing: true, warning: message };
}

async function countSimple(table, column, values, select = "id") {
  if (!values.length) return { table, count: 0, error: null };
  let total = 0;
  for (const group of chunks(values)) {
    const { count, error } = await supabase
      .from(table)
      .select(select, { count: "exact", head: true })
      .in(column, group);
    if (error) return { table, count: total, error: error.message };
    total += count ?? 0;
  }
  return { table, count: total, error: null };
}

async function countOptionalSimple(table, column, values, select = "id") {
  const result = await countSimple(table, column, values, select);
  if (result.error && isMissingOptionalTableError(result.error)) return optionalTableMissing(table, result.error, "count");
  return result;
}

async function countWalletPair(table, firstColumn, secondColumn, wallets, select = "id") {
  if (!wallets.length) return { table, count: 0, error: null };
  let total = 0;
  for (const group of chunks(wallets)) {
    const { count, error } = await supabase
      .from(table)
      .select(select, { count: "exact", head: true })
      .or(`${firstColumn}.in.${inList(group)},${secondColumn}.in.${inList(group)}`);
    if (error) return { table, count: total, error: error.message };
    total += count ?? 0;
  }
  return { table, count: total, error: null };
}

async function countOptionalWalletPair(table, firstColumn, secondColumn, wallets, select = "id") {
  const result = await countWalletPair(table, firstColumn, secondColumn, wallets, select);
  if (result.error && isMissingOptionalTableError(result.error)) return optionalTableMissing(table, result.error, "count");
  return result;
}

async function deleteSimple(table, column, values, select = "id") {
  if (!values.length) return { table, deleted: 0 };
  let deleted = 0;
  for (const group of chunks(values)) {
    const { data, error } = await supabase.from(table).delete().in(column, group).select(select);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
    deleted += data?.length ?? 0;
  }
  return { table, deleted };
}

async function deleteOptionalSimple(table, column, values, select = "id") {
  try {
    return await deleteSimple(table, column, values, select);
  } catch (error) {
    if (isMissingOptionalTableError(error)) return optionalTableMissing(table, error, "delete");
    throw error;
  }
}

async function deleteWalletPair(table, firstColumn, secondColumn, wallets, select = "id") {
  if (!wallets.length) return { table, deleted: 0 };
  let deleted = 0;
  for (const group of chunks(wallets)) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .or(`${firstColumn}.in.${inList(group)},${secondColumn}.in.${inList(group)}`)
      .select(select);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
    deleted += data?.length ?? 0;
  }
  return { table, deleted };
}

async function deleteOptionalWalletPair(table, firstColumn, secondColumn, wallets, select = "id") {
  try {
    return await deleteWalletPair(table, firstColumn, secondColumn, wallets, select);
  } catch (error) {
    if (isMissingOptionalTableError(error)) return optionalTableMissing(table, error, "delete");
    throw error;
  }
}

function inspectLocalDb(wallets) {
  if (!fs.existsSync(localDbPath)) return { exists: false, matchedUsers: [], relatedRows: {} };
  const db = JSON.parse(fs.readFileSync(localDbPath, "utf8"));
  const users = Array.isArray(db.users) ? db.users : [];
  const matchedUsers = users.filter((user) => {
    const username = normalizeUsername(user.username);
    return isCleanupUsername(username) || wallets.includes(normalizeWallet(user.walletAddress));
  });
  const userIds = new Set(matchedUsers.map((user) => user.id).filter(Boolean));
  const walletSet = new Set(wallets);
  const relatedRows = {};
  for (const [key, value] of Object.entries(db)) {
    if (!Array.isArray(value) || key === "users") continue;
    relatedRows[key] = value.filter((row) => {
      return userIds.has(row.userId)
        || userIds.has(row.fromUserId)
        || userIds.has(row.toUserId)
        || walletSet.has(normalizeWallet(row.walletAddress))
        || walletSet.has(normalizeWallet(row.wallet))
        || walletSet.has(normalizeWallet(row.fromWallet))
        || walletSet.has(normalizeWallet(row.toWallet));
    }).length;
  }
  return {
    exists: true,
    matchedUsers: matchedUsers.map((user) => ({
      id: user.id,
      username: user.username,
      walletAddress: user.walletAddress
    })),
    relatedRows
  };
}

function cleanupLocalDb(wallets) {
  if (!fs.existsSync(localDbPath)) return { exists: false, deletedUsers: 0, deletedRows: {} };
  const db = JSON.parse(fs.readFileSync(localDbPath, "utf8"));
  const users = Array.isArray(db.users) ? db.users : [];
  const removableUsers = users.filter((user) => isCleanupUsername(user.username) || wallets.includes(normalizeWallet(user.walletAddress)));
  const removableIds = new Set(removableUsers.map((user) => user.id).filter(Boolean));
  const walletSet = new Set(wallets);
  const next = { ...db };
  next.users = users.filter((user) => !removableIds.has(user.id));
  const deletedRows = {};
  for (const [key, value] of Object.entries(db)) {
    if (!Array.isArray(value) || key === "users") continue;
    const filtered = value.filter((row) => {
      return !(
        removableIds.has(row.userId)
        || removableIds.has(row.fromUserId)
        || removableIds.has(row.toUserId)
        || walletSet.has(normalizeWallet(row.walletAddress))
        || walletSet.has(normalizeWallet(row.wallet))
        || walletSet.has(normalizeWallet(row.fromWallet))
        || walletSet.has(normalizeWallet(row.toWallet))
      );
    });
    deletedRows[key] = value.length - filtered.length;
    next[key] = filtered;
  }
  fs.writeFileSync(localDbPath, `${JSON.stringify(next, null, 2)}\n`);
  return { exists: true, deletedUsers: removableUsers.length, deletedRows };
}

const { data: profileRows, error: profileError } = await supabase
  .from("profiles")
  .select("id,wallet_address,username")
  .not("username", "is", null);

if (profileError) throw profileError;

const protectedMatches = [];
const matchedProfiles = (profileRows ?? []).filter((row) => {
  if (isProtectedUsername(row.username)) {
    protectedMatches.push({
      id: row.id,
      username: row.username,
      walletAddress: normalizeWallet(row.wallet_address)
    });
    console.log("[arc-identity] cleanup_skipped_protected_user", { username: row.username, wallet: normalizeWallet(row.wallet_address) });
    return false;
  }
  return isCleanupUsername(row.username);
}).map((row) => ({
  id: row.id,
  username: row.username,
  walletAddress: normalizeWallet(row.wallet_address)
}));

const wallets = Array.from(new Set(matchedProfiles.map((row) => row.walletAddress).filter(Boolean)));

const related = {
  attestations: await countOptionalWalletPair("attestations", "from_wallet", "to_wallet", wallets),
  trust_connections: await countOptionalWalletPair("trust_connections", "wallet_a", "wallet_b", wallets),
  reputation_events: await countOptionalSimple("reputation_events", "wallet_address", wallets),
  wallet_refresh_jobs: await countOptionalSimple("wallet_refresh_jobs", "wallet_address", wallets),
  wallet_chain_snapshots: await countOptionalSimple("wallet_chain_snapshots", "wallet_address", wallets),
  wallet_global_profiles: await countOptionalSimple("wallet_global_profiles", "wallet_address", wallets, "wallet_address"),
  wallet_activity_snapshots: await countOptionalSimple("wallet_activity_snapshots", "wallet_address", wallets),
  profiles: { table: "profiles", count: matchedProfiles.length, error: null }
};

const relationErrors = Object.values(related).filter((item) => item.error && !item.optionalMissing);
const skippedOptionalTables = Object.values(related).filter((item) => item.optionalMissing).map((item) => ({ table: item.table, warning: item.warning }));
const localDb = inspectLocalDb(wallets);

if (!confirm) {
  console.log("[arc-identity] cleanup_dry_run", { matchedProfiles: matchedProfiles.length, related });
  console.log(JSON.stringify({
    ok: relationErrors.length === 0,
    mode: "dry-run",
    confirmRequired: true,
    cleanupPrefixes,
    protectedUsernames: Array.from(protectedUsernames),
    protectedMatches,
    matchedProfiles,
    wallets,
    related,
    skippedOptionalTables,
    localDb,
    errors: relationErrors,
    nextStep: "Review this output. Run `node scripts/cleanup-test-identities.mjs --confirm` only when you want to delete these rows."
  }, null, 2));
  process.exit(relationErrors.length ? 1 : 0);
}

if (relationErrors.length) {
  console.error(JSON.stringify({
    ok: false,
    mode: "confirm",
    error: "Cleanup stopped because one or more related tables could not be verified.",
    errors: relationErrors
  }, null, 2));
  process.exit(1);
}

console.log("[arc-identity] cleanup_delete_started", { profiles: matchedProfiles.length, wallets: wallets.length });
const deleted = [];
deleted.push(await deleteOptionalWalletPair("attestations", "from_wallet", "to_wallet", wallets));
deleted.push(await deleteOptionalWalletPair("trust_connections", "wallet_a", "wallet_b", wallets));
deleted.push(await deleteOptionalSimple("reputation_events", "wallet_address", wallets));
deleted.push(await deleteOptionalSimple("wallet_refresh_jobs", "wallet_address", wallets));
deleted.push(await deleteOptionalSimple("wallet_chain_snapshots", "wallet_address", wallets));
deleted.push(await deleteOptionalSimple("wallet_global_profiles", "wallet_address", wallets, "wallet_address"));
deleted.push(await deleteOptionalSimple("wallet_activity_snapshots", "wallet_address", wallets));
deleted.push(await deleteSimple("profiles", "wallet_address", wallets));
const localDeleted = cleanupLocalDb(wallets);
const skippedDeletes = deleted.filter((item) => item.optionalMissing).map((item) => ({ table: item.table, warning: item.warning }));
console.log("[arc-identity] cleanup_delete_success", { deleted, localDeleted, skippedOptionalTables: skippedDeletes });
console.log(JSON.stringify({
  ok: true,
  mode: "confirm",
  deletedProfileCount: deleted.find((item) => item.table === "profiles")?.deleted ?? 0,
  deletedRelatedRowCounts: Object.fromEntries(deleted.filter((item) => item.table !== "profiles").map((item) => [item.table, item.deleted ?? 0])),
  skippedOptionalTables: skippedDeletes,
  failedRequiredTables: [],
  deleted,
  localDeleted,
  protectedUsernames: Array.from(protectedUsernames)
}, null, 2));
