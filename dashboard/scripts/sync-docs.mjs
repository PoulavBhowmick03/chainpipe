// Vendors the canonical repo docs (../../docs) into dashboard/content/docs so the
// standalone Vercel build (which uploads only the dashboard dir) can read them at build time.
//
// Run automatically before `npm run dev` / `npm run build` (see package.json pre-scripts).
// On Vercel the source isn't present and `next build` is invoked directly (no pre-script), so
// the COMMITTED content/docs copy is what ships. Canonical source stays docs/ (GitBook reads it).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..", "docs");
const dest = path.join(here, "..", "content", "docs");

if (!fs.existsSync(path.join(src, "SUMMARY.md"))) {
  console.log("[sync-docs] no ../../docs source — using the committed content/docs copy.");
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (s) => fs.statSync(s).isDirectory() || s.endsWith(".md"),
});
console.log(`[sync-docs] synced markdown from ${path.relative(process.cwd(), src)} → ${path.relative(process.cwd(), dest)}`);
