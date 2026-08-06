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
      className="r4-panel md:max-h-[calc(100dvh-9.5rem)] md:overflow-y-auto lg:max-h-[calc(100dvh-8.75rem)]"
    >
      <p className="kicker">On this page</p>
      <div className="mt-4 grid">
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
                ? "border-l-2 border-gold bg-[#eee4cd]/60 px-3 py-2.5 text-sm font-semibold text-ink transition"
                : "border-l border-linec px-3 py-2.5 text-sm font-medium text-mutedc transition hover:border-line-dark hover:text-ink"}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
