const DEFAULT_GRACE_MS = 60_000;

export function shouldDropForOrder(
  currentLastSeenAt: string | null | undefined,
  incomingOccurredAt: string,
  graceMs = DEFAULT_GRACE_MS
): boolean {
  if (!currentLastSeenAt) return false;
  const current = new Date(currentLastSeenAt).getTime();
  const incoming = new Date(incomingOccurredAt).getTime();
  return incoming < current - graceMs;
}
