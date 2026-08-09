const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const publicUsername = process.env.ACTIVE_TEST_USERNAME || "vaibhav_meta.arcid";

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "text/html" }
  });
  const text = await response.text();
  return { response, text };
}

function fail(message, details) {
  console.error(JSON.stringify({ ok: false, failure: message, details }, null, 2));
  process.exit(1);
}

const gatedRoutes = [
  { path: "/directory", forbidden: "Registered Arc identities", expected: "Checking wallet connection" },
  { path: "/developers", forbidden: "Multi-chain wallet credential API", expected: "Checking wallet connection" },
  { path: "/profile/me", forbidden: "Resolving your connected wallet", expected: "Checking wallet connection" },
  { path: "/identity-created", forbidden: "Your Kyro is live", expected: "Checking wallet connection" },
  { path: "/attestations", forbidden: "Verification Workflow", expected: "Checking Kyro" }
];

for (const route of gatedRoutes) {
  const result = await request(route.path);
  if (!result.response.ok) fail("Gated route should render a page", { path: route.path, status: result.response.status, text: result.text.slice(0, 300) });
  if (!result.text.includes(route.expected)) fail("Gated route should render locked/checking state without wallet", { path: route.path, expected: route.expected, text: result.text.slice(0, 800) });
  if (result.text.includes(route.forbidden)) fail("Gated route should not expose full private page body without wallet", { path: route.path, forbidden: route.forbidden });
}

const profile = await request(`/profile/${encodeURIComponent(publicUsername)}`);
if (!profile.response.ok) fail("Public profile should remain shareable", { username: publicUsername, status: profile.response.status, text: profile.text.slice(0, 300) });
if (profile.text.includes("Checking wallet connection")) fail("Public profile route should not be wallet-gated", { username: publicUsername });

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  gatedRoutes: gatedRoutes.map((route) => route.path),
  publicUsername
}, null, 2));
