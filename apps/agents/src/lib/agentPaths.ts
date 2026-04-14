export const AGENT_BASE = "/";

export function agentPath(path = ""): string {
  if (!path) return AGENT_BASE;
  const base = AGENT_BASE.endsWith("/") ? AGENT_BASE.slice(0, -1) : AGENT_BASE;
  return `${base}/${path.replace(/^\/+/, "")}`;
}