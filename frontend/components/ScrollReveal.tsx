"use client";

import {useEffect} from "react";

/**
 * Scroll-triggered reveals, implemented so they can never hide content.
 *
 * Content is VISIBLE BY DEFAULT. Elements marked [data-sr] are styled normally
 * until this component mounts and stamps html[data-sr-ready]. Only then does the
 * hidden-initial state apply, and an IntersectionObserver adds .sr-in to animate
 * each element in as it enters view.
 *
 * If JS never runs, the observer is unsupported, or the user prefers reduced
 * motion, [data-sr-ready] is never set and every element renders fully visible.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    root.setAttribute("data-sr-ready", "");

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-sr]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("sr-in");
            io.unobserve(e.target);
          }
        }
      },
      {rootMargin: "0px 0px -8% 0px", threshold: 0.12},
    );

    // Anything already within the first viewport reveals immediately and
    // synchronously, so above-the-fold content never waits on an async observer
    // tick and never flashes blank. Only elements below the fold animate on scroll.
    const vh = window.innerHeight;
    for (const el of els) {
      if (el.getBoundingClientRect().top < vh * 0.92) {
        el.classList.add("sr-in");
      } else {
        io.observe(el);
      }
    }

    return () => {
      io.disconnect();
      root.removeAttribute("data-sr-ready");
    };
  }, []);

  return null;
}
