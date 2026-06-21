"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Control-room hero: three transform-only depth layers (far pipe-topology grid →
 * mid value conduits → foreground content) that respond to pointer + scroll at
 * different speeds. Purely decorative behind `children`; honors reduced-motion.
 */
export function ParallaxHero({ children }: { children: ReactNode }) {
  const scene = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const fore = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = scene.current;
    if (!el) return;

    let mx = 0, my = 0, sy = 0, raf = 0;
    const apply = () => {
      raf = 0;
      // depth: far drifts most, foreground barely — opposite sign for "pop".
      if (far.current) far.current.style.transform = `translate3d(${mx * 14}px, ${my * 14 + sy * 0.06}px, 0)`;
      if (mid.current) mid.current.style.transform = `translate3d(${mx * 7}px, ${my * 7 + sy * 0.03}px, 0)`;
      if (fore.current) fore.current.style.transform = `translate3d(${mx * -3}px, ${my * -3}px, 0)`;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
      my = (e.clientY - r.top) / r.height - 0.5;
      schedule();
    };
    const onLeave = () => { mx = 0; my = 0; schedule(); };
    const onScroll = () => { sy = Math.min(window.scrollY, 600); schedule(); };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={scene} className="px-scene" style={{ position: "relative", overflow: "hidden" }}>
      {/* far: drifting pipe-topology dot grid */}
      <div
        ref={far}
        className="px-layer px-grid cp-drift"
        aria-hidden
        style={{
          position: "absolute",
          inset: "-12% -8%",
          zIndex: 0,
          animation: "cpDrift 26s linear infinite",
          opacity: 0.7,
        }}
      />
      {/* mid: faint value-conduits with flowing dashes */}
      <svg
        ref={mid as unknown as React.RefObject<SVGSVGElement>}
        className="px-layer"
        aria-hidden
        viewBox="0 0 1200 460"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", opacity: 0.5 }}
      >
        <defs>
          <linearGradient id="cpEdge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#14f195" stopOpacity="0" />
            <stop offset="0.5" stopColor="#14f195" stopOpacity="0.5" />
            <stop offset="1" stopColor="#4d9fff" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {[80, 190, 300, 410].map((y, i) => (
          <g key={y}>
            <path d={`M-40 ${y} C 300 ${y - 40}, 520 ${y + 60}, 1240 ${y - 20}`} fill="none" stroke="#1b212b" strokeWidth="1" />
            <path
              className="cp-conduit"
              d={`M-40 ${y} C 300 ${y - 40}, 520 ${y + 60}, 1240 ${y - 20}`}
              fill="none"
              stroke="url(#cpEdge)"
              strokeWidth="1.5"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
          </g>
        ))}
      </svg>
      {/* foreground content */}
      <div ref={fore} className="px-layer" style={{ position: "relative", zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}
