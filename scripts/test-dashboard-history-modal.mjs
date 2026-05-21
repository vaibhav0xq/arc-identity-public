import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(dashboard.includes("className=\"arc-history-overlay\""), "history modal should use its dedicated fixed overlay class");
expect(dashboard.includes("className=\"arc-history-dialog\""), "history modal should use its dedicated dialog class");
expect(dashboard.includes("import { createPortal } from \"react-dom\";"), "history modal should import createPortal");
expect(dashboard.includes("createPortal(modal, document.body)"), "history modal should render through a document.body portal");
expect(dashboard.includes("const [mounted, setMounted] = useState(false);"), "history modal should guard portal rendering until the client is mounted");
expect(dashboard.includes("className=\"arc-history-list\""), "history list should use the dedicated scroll container class");
expect(dashboard.includes("className=\"arc-history-header\""), "history modal should use a fixed header section");
expect(dashboard.includes("className=\"arc-history-footer\""), "history modal should use a fixed footer section");
expect(dashboard.includes("className=\"arc-history-event-grid\""), "history event rows should use the dedicated row grid");
expect(dashboard.includes("arc-history-event-icon"), "history event rows should have a dedicated icon column");
expect(dashboard.includes("className=\"arc-history-event-main\""), "history event middle content should use the non-compressing content class");
expect(dashboard.includes("className=\"arc-history-event-actions\""), "history event right column should use the fixed-width actions class");
expect(dashboard.includes("className=\"arc-history-chip-row\""), "history event type badges should live inside the main content chip row");
expect(!/arc-history-event-grid">\s*<span[^>]*arc-history-event-badge/.test(dashboard), "event type badge should not be the first left grid column");
expect(dashboard.includes("onMouseDown={(event) => event.stopPropagation()}"), "inside modal clicks should not close the dialog");
expect(dashboard.includes("if (event.key === \"Escape\") setOpen(false);"), "Escape key should close history modal");
expect(css.includes(".arc-history-overlay") && css.includes("position: fixed") && css.includes("inset: 0"), "history overlay should cover the viewport");
expect(css.includes("padding: 24px"), "history overlay should use the required desktop viewport padding");
expect(css.includes("z-index: 10000"), "history overlay should render above dashboard/header content");
expect(css.includes(".arc-history-dialog") && css.includes("display: flex") && css.includes("flex-direction: column"), "history dialog should be a flex column");
expect(css.includes("height: min(82vh, 820px)") && css.includes("height: min(82dvh, 820px)"), "history dialog should use large viewport-relative height");
expect(css.includes("min-height: min(620px, calc(100vh - 48px))"), "history dialog should enforce desktop minimum height");
expect(css.includes("max-height: none"), "history dialog should not shrink through legacy max-height constraints");
expect(css.includes("width: min(920px, calc(100vw - 48px))"), "history dialog should use the large launch width");
expect(css.includes(".arc-history-list") && css.includes("flex: 1 1 auto") && css.includes("min-height: 0") && css.includes("overflow-y: auto"), "history list should fill remaining dialog space and own vertical scroll");
expect(css.includes(".arc-history-event-grid") && css.includes("grid-template-columns: 44px minmax(0, 1fr) 130px"), "history event grid should use icon/main/actions columns");
expect(css.includes(".arc-history-event-icon") && css.includes("width: 40px") && css.includes("height: 40px"), "history event icon should be a small circular visual anchor");
expect(css.includes(".arc-history-event-main") && css.includes("overflow-wrap: anywhere"), "history event content should wrap safely");
expect(css.includes(".arc-history-event-actions") && css.includes("min-width: 120px"), "history event action column should not squeeze the description");
expect(!dashboard.includes("arc-drawer-panel") && !dashboard.includes("arc-drawer-list") && !dashboard.includes("arc-drawer-overlay"), "history modal should not use old drawer classes");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenario: "dashboard history modal uses dedicated large centered dialog with internal list scroll"
  }, null, 2));
}
