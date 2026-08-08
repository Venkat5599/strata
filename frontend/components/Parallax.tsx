"use client";

import {useEffect} from "react";

/**
 * Scroll-linked parallax. Elements marked [data-px] drift as the page scrolls,
 * at a per-element speed (data-px-speed). Positive drifts one way, negative the
 * other, so alternating columns move in opposite directions as you scroll.
 *
 * Content-safe: the drift is written to a --px custom property, and the element
 * translates by var(--px, 0). With no JS or reduced-motion, --px is never set,
 * so it resolves to 0 and every element sits in its normal, fully-visible place.
 * Parallax only offsets an already-placed element; it never hides one.
 */
export function Parallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-px]"));
    if (!els.length) return;

    let raf = 0;
    const tick = () => {
      const vh = window.innerHeight;
      for (const el of els) {
        const speed = parseFloat(el.dataset.pxSpeed || "0.08");
        const r = el.getBoundingClientRect();
        const progress = (r.top + r.height / 2 - vh / 2) / vh;
        // amplitude tuned so a 0.1 speed drifts ~40px across the viewport -
        // clearly visible, not the near-imperceptible 12px of the first pass.
        el.style.setProperty("--px", `${(-progress * speed * 420).toFixed(1)}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
