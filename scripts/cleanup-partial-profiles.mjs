import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase cleanup credentials");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const before = await supabase.from("profiles").select("wallet_address,username", { count: "exact" }).is("username", null);
if (before.error) throw before.error;

const deleted = await supabase.from("profiles").delete().is("username", null).select("wallet_address");
if (deleted.error) throw deleted.error;

const after = await supabase.from("profiles").select("wallet_address,username", { count: "exact" }).is("username", null);
if (after.error) throw after.error;

console.log(JSON.stringify({
  partialBefore: before.count,
  deleted: deleted.data?.length ?? 0,
  partialAfter: after.count
}, null, 2));
