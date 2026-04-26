import { NextResponse } from "next/server";

type RegisterPayload = {
  name?: string;
  email?: string;
  company?: string;
  plan?: "starter" | "pro" | "enterprise";
  password?: string;
  acceptedTerms?: boolean;
};

const planIds = new Set(["starter", "pro", "enterprise"]);

function isValidPayload(payload: RegisterPayload): boolean {
  return Boolean(
    payload.name &&
      payload.name.trim().length > 1 &&
      payload.company &&
      payload.company.trim().length > 1 &&
      payload.email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) &&
      payload.plan &&
      planIds.has(payload.plan) &&
      payload.password &&
      payload.password.length >= 8 &&
      payload.acceptedTerms
  );
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RegisterPayload | null;

  if (!payload || !isValidPayload(payload)) {
    return NextResponse.json({ message: "Please complete every required field." }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;

  if (backendUrl) {
    try {
      const response = await fetch(`${backendUrl.replace(/\/$/, "")}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: payload.company,
          region: "global",
          email: payload.email,
          plan: payload.plan,
          password: payload.password
        })
      });
      const result = (await response.json().catch(() => null)) as
        | {
            tenant?: { slug?: string };
            accessToken?: string;
            refreshToken?: string;
            user?: unknown;
            error?: string;
          }
        | null;

      if (!response.ok) {
        return NextResponse.json(
          { message: result?.error || "Unable to register at this time." },
          { status: response.status >= 400 ? response.status : 500 }
        );
      }

      const tenantSlug = result?.tenant?.slug;
      return NextResponse.json(
        {
          ok: true,
          tenantSlug,
          tenantUrl: tenantSlug ? `http://localhost:3000` : undefined,
          accessToken: result?.accessToken,
          refreshToken: result?.refreshToken
        },
        { status: 201 }
      );
    } catch {
      return NextResponse.json({ message: "Registration service unavailable." }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true, tenantUrl: "http://localhost:3000" }, { status: 201 });
}
