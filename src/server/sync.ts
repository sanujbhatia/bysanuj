import "server-only";
import { and, asc, count, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { articles, profile, queue, rejected, sources, syncRuns, type Source } from "@/db/schema";
import { bylineMatch, classifyTopic, extractArticle, extractListing, listingPageUrl, parseFeed } from "@/lib/scrape";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_ATTEMPTS = 3;
const MAX_BACKFILL_PAGES = 150;
const CONCURRENCY = 4;

export class FetchError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export async function fetchHtml(url: string, accept = "text/html,application/xhtml+xml"): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: accept,
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new FetchError(`HTTP ${res.status}`, res.status);
  return { html: await res.text(), finalUrl: res.url || url };
}

async function knownUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const [a, r, q] = await Promise.all([
    db.select({ url: articles.url }).from(articles).where(inArray(articles.url, urls)),
    db.select({ url: rejected.url }).from(rejected).where(inArray(rejected.url, urls)),
    db.select({ url: queue.url }).from(queue).where(inArray(queue.url, urls)),
  ]);
  return new Set([...a, ...r, ...q].map((x) => x.url));
}

/** Adds unseen URLs to the queue and returns how many were new. */
async function enqueue(source: Source, urls: string[]): Promise<number> {
  const known = await knownUrls(urls);
  const fresh = urls.filter((u) => !known.has(u));
  if (fresh.length) {
    await db.insert(queue).values(fresh.map((url) => ({ url, sourceId: source.id }))).onConflictDoNothing();
  }
  return fresh.length;
}

async function readListing(source: Source, page: number) {
  const url = listingPageUrl(source.authorUrl, source.kind, page);
  const { html, finalUrl } = await fetchHtml(url);
  const redirectedAway = page > 1 && finalUrl.replace(/\/+$/, "") !== url.replace(/\/+$/, "");
  return { urls: redirectedAway ? [] : extractListing(html, finalUrl, source.kind, source.authorUrl) };
}

/**
 * Adds articles from an RSS feed's XML. Feed items already carry the headline, date, image and
 * byline, so no article pages need to be opened. Returns how many were new.
 */
export async function importFeedXml(source: Source, xml: string, authorNames: string[]): Promise<{ items: number; added: number }> {
  const items = parseFeed(xml, source.feedUrl ?? source.authorUrl);
  if (items.length === 0) return { items: 0, added: 0 };
  const known = await knownUrls(items.map((i) => i.url));
  let added = 0;
  for (const it of items) {
    if (known.has(it.url)) continue;
    const match = it.authors.length ? bylineMatch(it.authors, authorNames) : "verified"; // author feeds only list the author's work
    if (match === "other") {
      await db.insert(rejected).values({ url: it.url, reason: "different byline" }).onConflictDoNothing();
      continue;
    }
    const inserted = await db
      .insert(articles)
      .values({
        url: it.url,
        sourceId: source.id,
        publication: source.name,
        title: it.title,
        dek: it.dek,
        imageUrl: it.imageUrl,
        section: it.section,
        topic: classifyTopic(it.title, it.section, new URL(it.url).pathname),
        publishedAt: it.publishedAt,
        byline: "verified",
      })
      .onConflictDoNothing()
      .returning({ id: articles.id });
    if (inserted.length) added++;
  }
  return { items: items.length, added };
}

type Ctx = { deadline: number; errors: string[]; pagesRead: number; articlesRead: number; added: number };
const timeLeft = (c: Ctx) => c.deadline - Date.now();

