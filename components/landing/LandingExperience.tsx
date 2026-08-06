"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArcIntegrationCard } from "@/components/ArcIntegrationCard";
import { ReportIssueLink } from "@/components/ReportIssueLink";
import { ARC_GITHUB_REPO_URL, ARC_SUPPORT_EMAIL, ARC_TWITTER_URL } from "@/lib/links";

const evidence = [
  ["01", "Transaction pattern", "Consistent settlement rhythm", "verified"],
  ["02", "Trust graph", "Counterparty edges with context", "verified"],
  ["03", "Chain coverage", "Arc · Ethereum · Base", "active"]
];

export function LandingExperience() {
  const instrumentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Add via classList (not React state): a state-driven className rewrite
    // would wipe the observer-added `is-visible` class on re-render.
    const timer = window.setTimeout(() => instrumentRef.current?.classList.add("is-assembled"), 120);
    // After the entrance settles, drop the CSS transform transition (is-live) so the
    // rAF spring drives tilt directly — a per-frame-restarted delayed transition
    // otherwise freezes the tilt while the pointer is moving.
    const liveTimer = window.setTimeout(() => instrumentRef.current?.classList.add("is-live"), 1000);
    const root = document.querySelector<HTMLElement>(".landing-cinematic");
    root?.classList.add("landing-js-ready");
    const items = root ? Array.from(root.querySelectorAll<HTMLElement>(".landing-reveal")) : [];
    if (!("IntersectionObserver" in window)) items.forEach((item) => item.classList.add("is-visible"));
    const settleTimers: number[] = [];
    const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
          // Parallax bases were measured while hidden sections sat 22px low
          // (reveal transform); re-measure once the reveal transition settles.
          settleTimers.push(window.setTimeout(() => { measureParallax(); requestRender(); }, 950));
        }
      });
    }, { threshold: .14, rootMargin: "0px 0px -8% 0px" }) : null;
    items.forEach((item) => observer?.observe(item));
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Stagger children inside each reveal section: index * delay via --rd.
    items.forEach((section) => {
      section.querySelectorAll<HTMLElement>("[data-cascade]").forEach((el, index) => {
        el.style.setProperty("--rd", prefersReduced ? "0ms" : `${Math.min(index * 90, 540)}ms`);
      });
    });
    // Scroll parallax: elements drift at data-parallax speed relative to viewport center.
    const parallax = prefersReduced || !root
      ? []
      : Array.from(root.querySelectorAll<HTMLElement>("[data-parallax]")).map((el) => ({
          el,
          speed: Number.parseFloat(el.dataset.parallax || "0"),
          base: 0
        }));
    const measureParallax = () => {
      parallax.forEach((item) => {
        // Subtract the currently applied offset instead of zeroing --py first,
        // so re-measuring never causes a visible one-frame jump.
        const currentPy = Number.parseFloat(item.el.style.getPropertyValue("--py")) || 0;
        const bounds = item.el.getBoundingClientRect();
        item.base = bounds.top + window.scrollY + bounds.height / 2 - currentPy;
      });
    };
    measureParallax();
    let scrollTarget = window.scrollY;
    let scrollCurrent = scrollTarget;
    const instrument = instrumentRef.current;
    const capabilityRows = root ? Array.from(root.querySelectorAll<HTMLElement>(".capability-row")) : [];
    const buttons = root ? Array.from(root.querySelectorAll<HTMLElement>(".landing-button")) : [];
    const hero = root?.querySelector<HTMLElement>(".landing-command");
    let frame = 0;
    let running = true;
    let targetX = 0;
    let targetY = 0;
    let tiltX = 0;
    let tiltY = 0;
    let pointerClientX = -9999;
    let pointerClientY = -9999;
    const magnetic = buttons.map((element) => ({ element, x: 0, y: 0, targetX: 0, targetY: 0 }));
    const render = () => {
      frame = 0;
      if (!running) return;
      const ease = 0.14;
      tiltX += (targetX - tiltX) * ease;
      tiltY += (targetY - tiltY) * ease;
      instrument?.style.setProperty("--tilt-x", `${tiltX}deg`);
      instrument?.style.setProperty("--tilt-y", `${tiltY}deg`);
      // Lerp the scroll position so parallax/progress glide instead of stepping.
      scrollCurrent += (scrollTarget - scrollCurrent) * 0.11;
      if (Math.abs(scrollTarget - scrollCurrent) < 0.3) scrollCurrent = scrollTarget;
      if (root) {
        const range = Math.max(document.body.scrollHeight - window.innerHeight, 1);
        root.style.setProperty("--landing-scroll", `${Math.min(Math.max(scrollCurrent / range, 0), 1).toFixed(4)}`);
      }
      const viewCenter = scrollCurrent + window.innerHeight / 2;
      parallax.forEach((item) => {
        item.el.style.setProperty("--py", `${((item.base - viewCenter) * item.speed).toFixed(1)}px`);
      });
      magnetic.forEach((item) => {
        const bounds = item.element.getBoundingClientRect();
        const dx = pointerClientX - (bounds.left + bounds.width / 2);
        const dy = pointerClientY - (bounds.top + bounds.height / 2);
        const distance = Math.hypot(dx, dy);
        const strength = distance < 150 ? (1 - distance / 150) : 0;
        item.targetX = (dx / Math.max(bounds.width, 1)) * 7 * strength;
        item.targetY = (dy / Math.max(bounds.height, 1)) * 5 * strength;
        item.x += (item.targetX - item.x) * 0.2;
        item.y += (item.targetY - item.y) * 0.2;
        item.element.style.setProperty("--mag-x", `${item.x.toFixed(2)}px`);
        item.element.style.setProperty("--mag-y", `${item.y.toFixed(2)}px`);
      });
      if (hero && pointerClientX > -1000) {
        const bounds = hero.getBoundingClientRect();
        hero.style.setProperty("--cursor-x", `${pointerClientX - bounds.left}px`);
        hero.style.setProperty("--cursor-y", `${pointerClientY - bounds.top}px`);
      }
      const settling = scrollCurrent !== scrollTarget || Math.abs(targetX - tiltX) > 0.01 || Math.abs(targetY - tiltY) > 0.01 || magnetic.some((item) => Math.abs(item.x - item.targetX) > 0.01 || Math.abs(item.y - item.targetY) > 0.01);
      // Idle out when settled: pointermove/scroll re-arm the loop, so a resting
      // cursor doesn't keep a 60fps loop alive doing per-frame layout reads.
      if (settling) frame = requestAnimationFrame(render);
    };
    const requestRender = () => { if (!frame) frame = requestAnimationFrame(render); };
    const pointerMove = (event: PointerEvent) => {
      if (!instrument || event.pointerType === "touch") return;
      pointerClientX = event.clientX;
      pointerClientY = event.clientY;
      const bounds = instrument.getBoundingClientRect();
      targetX = ((event.clientX - bounds.left) / bounds.width - .5) * 2;
      targetY = ((event.clientY - bounds.top) / bounds.height - .5) * 2;
      targetX *= 2.2;
      targetY *= -2.2;
      instrument.style.setProperty("--glint-x", `${50 + targetX * 8}%`);
      instrument.style.setProperty("--glint-y", `${50 + targetY * 8}%`);
      requestRender();
    };
    const heroPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerClientX = event.clientX;
      pointerClientY = event.clientY;
      requestRender();
    };
    const pointerLeave = () => {
      pointerClientX = -9999;
      pointerClientY = -9999;
      targetX = 0;
      targetY = 0;
      if (instrument) {
        instrument.style.setProperty("--glint-x", "50%");
        instrument.style.setProperty("--glint-y", "50%");
      }
      requestRender();
    };
    instrument?.addEventListener("pointermove", pointerMove);
    instrument?.addEventListener("pointerleave", pointerLeave);
    hero?.addEventListener("pointermove", heroPointerMove);
    hero?.addEventListener("pointerleave", pointerLeave);
    const setLocalPointer = (element: HTMLElement, event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const bounds = element.getBoundingClientRect();
      element.style.setProperty("--pointer-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      element.style.setProperty("--pointer-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
      element.classList.add("is-tracking");
    };
    const clearLocalPointer = (element: HTMLElement) => {
      element.classList.remove("is-tracking");
      element.style.setProperty("--pointer-x", "50%");
      element.style.setProperty("--pointer-y", "50%");
    };
    // Track listeners so cleanup can removeEventListener (never replaceWith/clone
    // React-owned nodes — React crashes removing swapped-out children on unmount).
    const tracked: Array<[HTMLElement, string, EventListener]> = [];
    const on = (element: HTMLElement, type: string, listener: EventListener) => {
      element.addEventListener(type, listener);
      tracked.push([element, type, listener]);
    };
    capabilityRows.forEach((row) => {
      on(row, "pointermove", (event) => setLocalPointer(row, event as PointerEvent));
      on(row, "pointerleave", () => { clearLocalPointer(row); row.classList.remove("is-pressed"); });
      on(row, "focusin", () => row.classList.add("is-focused"));
      on(row, "focusout", () => row.classList.remove("is-focused"));
      on(row, "pointerdown", () => row.classList.add("is-pressed"));
      on(row, "pointerup", () => row.classList.remove("is-pressed"));
      on(row, "pointercancel", () => row.classList.remove("is-pressed"));
    });
    buttons.forEach((button) => {
      on(button, "pointermove", (event) => setLocalPointer(button, event as PointerEvent));
      on(button, "pointerleave", () => { clearLocalPointer(button); button.classList.remove("is-pressed"); });
      on(button, "pointerdown", () => button.classList.add("is-pressed"));
      on(button, "pointerup", () => button.classList.remove("is-pressed"));
      on(button, "pointercancel", () => button.classList.remove("is-pressed"));
    });
    const onScroll = () => {
      scrollTarget = window.scrollY;
      // The rAF loop lerps toward scrollTarget (parallax + progress) and also
      // refreshes magnetic targets when buttons move under a stationary cursor.
      requestRender();
    };
    const onResize = () => {
      measureParallax();
      scrollTarget = window.scrollY;
      requestRender();
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(liveTimer);
      settleTimers.forEach((id) => window.clearTimeout(id));
      observer?.disconnect();
      instrument?.removeEventListener("pointermove", pointerMove);
      instrument?.removeEventListener("pointerleave", pointerLeave);
      hero?.removeEventListener("pointermove", heroPointerMove);
      hero?.removeEventListener("pointerleave", pointerLeave);
      tracked.forEach(([element, type, listener]) => element.removeEventListener(type, listener));
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      running = false;
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="landing-cinematic">
      <div className="landing-progress" aria-hidden="true" />
      <section className="landing-command">
        <div className="landing-command-grid" aria-hidden="true" />
        <div className="landing-hero-copy landing-reveal">
          <div className="landing-eyebrow" data-cascade><span className="landing-eyebrow-line" /> Wallet intelligence / Built on Arc</div>
          <h1 data-cascade>Trust, with a <em>record</em> behind it.</h1>
          <p className="landing-hero-lede" data-cascade>
            Arc Identity turns wallet history into a verified financial credential readable by people, protocols and the systems moving value.
          </p>
          <div className="landing-hero-actions" data-cascade>
            <Link href="/dashboard" className="landing-button landing-button-dark">Launch Identity <span>↗</span></Link>
            <Link href="/docs" className="landing-button landing-button-light">View Docs</Link>
          </div>
          <div className="landing-hero-note" data-cascade>
            <span className="landing-note-mark">ARC</span>
            <span>Transaction-backed identity<br />for money that moves.</span>
          </div>
          <div className="landing-cursor-readout" aria-hidden="true"><span>CAL / 00.000</span><i /><span>FIELD ACTIVE</span></div>
        </div>

        <div ref={instrumentRef} className="landing-instrument landing-reveal" data-parallax="-0.05">
          <div className="instrument-face" aria-hidden="true" />
          <div className="instrument-rail"><span>ARC / IDENTITY</span><span>SPECIMEN 001</span></div>
          <div className="instrument-top">
            <div><span className="instrument-kicker">Credential preview</span><strong>Wallet intelligence</strong></div>
            <span className="instrument-status"><i /> Concept record</span>
          </div>
          <div className="instrument-main">
            <div className="instrument-score">
              <span className="instrument-kicker">Identity score</span>
              <p>Evidence-weighted signal<br />not a volume ranking.</p>
            </div>
            <div className="instrument-graph">
              <span className="instrument-kicker">Trust graph / edge map</span>
              <svg viewBox="0 0 220 150" role="img" aria-label="Illustrative trust graph">
                <path className="graph-edge edge-one" d="M28 84 L78 43 L137 70 L191 27" />
                <path className="graph-edge edge-two" d="M78 43 L106 120 L137 70 L191 119" />
                <circle cx="28" cy="84" r="5" /><circle cx="78" cy="43" r="6" /><circle cx="137" cy="70" r="7" /><circle cx="191" cy="27" r="4" /><circle cx="106" cy="120" r="4" /><circle cx="191" cy="119" r="5" />
              </svg>
              <div className="graph-caption"><span /> counterparties, attestations, context</div>
            </div>
          </div>
          <div className="instrument-evidence">
            <div className="instrument-kicker">Evidence layers</div>
            {evidence.map(([number, label, detail, state]) => (
              <div className="evidence-row" key={number}>
                <span className="evidence-number">{number}</span><strong>{label}</strong><span>{detail}</span><b className={state === "active" ? "is-active" : ""}>{state}</b>
              </div>
            ))}
          </div>
          <div className="instrument-footer"><span>PUBLIC CREDENTIAL / ARC-001</span><span>Connect wallet to make the record yours</span></div>
          <div className="instrument-scan" aria-hidden="true" />
        </div>
        <div className="landing-fold-hint"><span>01</span><span>Scroll to inspect the record</span><i /></div>
      </section>

      <section className="landing-thesis landing-reveal">
        <div className="landing-thesis-index" data-parallax="-0.07">A / The premise</div>
        <div className="landing-thesis-content">
          <p className="landing-thesis-lede" data-cascade>An address is only the beginning. <em>Identity is the evidence that accumulates around it.</em></p>
          <div className="landing-thesis-columns" data-cascade>
            <p>We make that evidence legible: the counterparties you return to, the transactions you complete, the attestations that survive scrutiny.</p>
            <div className="landing-signal-list"><div><b>Read</b><span>See the pattern behind a wallet.</span></div><div><b>Prove</b><span>Attach real interactions to a claim.</span></div><div><b>Decide</b><span>Know more before value moves.</span></div></div>
          </div>
        </div>
      </section>

      <section className="landing-capabilities landing-reveal">
        <div className="landing-section-intro" data-cascade><span className="landing-eyebrow">02 / What the record carries</span><h2>More than a score.<br /><em>A reason to trust it.</em></h2></div>
        <div className="landing-capability-stack">
          <article className="capability-row" data-cascade><span className="cap-number">01</span><div><h3>Identity Score</h3><p>A portable signal built from behavior, not borrowed reputation. Every score has a trail back to evidence.</p></div><span className="cap-glyph">↗</span></article>
          <article className="capability-row" data-cascade><span className="cap-number">02</span><div><h3>Trust graph</h3><p>Counterparties become context. See reciprocal relationships and the edges that make a wallet legible.</p></div><span className="cap-glyph">⌁</span></article>
          <article className="capability-row" data-cascade><span className="cap-number">03</span><div><h3>Multichain coverage</h3><p>One identity surface across the networks where a person actually moves value.</p></div><span className="cap-glyph">◎</span></article>
          <article className="capability-row" data-cascade><span className="cap-number">04</span><div><h3>Verified attestations</h3><p>Claims with provenance, timestamp and a public way to verify them before you rely on them.</p></div><span className="cap-glyph">✓</span></article>
        </div>
      </section>

      <section className="landing-developer landing-reveal">
        <div data-cascade><span className="landing-eyebrow">03 / For builders</span><h2>Give your protocol<br />a better <em>first question.</em></h2></div>
        <div data-cascade><p>Bring wallet intelligence into payments, lending, escrow and reputation checks without rebuilding the evidence layer.</p><Link href="/developers" className="landing-text-link">Explore the developer surface <span>→</span></Link></div>
      </section>

      <section className="landing-support landing-reveal">
        <div className="landing-support-copy"><span className="landing-eyebrow">04 / Built for Arc</span><h2>Native to the network <em>value settles on.</em></h2><p>Arc-native, EVM-compatible and designed around the realities of stablecoin activity.</p></div>
        <ArcIntegrationCard />
      </section>

      <section className="landing-footer-cta landing-reveal">
        <span className="landing-eyebrow" data-cascade>Start with the address. Leave with a record.</span>
        <h2 data-parallax="-0.045">Make trust<br /><em>inspectable.</em></h2>
        <div data-cascade><Link href="/dashboard" className="landing-button landing-button-dark">Launch Identity <span>↗</span></Link><Link href="/docs" className="landing-text-link">Read the identity model <span>→</span></Link></div>
      </section>
      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <p className="landing-footer-name">Arc Identity</p>
            <p className="landing-footer-tag">Wallet intelligence for the Arc economy. Trust, with a record behind it.</p>
            <a className="landing-footer-mail" href={`mailto:${ARC_SUPPORT_EMAIL}`}>{ARC_SUPPORT_EMAIL}</a>
          </div>
          <nav className="landing-footer-col" aria-label="Product">
            <p>Product</p>
            <Link href="/dashboard">Launch Identity</Link>
            <Link href="/directory">Directory</Link>
            <Link href="/attestations">Verify attestation</Link>
            <Link href="/developers">Developer API</Link>
          </nav>
          <nav className="landing-footer-col" aria-label="Resources">
            <p>Resources</p>
            <Link href="/docs">Identity model docs</Link>
            <a href={ARC_GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href={ARC_TWITTER_URL} target="_blank" rel="noopener noreferrer">X / Twitter</a>
            <ReportIssueLink />
          </nav>
          <nav className="landing-footer-col" aria-label="Legal">
            <p>Legal</p>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of use</Link>
            <a href={`mailto:${ARC_SUPPORT_EMAIL}`}>Support</a>
          </nav>
        </div>
        <div className="landing-footer-base">
          <span>Arc Identity &#183; arcidentity.in &#183; 2026</span>
          <span>Built on Arc. Arc Identity is an independent project and is not affiliated with Circle.</span>
        </div>
      </footer>
    </div>
  );
}