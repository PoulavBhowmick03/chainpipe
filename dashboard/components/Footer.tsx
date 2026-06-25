import Link from "next/link";

const PROTOCOL: [string, string][] = [
  ["Overview", "/"],
  ["Bazaar", "/bazaar"],
  ["Work", "/work"],
  ["Create", "/pipeline/create"],
  ["Pipelines", "/my/pipelines"],
];

const REGISTRY: [string, string][] = [
  ["System Status", "https://github.com/PoulavBhowmick03/chainpipe"],
  ["Terms of Settlement", "https://github.com/PoulavBhowmick03/chainpipe"],
  ["Privacy Registry", "https://github.com/PoulavBhowmick03/chainpipe"],
  ["Source · GitHub", "https://github.com/PoulavBhowmick03/chainpipe"],
];

/**
 * Back-page footer. Fixed to the viewport bottom (z-0) and revealed as the opaque
 * content plane above it scrolls away — the giant ChainPipe wordmark bleeds off the
 * bottom edge as the brand's "colophon." Height is governed by --footer-h, which the
 * layout reserves as margin below the content.
 */
export function Footer() {
  return (
    <footer
      className="fixed bottom-0 left-0 w-full overflow-hidden bg-ink text-linen"
      style={{ height: "var(--footer-h)", zIndex: 0 }}
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-16 h-full flex flex-col">
        {/* masthead rule — linen over a faint hairline */}
        <div className="pt-10 md:pt-12">
          <div style={{ borderTop: "3px solid #F4F1EA", borderBottom: "1px solid rgba(244,241,234,.20)", height: 4 }} />
        </div>

        {/* columns: standfirst + link directories */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 pt-8 md:pt-10">
          <div className="col-span-2 md:col-span-5">
            <p className="font-serif italic leading-snug" style={{ color: "#EDE9E0", fontSize: "clamp(17px, 1.6vw, 22px)", maxWidth: 460 }}>
              The authoritative registry of definitive settlement. One USDC budget, locked once,
              across a DAG of staked agents.
            </p>
          </div>
          <nav className="md:col-span-3 md:col-start-7">
            <h4 className="mono uppercase tracking-widest mb-4" style={{ color: "#9C968A", fontSize: 12 }}>Protocol</h4>
            <ul className="flex flex-col gap-2.5">
              {PROTOCOL.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="font-serif no-underline transition-colors" style={{ color: "#C9C3B5", fontSize: 15 }}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav className="md:col-span-3">
            <h4 className="mono uppercase tracking-widest mb-4" style={{ color: "#9C968A", fontSize: 12 }}>Registry</h4>
            <ul className="flex flex-col gap-2.5">
              {REGISTRY.map(([label, href]) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noreferrer" className="font-serif no-underline transition-colors" style={{ color: "#C9C3B5", fontSize: 15 }}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* colophon microline */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-8 pt-4" style={{ borderTop: "1px solid rgba(244,241,234,.16)" }}>
          <span className="mono uppercase tracking-wider" style={{ color: "#9C968A", fontSize: 12 }}>© 2026 ChainPipe Institutional · Devnet</span>
          <span className="mono uppercase tracking-wider" style={{ color: "#9C968A", fontSize: 12 }}>Built on Solana · USDC escrow protocol</span>
        </div>

        {/* spacer pushes the wordmark to the bottom edge */}
        <div className="flex-1" />

        {/* the colophon: a giant wordmark, full-bleed, bleeding off the bottom */}
        <div
          className="font-serif select-none pointer-events-none whitespace-nowrap"
          style={{
            fontWeight: 600,
            fontSize: "clamp(64px, 20.5vw, 320px)",
            letterSpacing: "-0.045em",
            lineHeight: 0.78,
            marginBottom: "-0.16em",
          }}
        >
          <span style={{ color: "#F4F1EA" }}>Chain</span>
          <span style={{ color: "#C2545B" }}>Pipe</span>
        </div>
      </div>
    </footer>
  );
}
