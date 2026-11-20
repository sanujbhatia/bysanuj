import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

/** Server-side gate for every admin page and action. */
export async function requireAdmin(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const u = await db.query.users.findFirst({ where: eq(users.id, id), columns: { id: true } });
  if (!u) redirect("/login");
  return id;
}
