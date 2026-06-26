// Server-only docs loader. Reads the repo's `docs/` markdown at build time (the /docs route
// is force-static, so fs only runs during `next build`, never at request time). The nav is
// derived from docs/SUMMARY.md so it stays in sync with the GitBook table of contents.
import fs from "node:fs";
import path from "node:path";

const GITHUB_BLOB = "https://github.com/PoulavBhowmick03/chainpipe/blob/main";

export interface DocEntry {
  slug: string; // path-style, e.g. "product" or "audit/security-review-programs"
  title: string;
  file: string; // relative to docs/, e.g. "audit/SECURITY-REVIEW-programs.md"
  group: string | null;
}

/** Find the repo docs/ dir. dashboard is the Vercel root, so docs/ sits one level up. */
function docsDir(): string {
  const candidates = [
    path.join(process.cwd(), "..", "docs"),
    path.join(process.cwd(), "docs"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "SUMMARY.md"))) return c;
  }
  throw new Error("docs/SUMMARY.md not found from " + process.cwd());
}

function slugFor(rel: string): string {
  return rel
    .replace(/\.md$/i, "")
    .split("/")
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .join("/");
}

let _cache: DocEntry[] | null = null;

export function getDocEntries(): DocEntry[] {
  if (_cache) return _cache;
  const dir = docsDir();
  const summary = fs.readFileSync(path.join(dir, "SUMMARY.md"), "utf8");
  const entries: DocEntry[] = [];
  let group: string | null = null;
  for (const line of summary.split("\n")) {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      group = h[1].trim();
      continue;
    }
    const m = line.match(/^\s*\*\s+\[([^\]]+)\]\(([^)]+)\)/);
    if (m && m[2].trim().endsWith(".md")) {
      const file = m[2].trim();
      entries.push({ slug: slugFor(file), title: m[1].trim(), file, group });
    }
  }
  _cache = entries;
  return entries;
}

export interface DocNavGroup {
  group: string | null;
  items: DocEntry[];
}

export function getDocNav(): DocNavGroup[] {
  const groups: DocNavGroup[] = [];
  for (const e of getDocEntries()) {
    let g = groups.find((x) => x.group === e.group);
    if (!g) {
      g = { group: e.group, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  return groups;
}

export function getDocBySlug(slug: string): { entry: DocEntry; content: string } | null {
  const entry = getDocEntries().find((e) => e.slug === slug);
  if (!entry) return null;
  const content = fs.readFileSync(path.join(docsDir(), entry.file), "utf8");
  return { entry, content };
}

/**
 * Rewrite a markdown link found inside a doc so it works on the site:
 *  - links to another doc in SUMMARY → internal /docs/<slug>
 *  - links to a repo file not in the docs site (../README.md, ../SECURITY.md) → GitHub blob
 *  - anchors / http(s) / mailto → unchanged
 */
export function resolveDocHref(currentFile: string, href: string): string {
  if (!href || /^(https?:|mailto:|#)/.test(href)) return href;
  if (!href.includes(".md")) return href;
  const [pathPart, anchor] = href.split("#");
  const curDir = path.posix.dirname("docs/" + currentFile);
  const resolved = path.posix.normalize(path.posix.join(curDir, pathPart));
  const suffix = anchor ? "#" + anchor : "";
  if (resolved.startsWith("docs/")) {
    const rel = resolved.slice("docs/".length);
    const entry = getDocEntries().find((e) => e.file === rel);
    if (entry) return `/docs/${entry.slug}${suffix}`;
  }
  return `${GITHUB_BLOB}/${resolved}`;
}

/** The doc shown at /docs (no slug). README.md if present, else the first entry. */
export function indexSlug(): string {
  const entries = getDocEntries();
  const readme = entries.find((e) => e.file.toLowerCase() === "readme.md");
  return (readme ?? entries[0])?.slug ?? "readme";
}
