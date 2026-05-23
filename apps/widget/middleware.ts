import { NextRequest, NextResponse } from "next/server";

import { isPlatformHost, isPortalOwnedFauwardHost } from "./lib/hostRules";
import { normalizeHost, resolveTenantByHost } from "./lib/resolveTenantByHost";

export async function middleware(req: NextRequest) {
  const host = normalizeHost(req.headers.get("host"));

  if (isPlatformHost(host)) {
    return NextResponse.next();
  }

  if (isPortalOwnedFauwardHost(host)) {
    return new NextResponse(null, { status: 404 });
  }

  const tenantSlug = await resolveTenantByHost(host);
  if (!tenantSlug) {
    return new NextResponse(null, { status: 404 });
  }

  const url = req.nextUrl.clone();
  url.pathname = `/ship/${tenantSlug}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
