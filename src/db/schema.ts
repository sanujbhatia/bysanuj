import {
  pgTable, uuid, text, timestamp, boolean, integer, index, uniqueIndex, jsonb,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt)]);

export type ProfileLink = { label: string; url: string };

/** Single-row table holding the public profile. */
export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default("Sanuj Bhatia"),
  headline: text("headline").notNull().default("Freelance tech journalist"),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  location: text("location").notNull().default(""),
  email: text("email").notNull().default(""),
  links: jsonb("links").$type<ProfileLink[]>().notNull().default([]),
  /** Lower-cased names the byline check accepts, e.g. ["sanuj bhatia"]. */
  authorNames: jsonb("author_names").$type<string[]>().notNull().default(["sanuj bhatia"]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const SOURCE_KINDS = ["future", "valnet", "aa", "generic"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  color: text("color").notNull().default("#6b7280"),
  authorUrl: text("author_url").notNull().unique(),
  kind: text("kind").$type<SourceKind>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Next archive page the backfill should read. Null once the backfill has finished. */
  backfillPage: integer("backfill_page").default(2),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
  /** Publication label, kept even if the source is removed. */
  publication: text("publication").notNull(),
  title: text("title").notNull(),
  dek: text("dek").notNull().default(""),
  imageUrl: text("image_url"),
  section: text("section"),
  topic: text("topic").notNull().default("Other"),
  /** True when the user changed the topic, so re-imports never overwrite it. */
  topicLocked: boolean("topic_locked").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  hidden: boolean("hidden").notNull().default(false),
  pinned: boolean("pinned").notNull().default(false),
  /** "verified" byline matched; "unverified" no byline found (hidden until reviewed); "manual" added by hand. */
  byline: text("byline").$type<"verified" | "unverified" | "manual">().notNull().default("verified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("articles_url_idx").on(t.url),
  index("articles_published_idx").on(t.publishedAt),
]);

/** URLs found on listing pages that still need their article page read. */
export const queue = pgTable("queue", {
  url: text("url").primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** URLs checked and found not to be by the author (sidebar links etc.), so they're never fetched again. */
export const rejected = pgTable("rejected", {
  url: text("url").primaryKey(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  added: integer("added").notNull().default(0),
  pagesRead: integer("pages_read").notNull().default(0),
  articlesRead: integer("articles_read").notNull().default(0),
  remaining: integer("remaining").notNull().default(0),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
});

export type Source = typeof sources.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Profile = typeof profile.$inferSelect;
