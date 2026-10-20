import { NextRequest, NextResponse } from "next/server";

import { isPlatformHost, isPortalOwnedFauwardHost, isShipHost } from "./lib/hostRules";
import { normalizeHost, resolveTenantByHost } from "./lib/resolveTenantByHost";

export async function middleware(req: NextRequest) {
  const host = normalizeHost(req.headers.get("host"));

  // ship.fauward.com is a platform host whose slug comes from the PATH, not the host.
  // It must be matched before isPortalOwnedFauwardHost (which would 404 it as *.fauward.com).
  if (isShipHost(host)) {
    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return new NextResponse(null, { status: 404 });
    }
    const url = req.nextUrl.clone();
    url.pathname = `/ship/${segments.join("/")}`;
    return NextResponse.rewrite(url);
  }

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
