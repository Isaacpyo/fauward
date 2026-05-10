export function getCsrfToken(): string | null {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("fw_platform_csrf="));
  return match ? decodeURIComponent(match.slice("fw_platform_csrf=".length)) : null;
}

export function hasPlatformSessionHint(): boolean {
  return document.cookie.includes("fw_platform_csrf=");
}
