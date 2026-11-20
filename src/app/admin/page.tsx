import { count, desc, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, queue, sources, syncRuns } from "@/db/schema";
import { SyncButton } from "@/components/admin-client";
import { deleteSource, restartBackfill, retryFailed, saveSource, toggleSource } from "@/actions/admin";
import { KIND_LABELS } from "@/lib/defaults";
import { SOURCE_KINDS, type Source } from "@/db/schema";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d) : "never";

export default async function AdminHome() {
  const [srcs, perSource, [totals], [failed], [queued], runs] = await Promise.all([
    db.select().from(sources).orderBy(sources.sortOrder),
    db.select({ id: articles.sourceId, n: count() }).from(articles).groupBy(articles.sourceId),
    db.select({
      all: count(),
      hidden: sql<number>`count(*) filter (where ${articles.hidden})::int`,
      review: sql<number>`count(*) filter (where ${articles.byline} = 'unverified' and ${articles.hidden})::int`,
    }).from(articles),
    db.select({ n: count() }).from(queue).where(gte(queue.attempts, 3)),
    db.select({ n: count() }).from(queue).where(sql`${queue.attempts} < 3`),
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(8),
  ]);
  const counts = new Map(perSource.map((p) => [p.id, p.n]));

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Articles" value={totals.all} />
        <Stat label="Public" value={totals.all - totals.hidden} />
        <Stat label="Need review" value={totals.review} hint="No byline found; hidden until you approve" />
        <Stat label="Waiting to import" value={queued.n} />
      </section>

      <section>
        <h2 className="mb-1 text-[16px] font-semibold">Sync</h2>
        <p className="mb-3 text-[13.5px] text-muted">
          Runs automatically every 3 days at 8:00 IST. The first full import of your archive takes several passes; just
          leave this page open while it runs.
        </p>
        <SyncButton />
        {failed.n > 0 && (
          <form action={retryFailed} className="mt-3 text-[13px] text-warn">
            {failed.n} article page(s) failed to load three times.{" "}
            <button className="underline">Retry them</button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[16px] font-semibold">Author pages</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[13.5px]">
            <thead className="bg-sunken text-left text-[12px] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Publication</th>
                <th className="px-3 py-2 font-medium">Articles</th>
                <th className="px-3 py-2 font-medium">Last checked</th>
                <th className="px-3 py-2 font-medium">Archive</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {srcs.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      {s.name} {!s.enabled && <span className="rounded bg-sunken px-1.5 text-[11px] text-muted">paused</span>}
                    </div>
                    <a href={s.authorUrl} target="_blank" className="break-all text-[12px] text-faint hover:underline">{s.authorUrl}</a>
                  </td>
                  <td className="px-3 py-2.5 tabular">{counts.get(s.id) ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <div>{fmt(s.lastCheckedAt)}</div>
                    {s.lastStatus && <div className={`text-[12px] ${s.lastError ? "text-danger" : "text-faint"}`}>{s.lastError ?? s.lastStatus}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px]">
                    {s.backfillPage == null ? (
                      <span className="text-ok">Complete</span>
                    ) : (
                      <span className="text-muted">Next: page {s.backfillPage}</span>
                    )}
                    <form action={restartBackfill.bind(null, s.id)}>
                      <button className="text-[12px] text-faint hover:text-text hover:underline">Re-scan archive</button>
                    </form>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <details className="relative inline-block text-left">
                      <summary className="cursor-pointer list-none text-[13px] text-accent hover:underline">Edit</summary>
                      <div className="absolute right-0 z-10 mt-2 w-[340px] rounded-lg border border-border bg-panel p-3 shadow-lg">
                        <SourceForm s={s} />
                        <div className="mt-3 flex justify-between border-t border-border pt-3 text-[13px]">
                          <form action={toggleSource.bind(null, s.id, !s.enabled)}>
                            <button className="hover:underline">{s.enabled ? "Pause syncing" : "Resume syncing"}</button>
                          </form>
                          <form action={deleteSource.bind(null, s.id)}>
                            <button className="text-danger hover:underline">Remove page</button>
                          </form>
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-[13.5px] text-accent hover:underline">+ Add an author page</summary>
          <div className="mt-3 max-w-[360px] rounded-lg border border-border bg-panel p-3"><SourceForm /></div>
        </details>
      </section>

      <section>
        <h2 className="mb-3 text-[16px] font-semibold">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-[13.5px] text-muted">No runs yet. Press Sync now to import your articles.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {runs.map((r) => (
              <li key={r.id} className="text-muted">
                <span className="text-text">{fmt(r.startedAt)}</span> · {r.trigger === "schedule" ? "scheduled" : "manual"} · +{r.added} articles ·{" "}
                {r.pagesRead} pages, {r.articlesRead} article reads
                {r.errors.length > 0 && <span className="text-danger"> · {r.errors.join("; ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-3.5" title={hint}>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold tabular">{value.toLocaleString("en-IN")}</div>
    </div>
  );
}

function SourceForm({ s }: { s?: Source }) {
  const f = "h-8 w-full rounded-md border border-border bg-panel px-2 text-[13px] focus:border-accent focus:outline-none";
  return (
    <form action={saveSource} className="flex flex-col gap-2 text-[12.5px]">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid grid-cols-[1fr_70px_44px] gap-2">
        <input name="name" placeholder="Publication" defaultValue={s?.name} required className={f} />
        <input name="shortName" placeholder="AP" defaultValue={s?.shortName} required maxLength={6} className={f} />
        <input name="color" type="color" defaultValue={s?.color ?? "#6b7280"} className="h-8 w-full rounded-md border border-border bg-panel" />
      </div>
      <input name="authorUrl" type="url" placeholder="https://…/author/you/" defaultValue={s?.authorUrl} required className={f} />
      <select name="kind" defaultValue={s?.kind ?? "generic"} className={f}>
        {SOURCE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>
      <button className="h-8 rounded-md bg-accent text-[13px] font-medium text-accent-fg">{s ? "Save" : "Add page"}</button>
    </form>
  );
}
