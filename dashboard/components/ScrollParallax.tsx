"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-driven parallax backdrop for the landing page. A few warm-red ember glows
 * pinned to the viewport that drift upward at different rates as you scroll, giving the
 * dark page depth without decorating any surface. Pointer-inert and reduced-motion safe.
 *
 * Sits at z-0 inside the opaque content plane; page content rides above it at z-10.
 */
export function ScrollParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = ref.current;
    if (!root) return;
    const layers = Array.from(root.querySelectorAll<HTMLElement>("[data-speed]"));
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      for (const l of layers) {
        const sp = parseFloat(l.dataset.speed || "0");
        l.style.transform = `translate3d(0, ${(-y * sp).toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <div data-speed="0.12" className="px-layer absolute" style={{ top: "-12%", left: "-8%", width: "72vw", height: "72vw", background: "radial-gradient(circle at center, rgba(203,90,96,0.20), transparent 60%)" }} />
      <div data-speed="0.30" className="px-layer absolute" style={{ top: "26%", right: "-18%", width: "62vw", height: "62vw", background: "radial-gradient(circle at center, rgba(120,28,33,0.18), transparent 62%)" }} />
      <div data-speed="0.5" className="px-layer absolute" style={{ top: "70%", left: "6%", width: "58vw", height: "58vw", background: "radial-gradient(circle at center, rgba(203,90,96,0.12), transparent 60%)" }} />
      <div data-speed="0.22" className="px-layer absolute" style={{ top: "120%", right: "4%", width: "50vw", height: "50vw", background: "radial-gradient(circle at center, rgba(150,40,46,0.14), transparent 62%)" }} />
    </div>
  );
}
