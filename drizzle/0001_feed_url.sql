ALTER TABLE "sources" ADD COLUMN "feed_url" text;--> statement-breakpoint
UPDATE "sources" SET "feed_url" = 'https://www.androidauthority.com/author/sanujbhatia/feed/', "last_status" = NULL, "last_error" = NULL WHERE "author_url" = 'https://www.androidauthority.com/author/sanujbhatia/' AND "feed_url" IS NULL;
