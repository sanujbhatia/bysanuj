import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { articles, sources } from "@/db/schema";
import { AddUrlForm, DeleteButton, TopicSelect } from "@/components/admin-client";
import { approveArticle, setHidden, setPinned } from "@/actions/admin";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VIEWS = { all: "All", public: "Public", hidden: "Hidden", review: "Needs review", pinned: "Featured" } as const;
type View = keyof typeof VIEWS;
const PER = 50;

export default async function AdminArticles({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; pub?: string; p?: string }> }) {
  const sp = await searchParams;
  const view: View = (sp.view as View) in VIEWS ? (sp.view as View) : "all";
  const page = Math.max(1, Number(sp.p) || 1);
  const q = sp.q?.trim();

  const conds: SQL[] = [];
  if (view === "public") conds.push(eq(articles.hidden, false));
  if (view === "hidden") conds.push(eq(articles.hidden, true));
  if (view === "review") conds.push(and(eq(articles.byline, "unverified"), eq(articles.hidden, true))!);
  if (view === "pinned") conds.push(eq(articles.pinned, true));
  if (sp.pub) conds.push(eq(articles.sourceId, sp.pub));
  if (q) conds.push(or(ilike(articles.title, `%${q}%`), ilike(articles.url, `%${q}%`))!);
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ n }], srcs] = await Promise.all([
    db.select().from(articles).where(where)
      .orderBy(sql`${articles.publishedAt} desc nulls last`, desc(articles.createdAt))
      .limit(PER).offset((page - 1) * PER),
    db.select({ n: count() }).from(articles).where(where),
    db.select().from(sources).orderBy(sources.sortOrder),
  ]);
  const srcById = new Map(srcs.map((s) => [s.id, s]));
  const pages = Math.max(1, Math.ceil(n / PER));
  const href = (o: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    Object.entries({ view: sp.view, q: sp.q, pub: sp.pub, ...o }).forEach(([k, v]) => v && s.set(k, v));
    return `/admin/articles?${s}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-[16px] font-semibold">Add an article by link</h2>
        <AddUrlForm />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link key={v} href={href({ view: v === "all" ? undefined : v, p: undefined })}
              className={`rounded-full px-3 py-1 text-[13px] ${view === v ? "bg-text text-bg" : "bg-sunken text-muted hover:text-text"}`}>
              {VIEWS[v]}
            </Link>
          ))}
          <form className="ml-auto flex gap-2" action="/admin/articles">
            {sp.view && <input type="hidden" name="view" value={sp.view} />}
            <select name="pub" defaultValue={sp.pub ?? ""} className="h-8 rounded-md border border-border bg-panel px-1.5 text-[13px]">
              <option value="">All publications</option>
              {srcs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input name="q" defaultValue={q} placeholder="Search" className="h-8 w-44 rounded-md border border-border bg-panel px-2 text-[13px]" />
            <button className="h-8 rounded-md border border-border px-3 text-[13px] hover:bg-hover">Filter</button>
          </form>
        </div>
        <p className="mb-2 text-[12.5px] text-muted">{n.toLocaleString("en-IN")} articles</p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[13.5px]">
            <tbody>
              {rows.map((a) => {
                const s = a.sourceId ? srcById.get(a.sourceId) : undefined;
                return (
                  <tr key={a.id} className={`border-t border-border first:border-t-0 ${a.hidden ? "opacity-60" : ""}`}>
                    <td className="w-[92px] p-2">
                      <div className="aspect-[16/9] w-[84px] overflow-hidden rounded bg-sunken">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {a.imageUrl && <img src={a.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                      </div>
                    </td>
                    <td className="p-2">
                      <a href={a.url} target="_blank" className="font-medium hover:underline">{a.title}</a>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: s?.color ?? "#999" }} />{s?.shortName ?? a.publication}
                        </span>
                        <span>{a.publishedAt ? formatDate(a.publishedAt.toISOString()) : "no date"}</span>
                        {a.byline === "unverified" && <span className="text-warn">byline not found</span>}
                        {a.pinned && <span className="text-accent">★ featured</span>}
                      </div>
                    </td>
                    <td className="p-2"><TopicSelect id={a.id} value={a.topic} /></td>
                    <td className="whitespace-nowrap p-2 text-right text-[13px]">
                      <div className="flex justify-end gap-3">
                        {a.byline === "unverified" && a.hidden ? (
                          <form action={approveArticle.bind(null, a.id)}><button className="text-ok hover:underline">Approve</button></form>
                        ) : (
                          <form action={setHidden.bind(null, a.id, !a.hidden)}><button className="hover:underline">{a.hidden ? "Show" : "Hide"}</button></form>
                        )}
                        <form action={setPinned.bind(null, a.id, !a.pinned)}><button className="hover:underline">{a.pinned ? "Unfeature" : "Feature"}</button></form>
                        <DeleteButton id={a.id} title={a.title} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td className="p-6 text-center text-muted">Nothing here.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-[13px]">
            {page > 1 && <Link href={href({ p: String(page - 1) })} className="text-accent hover:underline">← Newer</Link>}
            <span className="text-muted">Page {page} of {pages}</span>
            {page < pages && <Link href={href({ p: String(page + 1) })} className="text-accent hover:underline">Older →</Link>}
          </div>
        )}
      </section>
    </div>
  );
}
