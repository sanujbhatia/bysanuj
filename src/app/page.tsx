import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Search } from "lucide-react";
import { getPublicData, type PublicArticle } from "@/server/public";
import { TOPICS } from "@/lib/scrape";
import { formatDate } from "@/lib/format";

type Params = { pub?: string; topic?: string; q?: string; n?: string };
const PAGE = 30;

export default async function Portfolio({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const { profile, sources, articles, updatedAt } = await getPublicData();
  const name = profile?.name ?? "Sanuj Bhatia";
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const pubSource = sources.find((s) => s.shortName.toLowerCase() === sp.pub?.toLowerCase());
  const topic = TOPICS.find((t) => t.toLowerCase() === sp.topic?.toLowerCase());
  const q = (sp.q ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(sp.n) || PAGE, PAGE), 5000);

  const filtered = articles.filter(
    (a) =>
      (!pubSource || a.sourceId === pubSource.id) &&
      (!topic || a.topic === topic) &&
      (!q || a.title.toLowerCase().includes(q) || a.dek.toLowerCase().includes(q)),
  );
  const isFiltered = !!(pubSource || topic || q);
  const featured = isFiltered ? [] : articles.filter((a) => a.pinned).slice(0, 6);
  const shown = filtered.slice(0, limit);

  const countBySource = new Map<string, number>();
  articles.forEach((a) => a.sourceId && countBySource.set(a.sourceId, (countBySource.get(a.sourceId) ?? 0) + 1));
  const activeSources = sources.filter((s) => countBySource.get(s.id));
  const topicCounts = TOPICS.map((t) => [t, articles.filter((a) => a.topic === t).length] as const).filter(([, n]) => n);
  const years = articles.map((a) => a.publishedAt?.slice(0, 4)).filter(Boolean) as string[];
  const since = years.length ? years.reduce((m, y) => (y < m ? y : m)) : null;

  const href = (p: Partial<Params>) => {
    const next = { pub: sp.pub, topic: sp.topic, q: sp.q, ...p };
    const s = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && s.set(k, v));
    const str = s.toString();
    return str ? `/?${str}` : "/";
  };

  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-16 sm:px-8">
      {/* Profile */}
      <header className="flex flex-col gap-6 border-b border-border py-10 sm:flex-row sm:items-start sm:py-14">
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-24 w-24 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif text-3xl text-accent">
            {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[34px] leading-tight tracking-tight sm:text-[42px]">{name}</h1>
          <p className="mt-1 text-[17px] text-muted">{profile?.headline}</p>
          {profile?.bio && <p className="mt-4 max-w-[68ch] whitespace-pre-line text-[15.5px] leading-relaxed">{profile.bio}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-muted">
            {profile?.location && (
              <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{profile.location}</span>
            )}
            {profile?.email && (
              <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 hover:text-text"><Mail size={15} />{profile.email}</a>
            )}
            {profile?.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer me" className="inline-flex items-center gap-0.5 hover:text-text">
                {l.label}<ArrowUpRight size={14} />
              </a>
            ))}
          </div>
          <p className="mt-6 text-[14px] text-muted tabular">
            <strong className="font-semibold text-text">{articles.length.toLocaleString("en-IN")}</strong> articles across{" "}
            <strong className="font-semibold text-text">{activeSources.length}</strong> {activeSources.length === 1 ? "publication" : "publications"}{since ? ` since ${since}` : ""}
          </p>
          {activeSources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
              {activeSources.map((s) => (
                <Link key={s.id} href={href({ pub: s.shortName.toLowerCase(), n: undefined })} className="inline-flex items-center gap-1.5 hover:underline">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name} <span className="text-faint tabular">{countBySource.get(s.id)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="border-b border-border py-10">
          <h2 className="mb-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Featured work</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((a) => <Card key={a.id} a={a} src={a.sourceId ? srcById.get(a.sourceId) : undefined} large />)}
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-serif text-[26px] tracking-tight">
            {isFiltered ? `${filtered.length.toLocaleString("en-IN")} ${filtered.length === 1 ? "article" : "articles"}` : "All articles"}
          </h2>
          <form action="/" className="relative w-full lg:w-[300px]">
            {sp.pub && <input type="hidden" name="pub" value={sp.pub} />}
            {sp.topic && <input type="hidden" name="topic" value={sp.topic} />}
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              name="q" defaultValue={sp.q ?? ""} placeholder="Search headlines"
              className="h-10 w-full rounded-full border border-border bg-panel pl-9 pr-4 text-[14px] focus:border-accent focus:outline-none"
            />
          </form>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip href={href({ pub: undefined, n: undefined })} active={!pubSource}>All publications</Chip>
          {activeSources.map((s) => (
            <Chip key={s.id} href={href({ pub: s.shortName.toLowerCase(), n: undefined })} active={pubSource?.id === s.id} dot={s.color}>
              {s.name}
            </Chip>
          ))}
        </div>
        {topicCounts.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip href={href({ topic: undefined, n: undefined })} active={!topic} subtle>All topics</Chip>
            {topicCounts.map(([t]) => (
              <Chip key={t} href={href({ topic: t.toLowerCase(), n: undefined })} active={topic === t} subtle>{t}</Chip>
            ))}
          </div>
        )}
        {isFiltered && (
          <Link href="/" className="mt-3 inline-block text-[13px] text-accent hover:underline">Clear filters</Link>
        )}
      </section>

      {/* List */}
      {shown.length === 0 ? (
        <p className="py-16 text-center text-muted">
          {articles.length === 0 ? "Articles are being imported. Check back shortly." : "No articles match these filters."}
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-3">
          {shown.map((a) => <Card key={a.id} a={a} src={a.sourceId ? srcById.get(a.sourceId) : undefined} />)}
        </div>
      )}
      {filtered.length > shown.length && (
        <div className="mt-12 text-center">
          <Link href={href({ n: String(limit + PAGE) })} scroll={false}
            className="inline-flex h-10 items-center rounded-full border border-border-strong px-6 text-[14px] font-medium hover:bg-hover">
            Show more ({(filtered.length - shown.length).toLocaleString("en-IN")} left)
          </Link>
        </div>
      )}

      <footer className="mt-16 flex flex-wrap justify-between gap-2 border-t border-border pt-6 text-[13px] text-faint">
        <span>© {new Date().getFullYear()} {name}</span>
        {updatedAt && <span>Updated {formatDate(updatedAt)}</span>}
      </footer>
    </div>
  );
}

function Chip({ href, active, dot, subtle, children }: { href: string; active: boolean; dot?: string; subtle?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors " +
        (active
          ? "border-text bg-text text-bg"
          : subtle
            ? "border-transparent bg-sunken text-muted hover:text-text"
            : "border-border hover:border-border-strong hover:bg-hover")
      }
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
    </Link>
  );
}

