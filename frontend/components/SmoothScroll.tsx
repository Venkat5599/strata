"use client";

import {useEffect} from "react";
import Lenis from "lenis";

// Weighty, editorial smooth scroll. Enhancement only: with reduced-motion or if this never
// mounts, the page scrolls natively and every element stays fully visible. No content is
// gated on any animation.
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({lerp: 0.11, wheelMultiplier: 0.9});
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
