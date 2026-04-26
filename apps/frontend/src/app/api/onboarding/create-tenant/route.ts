import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createTenant, createTenantSchema, isSlugAvailable, createApiKey } from "@fauward/tenant-db";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const companyName = form.get("companyName") as string;
  const slug = (form.get("slug") as string)?.toLowerCase();
  const plan = (form.get("plan") as string) ?? "starter";
  const primaryColor = (form.get("primaryColor") as string) ?? "#2563eb";
  const logoFile = form.get("logo") as File | null;

  // Validate inputs
  if (!email || !password || !companyName || !slug) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const available = await isSlugAvailable(slug);
  if (!available) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const admin = getSupabaseAdmin();

  // 1. Create Supabase Auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: companyName },
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? "Failed to create user" }, { status: 400 });
  }

  const authUserId = authData.user.id;

  // 2. Handle logo upload (if provided)
  let logoUrl: string | null = null;
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split(".").pop() ?? "png";
    const path = `tenant-logos/${slug}.${ext}`;
    const { error: uploadErr } = await admin.storage
      .from("brand-assets")
      .upload(path, await logoFile.arrayBuffer(), { contentType: logoFile.type, upsert: true });
    if (!uploadErr) {
      const { data: urlData } = admin.storage.from("brand-assets").getPublicUrl(path);
      logoUrl = urlData.publicUrl;
    }
  }

  // 3. Create tenant row + branding + owner membership in public schema
  const tenant = await createTenant({
    slug,
    name: companyName,
    plan,
    branding: { primary_color: primaryColor, logo_url: logoUrl },
    ownerAuthUserId: authUserId,
  });

  // 4. Provision per-tenant Postgres schema
  await createTenantSchema(slug);

  // 5. Generate first API key for embed.js
  const { rawKey } = await createApiKey(tenant.id, "Default embed key");

  const tenantUrl = `https://${slug}.fauward.com`;

  return NextResponse.json({
    success: true,
    tenantUrl,
    tenantId: tenant.id,
    embedApiKey: rawKey, // shown once in the welcome email / dashboard
  });
}
