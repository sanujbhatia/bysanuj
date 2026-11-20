// Creates (or updates) the admin login, the profile row and the default author pages.
// Runs on every deploy and never deletes anything.
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { DEFAULT_SOURCES } from "../src/lib/defaults";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Sanuj";
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  if (email && password) {
    if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (user) {
      await db.update(schema.users).set({ passwordHash, name }).where(eq(schema.users.id, user.id));
      console.log(`Seed: updated password for ${email}`);
    } else {
      await db.insert(schema.users).values({ email, name, passwordHash });
      console.log(`Seed: created admin ${email}`);
    }
  } else {
    const anyUser = await db.query.users.findFirst({ columns: { id: true } });
    if (!anyUser) {
      await client.end();
      throw new Error("No admin account yet: set ADMIN_EMAIL and ADMIN_PASSWORD and redeploy.");
    }
  }

  await db.insert(schema.profile).values({ id: 1 }).onConflictDoNothing();

  const existing = await db.select({ id: schema.sources.id }).from(schema.sources).limit(1);
  if (existing.length === 0) {
    await db.insert(schema.sources).values(DEFAULT_SOURCES.map((s, i) => ({ ...s, sortOrder: i })));
    console.log(`Seed: added ${DEFAULT_SOURCES.length} author pages`);
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
