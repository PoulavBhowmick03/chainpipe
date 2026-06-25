import Link from "next/link";

/** Broadsheet colophon — wordmark, institutional line, registry links. */
export function Footer() {
  return (
    <footer className="bg-linen border-t border-mist mt-auto">
      <div className="max-w-[1440px] mx-auto px-4 md:px-16 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <Link href="/" className="font-serif text-[28px] font-semibold tracking-tight text-ink no-underline">
          ChainPipe
        </Link>
        <div className="font-serif text-[15px] text-slate">© 2026 CHAINPIPE INSTITUTIONAL</div>
        <nav className="flex gap-6 mono text-[12px] uppercase tracking-wider text-slate">
          <a className="hover:text-oxblood-deep transition-colors" href="https://github.com/PoulavBhowmick03" target="_blank" rel="noreferrer">System Status</a>
          <a className="hover:text-oxblood-deep transition-colors" href="https://github.com/PoulavBhowmick03" target="_blank" rel="noreferrer">Terms of Settlement</a>
          <a className="hover:text-oxblood-deep transition-colors" href="https://github.com/PoulavBhowmick03" target="_blank" rel="noreferrer">Privacy Registry</a>
        </nav>
      </div>
    </footer>
  );
}