/** Reads page 1 of every enabled author page (or its feed) and queues anything new. */
async function checkLatest(ctx: Ctx, list: Source[], authorNames: string[]) {
  await Promise.all(
    list.map(async (s) => {
      if (s.feedUrl) {
        try {
          const { html: xml } = await fetchHtml(s.feedUrl, "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8");
          ctx.pagesRead++;
          const r = await importFeedXml(s, xml, authorNames);
          ctx.added += r.added;
          await db
            .update(sources)
            .set({
              lastCheckedAt: new Date(),
              backfillPage: null,
              lastStatus: r.items ? `ok · feed, ${r.items} items, ${r.added} new` : "feed had no items",
              lastError: r.items ? null : "The feed loaded but had no articles in it.",
            })
            .where(eq(sources.id, s.id));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx.errors.push(`${s.shortName} feed: ${msg}`);
          await db
            .update(sources)
            .set({ lastCheckedAt: new Date(), lastStatus: "error", lastError: `Feed: ${msg}` })
            .where(eq(sources.id, s.id));
        }
        return;
      }
      try {
        const { urls } = await readListing(s, 1);
        ctx.pagesRead++;
        const fresh = await enqueue(s, urls);
        await db
          .update(sources)
          .set({
            lastCheckedAt: new Date(),
            lastStatus: urls.length ? `ok · ${urls.length} links, ${fresh} new` : "no articles found on page",
            lastError: urls.length ? null : "The author page loaded but no article links were found.",
          })
          .where(eq(sources.id, s.id));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ctx.errors.push(`${s.shortName}: ${msg}`);
        await db
          .update(sources)
          .set({ lastCheckedAt: new Date(), lastStatus: "error", lastError: msg })
          .where(eq(sources.id, s.id));
      }
    }),
  );
}

/** Walks older archive pages, a page at a time, until the time budget is used. */
async function backfill(ctx: Ctx, list: Source[], budgetEnd: number) {
  for (const s of list) {
    // Skip sites whose author page couldn't be read just now; they'll be retried next run.
    if (s.backfillPage == null || s.feedUrl || s.lastStatus === "error") continue;
    let page = s.backfillPage;
    let firstPage: Set<string> | null = null;
    while (Date.now() < budgetEnd) {
      try {
        firstPage ??= new Set((await readListing(s, 1)).urls);
        const { urls } = await readListing(s, page);
        ctx.pagesRead++;
        // Sidebars repeat on every page; an archive page with nothing beyond them is past the end.
        const own = urls.filter((u) => !firstPage!.has(u));
        if (own.length === 0 || page >= MAX_BACKFILL_PAGES) {
          page = -1;
          break;
        }
        await enqueue(s, own);
        page++;
      } catch (e) {
        if (e instanceof FetchError && (e.status === 404 || e.status === 410)) {
          page = -1;
        } else {
          ctx.errors.push(`${s.shortName} archive page ${page}: ${e instanceof Error ? e.message : e}`);
        }
        break;
      }
    }
    await db
      .update(sources)
      .set({ backfillPage: page === -1 ? null : page })
      .where(eq(sources.id, s.id));
    if (Date.now() >= budgetEnd) break;
  }
}

