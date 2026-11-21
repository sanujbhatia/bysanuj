# bysanuj

A self-hosted, Authory-style portfolio: it collects every article Sanuj Bhatia publishes across his author pages and shows them on one public page.

- **Public page (`/`).** Profile header, up to six featured articles, then every article with publication and topic filters, headline search and "Show more".
- **Admin (`/admin`, login required).** Covers author pages and sync status, article moderation (hide, feature, change topic, delete, add by link) and the profile editor.
- **Importer.** Runs every 3 days on Vercel Cron (08:00 IST). There's also a **Sync now** button in the admin.

## How importing works

1. **Latest.** Reads page 1 of every enabled author page and queues any article links it hasn't seen.
2. **Backfill.** Walks older archive pages (`/page/2`, `/page/3`, …) until it reaches the end. Sidebar links repeat on every page, so a page with nothing new beyond the page-1 links counts as the end. **Re-scan archive** restarts it.
3. **Article pages.** Each queued link is opened once to read the headline, dek, lead image, publish date and section from the page's meta tags / JSON-LD. The **byline is checked**:
   - your name → imported and public
   - someone else → remembered as rejected and never fetched again (this filters sidebar links)
   - no byline found → imported but **hidden** under *Articles → Needs review*

**RSS feeds.** If an author page has a feed URL set (Edit → RSS feed URL), the importer reads the feed instead of scraping. Feed items already include the headline, date, image and byline, so no article pages are opened. Android Authority uses this because it blocks Vercel's servers from its HTML pages. If a site blocks the feed too, Edit → "Paste the feed" lets you paste the feed XML from your own browser.

Each pass is time-boxed (about 50 s) to fit Vercel's free plan. Sync now repeats passes until everything is done. Only links and metadata are stored; images are hotlinked from the publications, so Vercel image quotas aren't used.

Site families (`kind`):

| kind | Sites | Listing |
|---|---|---|
| `future` | Android Central, Tom's Guide, TechRadar | `.listingResult a.article-link`, `/page/N` |
| `valnet` | Android Police, Pocket-lint | one-segment slugs, `/page/N/` |
| `aa` | Android Authority, SoundGuys | URLs ending in a numeric ID (also found inside JSON on JS-rendered pages) |
| `generic` | anything else | any same-site link with a long slug |

The public page reads from a cache (`unstable_cache`, tag `public`) that is cleared whenever an import adds articles or you edit something in the admin, so visitors don't wake the database.

## Deploy (Vercel + Neon)

1. Import `sanujbhatia/bysanuj` into Vercel. Don't deploy yet.
2. **Storage → Create → Neon** and connect it to the project. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Add these environment variables:
   - `AUTH_SECRET`: a long random string (`openssl rand -base64 33`)
   - `AUTH_TRUST_HOST`: `true`
   - `CRON_SECRET`: another long random string. Vercel sends it to the cron job automatically.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (10+ characters), `ADMIN_NAME`
4. Deploy. Every deploy runs migrations and the seed. The seed creates your login, the profile and the six default author pages, and is safe to repeat.
5. Go to `/login`, sign in, open **Profile** to fill in your bio, photo and links, then press **Sync now** on the Overview page and leave it open until it says Done.

## Local development

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL etc.
npm run db:migrate && npm run db:seed
npm run dev
npm test                 # parser + topic tests
```

Schema changes: edit `src/db/schema.ts`, then run `npm run db:generate` and `npm run db:migrate`.
