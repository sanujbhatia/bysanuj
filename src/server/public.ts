import "server-only";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { articles, profile, sources, syncRuns } from "@/db/schema";

export type PublicArticle = {
  id: string;
  url: string;
  title: string;
  dek: string;
  imageUrl: string | null;
  publication: string;
  sourceId: string | null;
  topic: string;
  publishedAt: string | null;
  pinned: boolean;
};

/**
 * Everything the public page needs, cached until an import or admin edit calls
 * revalidateTag("public"). Visitors never wake the database.
 */
export const getPublicData = unstable_cache(
  async () => {
    const [prof, srcs, rows, [lastRun]] = await Promise.all([
      db.query.profile.findFirst(),
      db.select().from(sources).orderBy(asc(sources.sortOrder)),
      db
        .select({
          id: articles.id,
          url: articles.url,
          title: articles.title,
          dek: articles.dek,
          imageUrl: articles.imageUrl,
          publication: articles.publication,
          sourceId: articles.sourceId,
          topic: articles.topic,
          publishedAt: articles.publishedAt,
          pinned: articles.pinned,
        })
        .from(articles)
        .where(eq(articles.hidden, false))
        .orderBy(sql`${articles.publishedAt} desc nulls last`, desc(articles.createdAt)),
      db
        .select({ at: syncRuns.finishedAt })
        .from(syncRuns)
        .where(isNotNull(syncRuns.finishedAt))
        .orderBy(desc(syncRuns.finishedAt))
        .limit(1),
    ]);
    return {
      profile: prof ?? null,
      sources: srcs.map((s) => ({ id: s.id, name: s.name, shortName: s.shortName, color: s.color, authorUrl: s.authorUrl })),
      articles: rows.map((r) => ({ ...r, publishedAt: r.publishedAt?.toISOString() ?? null })) as PublicArticle[],
      updatedAt: lastRun?.at?.toISOString() ?? null,
    };
  },
  ["public-data-v1"],
  { tags: ["public"], revalidate: 60 * 60 * 24 },
);
