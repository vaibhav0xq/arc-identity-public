"use client";

import { useEffect, useState } from "react";

type DocsNavItem = {
  label: string;
  href: `#${string}`;
};

const DOCS_HEADER_OFFSET_PX = 156;

export function DocsOnThisPage({ items }: { items: DocsNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.href.slice(1) ?? "");

  useEffect(() => {
    const sectionIds = items.map((item) => item.href.slice(1));
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      {
        rootMargin: "-125px 0px -60% 0px",
        threshold: [0.05, 0.2, 0.45]
      }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const target = document.getElementById(href.slice(1));
    if (!target) return;

    event.preventDefault();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetTop = target.getBoundingClientRect().top + window.scrollY - DOCS_HEADER_OFFSET_PX;
    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
    window.history.replaceState(null, "", href);
    setActiveId(target.id);
  }

  return (
    <nav
      aria-label="On this page"
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:max-h-[calc(100dvh-9.5rem)] md:overflow-y-auto lg:max-h-[calc(100dvh-8.75rem)]"
    >
      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-300">On this page</p>
      <div className="mt-4 grid gap-2">
        {items.map((item) => {
          const id = item.href.slice(1);
          const active = id === activeId;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "location" : undefined}
              onClick={(event) => handleClick(event, item.href)}
              className={active
                ? "rounded-xl border border-amber-200/25 bg-amber-200/[0.10] px-3 py-2.5 text-sm font-black text-amber-50 shadow-[0_0_24px_rgba(212,175,55,0.08)] transition"
                : "rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-emerald-300/20 hover:bg-emerald-300/[0.06] hover:text-white"}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
