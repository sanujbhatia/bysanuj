"use server";
import { eq, gte, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { articles, profile, queue, rejected, sources, SOURCE_KINDS } from "@/db/schema";
import { requireAdmin } from "@/server/session";
import { runSync, fetchHtml, importFeedXml, type SyncResult } from "@/server/sync";
import { bylineMatch, classifyTopic, extractArticle, normalizeUrl, TOPICS } from "@/lib/scrape";
import { signOut } from "@/auth";

function refresh() {
  revalidateTag("public");
  revalidatePath("/admin", "layout");
}

export async function syncStep(first: boolean): Promise<SyncResult> {
  await requireAdmin();
  const r = await runSync({ trigger: "manual", checkLatest: first, budgetMs: 50_000 });
  revalidateTag("public");
  return r;
}

export async function retryFailed() {
  await requireAdmin();
  await db.update(queue).set({ attempts: 0 }).where(gte(queue.attempts, 1));
  refresh();
}

const sourceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(6),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  authorUrl: z.string().trim().url().max(300),
  feedUrl: z.union([z.literal(""), z.string().trim().url().max(300)]).optional(),
  kind: z.enum(SOURCE_KINDS),
});

export async function saveSource(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = sourceSchema.parse(Object.fromEntries(formData));
  const data = { ...parsed, feedUrl: parsed.feedUrl || null };
  if (id) {
    const before = await db.query.sources.findFirst({ where: eq(sources.id, id) });
    await db
      .update(sources)
      .set({
        ...data,
        // A new author URL means starting the archive again.
        ...(before && before.authorUrl !== data.authorUrl ? { backfillPage: 2, lastStatus: null, lastError: null } : {}),
      })
      .where(eq(sources.id, id));
    await db.update(articles).set({ publication: data.name }).where(eq(articles.sourceId, id));
  } else {
    const all = await db.select({ id: sources.id }).from(sources);
    await db.insert(sources).values({ ...data, sortOrder: all.length });
  }
  refresh();
}

/** Fallback for sites that block Vercel: paste the feed's XML (opened in your own browser). */
export async function importPastedFeed(_: unknown, formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const xml = String(formData.get("xml") ?? "");
  const src = await db.query.sources.findFirst({ where: eq(sources.id, id) });
  if (!src) return { ok: false, message: "Unknown author page." };
  if (!/<(rss|feed)[\s>]/i.test(xml)) return { ok: false, message: "That doesn't look like feed XML." };
  const prof = await db.query.profile.findFirst();
  const r = await importFeedXml(src, xml, prof?.authorNames ?? ["sanuj bhatia"]);
  refresh();
  return { ok: r.items > 0, message: r.items ? `Read ${r.items} items, added ${r.added} new.` : "No articles found in that XML." };
}

export async function toggleSource(id: string, enabled: boolean) {
  await requireAdmin();
  await db.update(sources).set({ enabled }).where(eq(sources.id, id));
  refresh();
}

export async function restartBackfill(id: string) {
  await requireAdmin();
  await db.update(sources).set({ backfillPage: 2 }).where(eq(sources.id, id));
  refresh();
}

export async function deleteSource(id: string) {
  await requireAdmin();
  // Articles stay (their publication name is kept); only the author page is removed.
  await db.delete(sources).where(eq(sources.id, id));
  refresh();
}

export async function setHidden(id: string, hidden: boolean) {
  await requireAdmin();
  await db.update(articles).set({ hidden, updatedAt: new Date() }).where(eq(articles.id, id));
  refresh();
}

export async function setPinned(id: string, pinned: boolean) {
  await requireAdmin();
  await db.update(articles).set({ pinned, updatedAt: new Date() }).where(eq(articles.id, id));
  refresh();
}

export async function setTopic(id: string, topic: string) {
  await requireAdmin();
  const t = z.enum(TOPICS).parse(topic);
  await db.update(articles).set({ topic: t, topicLocked: true, updatedAt: new Date() }).where(eq(articles.id, id));
  refresh();
}

export async function approveArticle(id: string) {
  await requireAdmin();
  await db.update(articles).set({ byline: "manual", hidden: false, updatedAt: new Date() }).where(eq(articles.id, id));
  refresh();
}

/** Deletes an article and remembers its URL so the importer never brings it back. */
export async function deleteArticles(ids: string[]) {
  await requireAdmin();
  if (!ids.length) return;
  const rows = await db.select({ url: articles.url }).from(articles).where(inArray(articles.id, ids));
  if (rows.length) await db.insert(rejected).values(rows.map((r) => ({ url: r.url, reason: "deleted by you" }))).onConflictDoNothing();
  await db.delete(articles).where(inArray(articles.id, ids));
  refresh();
}

export async function addByUrl(_: unknown, formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const raw = String(formData.get("url") ?? "");
  const url = normalizeUrl(raw);
  if (!url) return { ok: false, message: "That doesn't look like a link." };
  const existing = await db.query.articles.findFirst({ where: eq(articles.url, url) });
  if (existing) return { ok: false, message: "That article is already in your portfolio." };
  try {
    const { html, finalUrl } = await fetchHtml(url);
    const m = extractArticle(html, finalUrl);
    if (!m.title) return { ok: false, message: "Couldn't read a headline from that page." };
    const host = new URL(url).hostname.replace(/^www\./, "");
    const all = await db.select().from(sources);
    const src = all.find((s) => new URL(s.authorUrl).hostname.replace(/^www\./, "") === host);
    const prof = await db.query.profile.findFirst();
    const match = bylineMatch(m.authors, prof?.authorNames ?? ["sanuj bhatia"]);
    await db.insert(articles).values({
      url,
      sourceId: src?.id ?? null,
      publication: src?.name ?? String(formData.get("publication") || host),
      title: m.title,
      dek: m.dek ?? "",
      imageUrl: m.imageUrl,
      section: m.section,
      topic: classifyTopic(m.title, m.section, new URL(url).pathname),
      publishedAt: m.publishedAt,
      byline: "manual",
    }).onConflictDoNothing();
    await db.delete(rejected).where(eq(rejected.url, url));
    refresh();
    return {
      ok: true,
      message: `Added "${m.title}".${match === "other" ? " Note: the page's byline doesn't name you." : ""}`,
    };
  } catch (e) {
    return { ok: false, message: `Couldn't load that page (${e instanceof Error ? e.message : e}).` };
  }
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  headline: z.string().trim().max(160),
  bio: z.string().trim().max(2000),
  avatarUrl: z.union([z.literal(""), z.string().trim().url().max(500)]),
  location: z.string().trim().max(80),
  email: z.union([z.literal(""), z.string().trim().email().max(200)]),
  links: z.string().max(3000),
  authorNames: z.string().max(500),
});

export async function saveProfile(_: unknown, formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const d = parsed.data;
  const links = d.links
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter(([label, url]) => label && url && /^https?:\/\//.test(url))
    .map(([label, url]) => ({ label, url }));
  const authorNames = d.authorNames.split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
  const values = { ...d, links, authorNames: authorNames.length ? authorNames : ["sanuj bhatia"], updatedAt: new Date() };
  await db.insert(profile).values({ id: 1, ...values }).onConflictDoUpdate({ target: profile.id, set: values });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
