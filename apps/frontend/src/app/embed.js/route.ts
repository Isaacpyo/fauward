/**
 * GET /embed.js
 * Serves the compiled widget SDK script from packages/widget-sdk/dist/embed.js.
 * In production this file is built by `npm run build --workspace=packages/widget-sdk`.
 */

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const revalidate = 3600; // CDN cache 1 hour

export async function GET() {
  try {
    const distPath = join(process.cwd(), "../../packages/widget-sdk/dist/embed.js");
    const js = readFileSync(distPath, "utf-8");
    return new NextResponse(js, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("// Fauward embed.js not built yet. Run: npm run build --workspace=packages/widget-sdk\n", {
      status: 503,
      headers: { "Content-Type": "application/javascript" },
    });
  }
}
