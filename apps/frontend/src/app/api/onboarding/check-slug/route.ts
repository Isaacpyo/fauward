import { NextRequest, NextResponse } from "next/server";
import { isSlugAvailable } from "@fauward/tenant-db";

export const runtime = "nodejs";

const RESERVED = new Set([
  "www", "api", "admin", "widget", "app", "status", "docs", "mail",
  "fauward", "support", "help", "legal", "blog", "embed",
]);

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug);
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.toLowerCase();

  if (!slug) return NextResponse.json({ available: false, error: "Missing slug" }, { status: 400 });
  if (!isValidSlug(slug)) return NextResponse.json({ available: false, error: "Invalid slug format" });
  if (RESERVED.has(slug)) return NextResponse.json({ available: false, error: "Reserved slug" });

  const available = await isSlugAvailable(slug);
  return NextResponse.json({ available });
}
