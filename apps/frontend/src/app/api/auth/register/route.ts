import { NextResponse } from "next/server";

type RegisterPayload = {
  name?: string;
  email?: string;
  company?: string;
  password?: string;
  acceptedTerms?: boolean;
};

function isValidPayload(payload: RegisterPayload): boolean {
  return Boolean(
    payload.name &&
      payload.name.trim().length > 1 &&
      payload.company &&
      payload.company.trim().length > 1 &&
      payload.email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) &&
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
      const response = await fetch(`${backendUrl.replace(/\/$/, "")}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return NextResponse.json(
          { message: body || "Unable to register at this time." },
          { status: response.status >= 400 ? response.status : 500 }
        );
      }
    } catch {
      return NextResponse.json({ message: "Registration service unavailable." }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