function Card({ a, src, large }: { a: PublicArticle; src?: { name: string; color: string }; large?: boolean }) {
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer"
      className={`group flex ${large ? "flex-col" : "flex-row-reverse items-start gap-4 sm:flex-col sm:items-stretch sm:gap-0"}`}>
      <div className={`aspect-[16/9] shrink-0 overflow-hidden rounded-lg bg-sunken ${large ? "" : "w-[112px] sm:w-auto"}`}>
        {a.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
      <div className={`flex items-center gap-2 text-[12.5px] text-muted ${large ? "mt-3" : "sm:mt-3"}`}>
        <span className="inline-flex items-center gap-1.5 font-medium text-text">
          <span className="h-2 w-2 rounded-full" style={{ background: src?.color ?? "#9b9a96" }} />
          {src?.name ?? a.publication}
        </span>
        {a.publishedAt && <><span className="text-faint">·</span><time dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time></>}
      </div>
      <h3 className={`mt-1.5 font-serif leading-snug tracking-tight group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4 ${large ? "text-[21px]" : "text-[16.5px] sm:text-[18px]"}`}>
        {a.title}
      </h3>
      {a.dek && (
        <div className={large ? "" : "max-sm:hidden"}>
          <p className={`mt-1.5 text-[14px] leading-relaxed text-muted ${large ? "line-clamp-3" : "line-clamp-2"}`}>{a.dek}</p>
        </div>
      )}
      </div>
    </a>
  );
}