async function processOne(ctx: Ctx, item: typeof queue.$inferSelect, srcById: Map<string, Source>, authorNames: string[]) {
  const src = srcById.get(item.sourceId);
  try {
    const { html, finalUrl } = await fetchHtml(item.url);
    ctx.articlesRead++;
    const m = extractArticle(html, finalUrl);
    const match = bylineMatch(m.authors, authorNames);
    if (match === "other" || !m.title) {
      await db.insert(rejected).values({ url: item.url, reason: m.title ? "different byline" : "no title" }).onConflictDoNothing();
    } else {
      const sameHost = m.canonical && new URL(m.canonical).hostname === new URL(item.url).hostname;
      const url = sameHost ? m.canonical! : item.url;
      const inserted = await db
        .insert(articles)
        .values({
          url,
          sourceId: item.sourceId,
          publication: src?.name ?? new URL(url).hostname,
          title: m.title,
          dek: m.dek ?? "",
          imageUrl: m.imageUrl,
          section: m.section,
          topic: classifyTopic(m.title, m.section, new URL(url).pathname),
          publishedAt: m.publishedAt,
          byline: match === "verified" ? "verified" : "unverified",
          hidden: match !== "verified",
        })
        .onConflictDoNothing()
        .returning({ id: articles.id });
      if (inserted.length) ctx.added++;
    }
    await db.delete(queue).where(eq(queue.url, item.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof FetchError && (e.status === 404 || e.status === 410)) {
      await db.insert(rejected).values({ url: item.url, reason: msg }).onConflictDoNothing();
      await db.delete(queue).where(eq(queue.url, item.url));
      return;
    }
    await db
      .update(queue)
      .set({ attempts: sql`${queue.attempts} + 1`, lastError: msg })
      .where(eq(queue.url, item.url));
  }
}

async function drainQueue(ctx: Ctx, srcById: Map<string, Source>, authorNames: string[]) {
  while (timeLeft(ctx) > 14_000) {
    const batch = await db
      .select()
      .from(queue)
      .where(lt(queue.attempts, MAX_ATTEMPTS))
      .orderBy(asc(queue.attempts), asc(queue.createdAt))
      .limit(CONCURRENCY * 2);
    if (batch.length === 0) return;
    for (let i = 0; i < batch.length && timeLeft(ctx) > 14_000; i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map((it) => processOne(ctx, it, srcById, authorNames)));
    }
  }
}

export async function pendingWork() {
  const [[q], [b]] = await Promise.all([
    db.select({ n: count() }).from(queue).where(lt(queue.attempts, MAX_ATTEMPTS)),
    db.select({ n: count() }).from(sources).where(and(eq(sources.enabled, true), isNotNull(sources.backfillPage), isNull(sources.feedUrl))),
  ]);
  return { queued: q.n, backfilling: b.n };
}

export type SyncResult = {
  added: number;
  pagesRead: number;
  articlesRead: number;
  queued: number;
  backfilling: number;
  done: boolean;
  errors: string[];
};

/**
 * One time-boxed pass of the importer. `checkLatest` reads page 1 of every author page; later
 * passes (the admin "Sync now" loop, or the next scheduled run) carry on with the archive
 * backfill and the queue of article pages to read.
 */
export async function runSync(opts: { trigger: string; checkLatest: boolean; budgetMs: number }): Promise<SyncResult> {
  const started = Date.now();
  const ctx: Ctx = { deadline: started + opts.budgetMs, errors: [], pagesRead: 0, articlesRead: 0, added: 0 };
  const [run] = await db.insert(syncRuns).values({ trigger: opts.trigger }).returning({ id: syncRuns.id });

  const all = await db.select().from(sources).where(eq(sources.enabled, true)).orderBy(asc(sources.sortOrder));
  const srcById = new Map(all.map((s) => [s.id, s]));
  const prof = await db.query.profile.findFirst();
  const authorNames = prof?.authorNames?.length ? prof.authorNames : ["sanuj bhatia"];

  if (opts.checkLatest) await checkLatest(ctx, all, authorNames);
  // Give the archive at most a third of the remaining time so new articles keep flowing in.
  const fresh = await db.select().from(sources).where(eq(sources.enabled, true)).orderBy(asc(sources.sortOrder));
  await backfill(ctx, fresh, Date.now() + Math.max(0, timeLeft(ctx) - 14_000) / 3);
  await drainQueue(ctx, srcById, authorNames);

  const left = await pendingWork();
  await db
    .update(syncRuns)
    .set({
      finishedAt: new Date(),
      added: ctx.added,
      pagesRead: ctx.pagesRead,
      articlesRead: ctx.articlesRead,
      remaining: left.queued,
      errors: ctx.errors.slice(0, 20),
    })
    .where(eq(syncRuns.id, run.id));
  if (ctx.added > 0) revalidateTag("public");

  return {
    added: ctx.added,
    pagesRead: ctx.pagesRead,
    articlesRead: ctx.articlesRead,
    ...left,
    done: left.queued === 0 && left.backfilling === 0,
    errors: ctx.errors,
  };
}
