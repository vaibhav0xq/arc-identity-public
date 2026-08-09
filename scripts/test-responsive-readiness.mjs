import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const warnings = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

const shell = read("components/ArcShell.tsx");
const developers = read("components/DevelopersPageClient.tsx");
const demo = read("components/DeveloperApiDemo.tsx");
const directory = read("components/DirectoryBrowser.tsx");
const chainExplorer = read("components/ChainCoverageExplorer.tsx");
const dashboard = read("app/dashboard/page.tsx");
const docs = read("app/docs/page.tsx");
const docsNav = read("components/DocsOnThisPage.tsx");
const css = read("app/globals.css");

const brandAssets = [
  "public/brand/arc-identity-icon.png",
  "public/brand/arc-identity-icon-32.png",
  "public/brand/arc-identity-icon-192.png",
  "public/brand/arc-identity-icon-512.png",
  "public/brand/arc-identity-wordmark.png"
];

for (const asset of brandAssets) {
  expect(fs.existsSync(asset), `brand asset should exist: ${asset}`);
}

expect(css.includes("overflow-x: clip"), "global CSS should prevent horizontal bleed without creating sticky-breaking overflow ancestors");
expect(!shell.includes("overflow-x-hidden"), "ArcShell should not create an overflow ancestor that breaks sticky docs sidebar positioning");
expect(shell.includes("max-w-[calc(100vw-1rem)]"), "shell ambient glow should not create mobile viewport overflow");
expect(shell.includes("lg:grid-cols-5"), "header nav should use a five-column controlled layout at 1024px");
expect(shell.includes("xl:grid-cols-[210px_minmax(0,1fr)_minmax(280px,auto)]"), "header should reserve one-row desktop layout for wider screens");
expect(shell.includes("next/image") && shell.includes("/brand/arc-identity-icon.png"), "header should use the Kyro brand icon asset");
expect(!shell.includes(">ARC</span>"), "header should not render the old ARC text placeholder logo");

expect(developers.includes("overflow-x-auto whitespace-nowrap"), "Developer API endpoint chips should own horizontal overflow");
expect(developers.includes("max-w-full overflow-auto"), "Developer API sample response should scroll inside its card");
expect(demo.includes("max-w-full overflow-auto"), "live API demo response should scroll inside its card");
expect(docs.includes("max-w-6xl") && docs.includes("lg:grid-cols-2"), "Docs page should use constrained responsive article grids");
expect(docs.includes("sm:grid-cols-2") && docs.includes("lg:grid-cols-4"), "Docs CTA cards should wrap responsively");
expect(docs.includes("Introducing Kyro"), "Docs page should include the launch article title");
expect(docsNav.includes("On this page") && docs.includes("#arc-reputation-score") && docs.includes("#get-started"), "Docs page should include mobile-safe table of contents anchors");
expect(docs.includes("Common questions") && docs.includes("Is ARC Score based only on transaction count?"), "Docs page should include launch FAQ content");
expect(docs.includes("<DocsOnThisPage items={tocItems} />"), "Docs page should use the dedicated docs sidebar component");
expect(docs.includes("md:grid-cols-[240px_minmax(0,1fr)]") && docs.includes("md:items-start"), "Docs sidebar and article should share a tall desktop/tablet grid");
expect(docs.includes("docs-content-grid") && docs.includes("docs-sidebar-column") && docs.includes("docs-article"), "Docs page should use an explicit shared sidebar/article grid structure");
expect(docs.includes("docs-content-grid mt-14") && docs.includes("md:mt-16") && docs.includes("lg:mt-20"), "Docs content grid should use compact normal spacing while anchor offsets handle header safety");
expect(docs.includes("Active development, transparent improvement") && docs.includes("active building phase"), "Docs page should explain launch/building phase context clearly");
expect(docs.includes("<aside className=\"docs-sidebar-column") && docs.includes("<article className=\"docs-article"), "Docs sidebar and the full article should be sibling landmarks");
expect(docs.indexOf("docs-sidebar-column") > -1 && docs.indexOf("docs-article") > docs.indexOf("docs-sidebar-column"), "Docs sidebar should appear before the article inside the shared grid");
expect(!/<article className="[^"]*fade-in[\s\S]*<DocsOnThisPage/.test(docs), "Docs sticky sidebar should not sit inside a transformed fade-in article wrapper");
expect(docs.includes('id="overview"') && docs.includes('id="two-layer-model"') && docs.includes('id="verified-attestations"'), "Docs page should keep stable section IDs");
expect(docs.includes("scroll-mt-40") && docs.includes("md:scroll-mt-44"), "Docs sections should have generous scroll margin for the sticky header");
expect(docs.includes("docs-sidebar-column min-w-0 md:sticky md:top-32 md:self-start lg:top-28"), "Docs sidebar column should be the sticky element, not a child constrained by a short aside");
expect(!docs.match(/docs-sidebar-column[^"]*overflow/), "Docs sticky sidebar column should not be an overflow container because that breaks page sticky behavior");
expect(docsNav.includes("md:max-h-[calc(100dvh-9.5rem)]") && docsNav.includes("md:overflow-y-auto"), "Docs nav card should own internal scrolling while the sidebar column owns sticky positioning");
expect(!docsNav.includes("md:sticky") && !docsNav.includes("sticky"), "Docs nav card should not be sticky inside its own short sidebar parent");
expect(docsNav.includes("DOCS_HEADER_OFFSET_PX") && docsNav.includes("window.scrollTo"), "Docs sidebar smooth scroll should account for the sticky header offset");
expect(docsNav.includes("prefers-reduced-motion: reduce"), "Docs sidebar should respect reduced motion");
expect(docsNav.includes("aria-current={active ? \"location\" : undefined}"), "Docs sidebar should expose active section state accessibly");

const docsGridClass = docs.match(/<div className="([^"]*docs-content-grid[^"]*)"/)?.[1] ?? "";
const docsSidebarClass = docs.match(/<aside className="([^"]*docs-sidebar-column[^"]*)"/)?.[1] ?? "";
expect(!/(overflow|transform|filter|backdrop-filter|contain)/.test(docsGridClass), "Docs sticky grid wrapper should avoid overflow/transform/filter/contain constraints");
expect(!/(transform|filter|backdrop-filter|contain)/.test(docsSidebarClass), "Docs sticky sidebar wrapper should avoid transform/filter/contain constraints");

expect(directory.includes("min-[390px]:grid-cols-2"), "Directory controls should fit mobile widths without clipped buttons");
expect(directory.includes("Loading registered identities..."), "Directory should show loading text before empty state");

expect(chainExplorer.includes("fixed inset-0") && chainExplorer.includes("items-center justify-center"), "chain explorer modal should be viewport-centered");
expect(chainExplorer.includes("h-[min(92dvh,820px)]"), "chain explorer modal should use safe mobile viewport height");
expect(chainExplorer.includes("min-h-0 flex-1 overflow-y-auto"), "chain explorer list should scroll inside the modal");

expect(dashboard.includes("createPortal(modal, document.body)"), "history modal should render through a portal");
expect(css.includes(".arc-history-dialog") && css.includes("height: min(82dvh, 820px)"), "history modal should keep explicit viewport height");
expect(css.includes(".arc-history-list") && css.includes("overflow-y: auto"), "history modal list should own vertical scroll");

warn(!shell.includes("w-screen"), "avoid w-screen in the shell because it can cause scrollbar-width overflow");

const result = {
  ok: failures.length === 0,
  failures,
  warnings,
  scenario: "launch responsive static readiness checks"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
