// Pure parsing helpers for author listing pages and article pages. No network or DB here,
// so everything is unit-tested in tests/scrape.test.ts.
import { parse, type HTMLElement } from "node-html-parser";
import type { SourceKind } from "@/db/schema";

const EXCLUDED_SEGMENTS = new Set([
  "author", "authors", "tag", "tags", "page", "archive", "feed", "feeds", "search", "about",
  "contact", "privacy", "terms", "category", "topic", "topics", "newsletter", "deals", "coupons",
  "wp-content", "wp-json", "amp", "video", "videos", "podcast", "jobs",
]);

/** Normalises an article URL so the same piece is never stored twice. */
export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.hostname !== "localhost") u.protocol = "https:"; // localhost: test fixtures only
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Absolute https URL, keeping the query string (image CDNs need it). */
export function absUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

const sameSite =(a: string, b: string) =>
  a.replace(/^www\./, "") === b.replace(/^www\./, "");

const hyphens = (s: string) => (s.match(/-/g) ?? []).length;

/** Does this URL look like an article (rather than a category, author or utility page)? */
export function looksLikeArticle(url: string, kind: SourceKind, authorUrl: string): boolean {
  let u: URL, a: URL;
  try {
    u = new URL(url);
    a = new URL(authorUrl);
  } catch {
    return false;
  }
  if (!sameSite(u.hostname, a.hostname)) return false;
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length === 0) return false;
  if (segs.some((s) => EXCLUDED_SEGMENTS.has(s.toLowerCase()))) return false;
  if (/\.(jpe?g|png|gif|webp|svg|css|js|xml|json|pdf)$/i.test(u.pathname)) return false;
  const last = segs[segs.length - 1];

  switch (kind) {
    case "aa":
      // Android Authority / SoundGuys: /some-headline-slug-3612345/
      return /-\d{5,}$/.test(last);
    case "valnet":
      // Android Police / Pocket-lint: /some-headline-slug/
      return segs.length === 1 && hyphens(last) >= 3;
    case "future":
      // Android Central / Tom's Guide / TechRadar: /section/sub/some-headline-slug
      return segs.length >= 2 && (hyphens(last) >= 3 || last.length >= 28);
    default:
      return hyphens(last) >= 3;
  }
}

/** Selectors for each site family's main article list, most specific first. */
const LIST_SELECTORS: Record<SourceKind, string[]> = {
  future: [".listingResult a.article-link", "a.article-link", ".listingResults a"],
  valnet: [".display-card-title a", ".listing-content a", "article a"],
  aa: [],
  generic: ["article a", "main a"],
};

/**
 * Finds candidate article URLs on an author listing page.
 * Tries the site's own listing markup first, then falls back to every link (and, for sites that
 * render with JavaScript, every same-site URL in the page source). The byline check on each
 * article page removes anything that isn't by the author.
 */
export function extractListing(html: string, pageUrl: string, kind: SourceKind, authorUrl: string): string[] {
  const root = parse(html);
  const out = new Set<string>();
  const add = (href: string | undefined) => {
    if (!href) return;
    const n = normalizeUrl(href, pageUrl);
    if (n && looksLikeArticle(n, kind, authorUrl)) out.add(n);
  };

  for (const sel of LIST_SELECTORS[kind]) {
    root.querySelectorAll(sel).forEach((el) => add(el.getAttribute("href")));
    if (out.size > 0) return [...out];
  }

  root.querySelectorAll("a[href]").forEach((el) => add(el.getAttribute("href")));
  if (kind === "aa" || out.size === 0) {
    // JS-rendered pages keep their article list in a JSON blob; pull URLs out of the raw source.
    const host = new URL(authorUrl).hostname.replace(/^www\./, "").replace(/\./g, "\\.");
    const re = new RegExp(`https?:(?:\\\\?/){2}(?:www\\.)?${host}(?:\\\\?/[A-Za-z0-9._~%-]+)+\\\\?/?`, "g");
    for (const m of html.matchAll(re)) add(m[0].replace(/\\\//g, "/"));
  }
  return [...out];
}

/** URL of page `n` (n ≥ 2) of an author archive. */
export function listingPageUrl(authorUrl: string, kind: SourceKind, n: number): string {
  if (n <= 1) return authorUrl;
  const base = authorUrl.replace(/\/+$/, "");
  return kind === "future" ? `${base}/page/${n}` : `${base}/page/${n}/`;
}

export type ArticleMeta = {
  title: string | null;
  dek: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  section: string | null;
  authors: string[];
  canonical: string | null;
};

function meta(root: HTMLElement, ...keys: string[]): string | null {
  for (const k of keys) {
    const el =
      root.querySelector(`meta[property="${k}"]`) ??
      root.querySelector(`meta[name="${k}"]`) ??
      root.querySelector(`meta[itemprop="${k}"]`);
    const v = el?.getAttribute("content")?.trim();
    if (v) return decodeEntities(v);
  }
  return null;
}

function metaAll(root: HTMLElement, ...keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    root.querySelectorAll(`meta[property="${k}"], meta[name="${k}"]`).forEach((el) => {
      const v = el.getAttribute("content")?.trim();
      if (v) out.push(decodeEntities(v));
    });
  }
  return out;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

type Json = Record<string, unknown>;
const ARTICLE_TYPES = /article|posting|review|report/i;

function jsonLdArticles(root: HTMLElement): Json[] {
  const out: Json[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Json;
    const t = o["@type"];
    const types = Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
    if (types.some((x) => ARTICLE_TYPES.test(x))) out.push(o);
    if (o["@graph"]) visit(o["@graph"]);
  };
  root.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      visit(JSON.parse(s.textContent));
    } catch {
      /* ignore malformed blocks */
    }
  });
  return out;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function names(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(names);
  if (typeof v === "object") {
    const o = v as Json;
    return [str(o.name), str(o.url), str(o["@id"])].filter((x): x is string => !!x);
  }
  return [];
}

