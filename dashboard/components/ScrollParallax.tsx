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

  // Embers drift up at varied rates as you scroll. They're stacked top-to-bottom and
  // spaced ~one viewport apart so something is always entering from below — combined with
  // the viewport-fixed ambient on the content plane, the page never shows a dark band.
  const embers: { top: string; x: string; size: string; speed: string; color: string }[] = [
    { top: "-15%", x: "left:-10%", size: "60vw", speed: "0.20", color: "rgba(203,90,96,0.26)" },
    { top: "32%", x: "right:-14%", size: "54vw", speed: "0.45", color: "rgba(150,40,46,0.24)" },
    { top: "82%", x: "left:4%", size: "52vw", speed: "0.66", color: "rgba(203,90,96,0.20)" },
    { top: "130%", x: "right:-6%", size: "50vw", speed: "0.34", color: "rgba(168,46,52,0.22)" },
    { top: "185%", x: "left:-4%", size: "48vw", speed: "0.55", color: "rgba(120,28,33,0.20)" },
  ];
  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {embers.map((e, i) => {
        const [side, val] = e.x.split(":");
        return (
          <div
            key={i}
            data-speed={e.speed}
            className="px-layer absolute"
            style={{
              top: e.top,
              [side]: val,
              width: e.size,
              height: e.size,
              background: `radial-gradient(circle at center, ${e.color}, transparent 62%)`,
              filter: "blur(8px)",
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
