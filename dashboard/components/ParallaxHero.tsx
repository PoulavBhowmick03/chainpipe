"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Product-meaningful parallax hero. The background diagrams what ChainPipe does, in depth
 * layers that respond to pointer + scroll at different speeds:
 *
 *   far   (blueprint, drifts most) — dark pipe casings fanning from a manifold junction.
 *   mid   (live flow, drifts less) — value streaming green from the manifold and DISSOLVING
 *                                    into the live-pipeline card (the card is the destination);
 *                                    one heavier red branch = the missed-deadline refund.
 *   fore  (content, counter-drifts)— the hero copy + live DAG card.
 *
 * Geometry note: the manifold sits to the RIGHT of the text column (text wraps ~x488), and
 * conduits flow further right and FADE OUT exactly where the card begins — so they read as
 * flowing into the card, never strike through copy, and never hard-stop with a visible gap.
 * Honors prefers-reduced-motion; the conduit layer is hidden on mobile so nothing crosses copy.
 */

// viewBox x ≈ fraction of container width (preserveAspectRatio="none" → deterministic mapping).
// Text wraps by ~x488 of the ~1260 inner (≈ viewBox 465), so the manifold at 600 sits safely
// in the gutter with margin. Conduits fade out inside the card (CARD_X) — into the node rows.
const MANIFOLD = { x: 600, y: 300 };
const CARD_X = 770;
const BRANCHES = [
  { d: `M${MANIFOLD.x},${MANIFOLD.y} C 668,300 712,182 ${CARD_X},182`, kind: "settled" },
  { d: `M${MANIFOLD.x},${MANIFOLD.y} C 676,300 720,250 ${CARD_X},250`, kind: "settled" },
  { d: `M${MANIFOLD.x},${MANIFOLD.y} C 686,300 726,318 ${CARD_X},318`, kind: "settled" },
  { d: `M${MANIFOLD.x},${MANIFOLD.y} C 668,316 720,382 ${CARD_X},382`, kind: "refund" },
] as const;

const GREEN = "#14f195";
const RED = "#ff5b5b";

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
      if (far.current) far.current.style.transform = `translate3d(${mx * 30}px, ${my * 24 + sy * 0.14}px, 0)`;
      if (mid.current) mid.current.style.transform = `translate3d(${mx * 16}px, ${my * 13 + sy * 0.07}px, 0)`;
      if (fore.current) fore.current.style.transform = `translate3d(${mx * -5}px, ${my * -5}px, 0)`;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
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
      {/* far: blueprint — dark pipe casings fanning from the manifold */}
      <svg
        ref={far as unknown as React.RefObject<SVGSVGElement>}
        className="px-layer px-blueprint"
        aria-hidden
        viewBox="0 0 1200 520"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: "-6% -4%", zIndex: 0, width: "108%", height: "112%", opacity: 0.6 }}
      >
        {BRANCHES.map((b, i) => (
          <path key={"cas" + i} d={b.d} fill="none" stroke="#161d28" strokeWidth="9" strokeLinecap="round" />
        ))}
        {BRANCHES.map((b, i) => (
          <path key={"inner" + i} d={b.d} fill="none" stroke="#222c3a" strokeWidth="1.25" />
        ))}
        <circle cx={MANIFOLD.x} cy={MANIFOLD.y} r={6} fill="#0e1319" stroke="#2c3747" strokeWidth="1.5" />
      </svg>

      {/* mid: live value flow — green into the card, one heavier red refund branch */}
      <svg
        ref={mid as unknown as React.RefObject<SVGSVGElement>}
        className="px-layer px-flow"
        aria-hidden
        viewBox="0 0 1200 520"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: "-6% -4%", zIndex: 1, width: "108%", height: "112%" }}
      >
        <defs>
          {/* conducting lines fade to nothing exactly where the card begins → no hard stop, no gap */}
          <linearGradient id="cpGreenLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={GREEN} stopOpacity="0.85" />
            <stop offset="0.55" stopColor={GREEN} stopOpacity="0.85" />
            <stop offset="1" stopColor={GREEN} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cpGreenFlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={GREEN} stopOpacity="0" />
            <stop offset="0.4" stopColor={GREEN} stopOpacity="1" />
            <stop offset="0.7" stopColor="#4d9fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#4d9fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cpRedLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={RED} stopOpacity="0.95" />
            <stop offset="0.55" stopColor={RED} stopOpacity="0.95" />
            <stop offset="1" stopColor={RED} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cpRedFlow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff9a7a" stopOpacity="0" />
            <stop offset="0.5" stopColor={RED} stopOpacity="1" />
            <stop offset="1" stopColor={RED} stopOpacity="0" />
          </linearGradient>
          <filter id="cpHeroGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {BRANCHES.map((b, i) => {
          const refund = b.kind === "refund";
          return (
            <g key={i}>
              {/* conducting line — refund branch is visibly heaviest + red */}
              <path d={b.d} fill="none" stroke={refund ? "url(#cpRedLine)" : "url(#cpGreenLine)"} strokeWidth={refund ? 3.5 : 2} filter="url(#cpHeroGlow)" />
              {/* flowing packets — green forward into settled nodes, red reversed (refund cascading back) */}
              <path
                className="cp-conduit"
                d={b.d}
                fill="none"
                stroke={refund ? "url(#cpRedFlow)" : "url(#cpGreenFlow)"}
                strokeWidth={refund ? 4.5 : 3}
                style={refund
                  ? { animationDirection: "reverse" as const, animationDuration: "1.5s" }
                  : { animationDelay: `${i * 0.4}s` }}
              />
            </g>
          );
        })}
        <circle cx={MANIFOLD.x} cy={MANIFOLD.y} r={5} fill={GREEN} filter="url(#cpHeroGlow)" />
      </svg>

      {/* scrim: an ellipse over the headline/paragraph keeps copy crisp */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1.5 as unknown as number,
          background: "radial-gradient(ellipse 54% 70% at 23% 35%, rgba(7,9,13,0.97) 46%, rgba(7,9,13,0) 78%)",
          pointerEvents: "none",
        }}
      />
      {/* foreground content */}
      <div ref={fore} className="px-layer" style={{ position: "relative", zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}
