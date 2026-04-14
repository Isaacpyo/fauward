export type AgentRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "TENANT_MANAGER"
  | "TENANT_FINANCE"
  | "TENANT_STAFF"
  | "TENANT_DRIVER"
  | "CUSTOMER_ADMIN"
  | "CUSTOMER_USER"
  | string;

export type AgentUser = {
  id: string;
  email: string;
  role: AgentRole;
  tenantId: string;
  tenantSlug: string;
};

export type AgentSession = {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string;
  tenantId: string;
  user: AgentUser;
};

type JwtPayload = {
  sub: string;
  email: string;
  role: AgentRole;
  tenantId: string;
  tenantSlug: string;
};

const SESSION_KEY = "fauward_agent_session";

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = normalized + (pad === 0 ? "" : "=".repeat(4 - pad));
  return atob(padded);
}

function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

export function buildSession(input: {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string;
  tenantId: string;
}): AgentSession | null {
  const payload = parseJwtPayload(input.accessToken);
  if (!payload?.sub || !payload.email || !payload.role || !payload.tenantId || !payload.tenantSlug) {
    return null;
  }

  return {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tenantSlug: input.tenantSlug,
    tenantId: input.tenantId,
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug
    }
  };
}

export function loadSession(): AgentSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentSession;
    if (!parsed?.accessToken || !parsed.refreshToken || !parsed.tenantSlug || !parsed.tenantId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AgentSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function isAgentRoleAllowed(role: AgentRole): boolean {
  return ["TENANT_DRIVER", "TENANT_STAFF", "TENANT_MANAGER", "TENANT_ADMIN"].includes(role);
}