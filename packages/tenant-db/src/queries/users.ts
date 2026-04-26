import crypto from "crypto";
import { getTenantDb, getSupabaseAdmin } from "../client.js";

export type TenantUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "member";
  status: string;
  invited_by: string | null;
  created_at: string;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: string;
  token_hash: string;
  expires_at: string;
  accepted: boolean;
  created_at: string;
};

export async function listTeamMembers(tenantSlug: string): Promise<TenantUser[]> {
  const db = getTenantDb(tenantSlug);
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("status", "active")
    .order("created_at");
  if (error) throw new Error(`listTeamMembers: ${error.message}`);
  return (data ?? []) as TenantUser[];
}

export async function getUserByEmail(
  tenantSlug: string,
  email: string,
): Promise<TenantUser | null> {
  const db = getTenantDb(tenantSlug);
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();
  if (error || !data) return null;
  return data as TenantUser;
}

export type InviteMemberInput = {
  email: string;
  role?: "admin" | "member";
  invitedBy?: string;
};

/**
 * Creates a pending invite row and returns the raw invite token.
 * Send this token by email to the invitee; they redeem it at /accept-invite?token=...
 */
export async function inviteMember(
  tenantSlug: string,
  input: InviteMemberInput,
): Promise<{ token: string; invite: TeamInvite }> {
  const db = getTenantDb(tenantSlug);
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const { data, error } = await db
    .from("team_invites")
    .insert({
      email: input.email.toLowerCase(),
      role: input.role ?? "member",
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`inviteMember: ${error?.message}`);
  return { token: rawToken, invite: data as TeamInvite };
}

export async function acceptInvite(
  tenantSlug: string,
  rawToken: string,
  authUserId: string,
  fullName?: string,
): Promise<TenantUser> {
  const db = getTenantDb(tenantSlug);
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const { data: invite, error: inviteErr } = await db
    .from("team_invites")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("accepted", false)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (inviteErr || !invite) throw new Error("Invalid or expired invite token");

  // Mark invite accepted
  await db.from("team_invites").update({ accepted: true }).eq("id", invite.id);

  // Create user in tenant schema
  const { data: user, error: userErr } = await db
    .from("users")
    .insert({
      auth_user_id: authUserId,
      email: invite.email,
      full_name: fullName ?? null,
      role: invite.role,
    })
    .select()
    .single();

  if (userErr || !user) throw new Error(`acceptInvite: ${userErr?.message}`);

  // Also add to public.tenant_members
  const admin = getSupabaseAdmin();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", tenantSlug)
    .single();

  if (tenant) {
    await admin
      .from("tenant_members")
      .insert({ tenant_id: tenant.id, auth_user_id: authUserId, role: invite.role });
  }

  return user as TenantUser;
}
