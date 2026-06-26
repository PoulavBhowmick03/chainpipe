import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getDocBySlug,
  getDocEntries,
  getDocNav,
  indexSlug,
  resolveDocHref,
} from "@/lib/docs";
import { C } from "@/lib/theme";

// fs runs only at build: prerender every doc, 404 anything not in SUMMARY.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ slug: [] as string[] }, ...getDocEntries().map((e) => ({ slug: e.slug.split("/") }))];
}

function slugFromParams(slug?: string[]): string {
  return slug && slug.length ? slug.join("/") : indexSlug();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slugFromParams(slug));
  const title = doc ? `${doc.entry.title} · ChainPipe docs` : "ChainPipe docs";
  return { title };
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const current = slugFromParams(slug);
  const doc = getDocBySlug(current);
  if (!doc) notFound();
  const nav = getDocNav();
  const file = doc.entry.file;

  return (
    <div className="docs-grid" style={{ display: "flex", gap: 40, padding: "32px 0 64px", alignItems: "flex-start" }}>
      {/* sidebar */}
      <aside
        className="docs-side nav-desktop"
        style={{ width: 240, flex: "none", position: "sticky", top: 84, flexDirection: "column", gap: 18 }}
      >
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C.faint, marginBottom: 2 }}>
          Documentation
        </div>
        {nav.map((group, gi) => (
          <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {group.group && (
              <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint, margin: "10px 0 4px" }}>
                {group.group}
              </div>
            )}
            {group.items.map((item) => {
              const on = item.slug === current;
              return (
                <Link
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  style={{
                    fontSize: 14,
                    lineHeight: 1.35,
                    padding: "5px 10px",
                    textDecoration: "none",
                    color: on ? C.bg0 : C.dim,
                    background: on ? C.green : "transparent",
                    borderLeft: `2px solid ${on ? C.green : C.line}`,
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  {item.title}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      {/* article */}
      <article className="md" style={{ flex: 1, minWidth: 0 }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a({ href, children, node, ...rest }) {
              void node;
              const resolved = resolveDocHref(file, href ?? "");
              if (resolved.startsWith("/docs")) {
                return (
                  <Link href={resolved} {...(rest as Record<string, unknown>)}>
                    {children}
                  </Link>
                );
              }
              const external = /^https?:/.test(resolved);
              return (
                <a href={resolved} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...rest}>
                  {children}
                </a>
              );
            },
          }}
        >
          {doc.content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