function image(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return image(v[0]);
  if (typeof v === "object") return str((v as Json).url) ?? str((v as Json).contentUrl);
  return null;
}

function date(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Strips a trailing " | Site name" from titles. */
export function cleanTitle(t: string): string {
  return t
    .replace(/\s+[|–—-]\s+(android central|android police|android authority|tom'?s guide|techradar|soundguys|pocket-lint|engadget)[^|]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractArticle(html: string, pageUrl: string): ArticleMeta {
  const root = parse(html);
  const ld = jsonLdArticles(root);
  const first = <T>(f: (o: Json) => T | null): T | null => {
    for (const o of ld) {
      const v = f(o);
      if (v) return v;
    }
    return null;
  };

  const title =
    first((o) => str(o.headline)) ??
    meta(root, "og:title", "twitter:title") ??
    root.querySelector("h1")?.textContent.trim() ??
    root.querySelector("title")?.textContent.trim() ??
    null;

  const dek =
    meta(root, "og:description", "description", "twitter:description") ?? first((o) => str(o.description));

  const imageUrl = meta(root, "og:image", "og:image:url", "twitter:image") ?? first((o) => image(o.image));

  const publishedAt =
    date(meta(root, "article:published_time", "datePublished", "pubdate", "parsely-pub-date", "sailthru.date")) ??
    date(first((o) => str(o.datePublished))) ??
    date(root.querySelector("time[datetime]")?.getAttribute("datetime"));

  const section =
    meta(root, "article:section", "parsely-section") ??
    first((o) => (Array.isArray(o.articleSection) ? str(o.articleSection[0]) : str(o.articleSection)));

  const authors = [
    ...metaAll(root, "author", "article:author", "parsely-author", "sailthru.author", "twitter:data1"),
    ...ld.flatMap((o) => names(o.author)),
    ...root.querySelectorAll('a[rel="author"]').map((a) => a.textContent.trim() + " " + (a.getAttribute("href") ?? "")),
  ].filter(Boolean);

  const canonicalHref = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? meta(root, "og:url");
  const canonical = canonicalHref ? normalizeUrl(canonicalHref, pageUrl) : null;

  return {
    title: title ? cleanTitle(decodeEntities(title)) : null,
    dek: dek ? decodeEntities(dek).replace(/\s+/g, " ").trim() : null,
    imageUrl: imageUrl ? absUrl(imageUrl, pageUrl) : null,
    publishedAt,
    section,
    authors,
    canonical,
  };
}

/**
 * "verified": a byline names the author. "other": bylines exist but name someone else.
 * "unknown": the page has no byline information at all.
 */
export function bylineMatch(authors: string[], authorNames: string[]): "verified" | "other" | "unknown" {
  if (authors.length === 0) return "unknown";
  const wanted = authorNames.map((n) => n.toLowerCase().trim()).filter(Boolean);
  const slugs = wanted.map((n) => n.replace(/\s+/g, "-"));
  const compact = wanted.map((n) => n.replace(/\s+/g, ""));
  for (const a of authors) {
    const s = a.toLowerCase();
    if (wanted.some((n) => s.includes(n)) || slugs.some((n) => s.includes(n)) || compact.some((n) => s.includes(n)))
      return "verified";
  }
  return "other";
}

export const TOPICS = ["Phones", "Wearables", "Audio", "Tablets & PCs", "Software & AI", "Other"] as const;
export type Topic = (typeof TOPICS)[number];

const TOPIC_RULES: [Topic, RegExp][] = [
  ["Wearables", /\b(wearables?|smart ?watch(es)?|watch(es)?|wear ?os|fitbit|whoop|oura|smart ?rings?|garmin|fitness|trackers?|smart ?glasses|glasses|xr|ray-?bans?|headsets?|vision pro)\b/],
  ["Audio", /\b(audio|earbuds?|headphones?|airpods|buds\d*|speakers?|sennheiser|soundbars?|anc|noise[- ]cancell?ing)\b/],
  ["Tablets & PCs", /\b(tablets?|ipads?|matepad|laptops?|chromebooks?|macbooks?|galaxy tab|computing|pcs?|monitors?)\b/],
  ["Phones", /\b(phones?|smartphones?|pixel|galaxy [sazf]\d*|iphones?|razr|oneplus|xiaomi|oppo|vivo|motorola|moto|nothing phone|foldables?|fold\d*|flip\d*|honor|huawei|tecno|realme|camera)\b/],
  ["Software & AI", /\b(android \d+|one ?ui|gemini|ai|apps?|software|play store|updates?|assistant|widgets?|chrome|google)\b/],
];

export function classifyTopic(...parts: (string | null | undefined)[]): Topic {
  const text = parts.filter(Boolean).join(" ").toLowerCase().replace(/[/_]/g, " ");
  for (const [topic, re] of TOPIC_RULES) if (re.test(text)) return topic;
  return "Other";
}
