import { NextResponse } from "next/server";
import { runSync } from "@/server/sync";

// Runs every three days (see vercel.json). Each run checks page 1 of every author page,
// continues any unfinished archive backfill, and reads new article pages.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runSync({ trigger: "schedule", checkLatest: true, budgetMs: 52_000 });
  return NextResponse.json(result);
}
