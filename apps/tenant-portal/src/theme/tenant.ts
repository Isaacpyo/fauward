import type { TenantConfig } from "@/types/domain";

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  const parsed = Number.parseInt(value, 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function clamp(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)));
}

function darken(hex: string, factor = 0.1): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clamp(r * (1 - factor))} ${clamp(g * (1 - factor))} ${clamp(b * (1 - factor))})`;
}

function lightenedRgba(hex: string, opacity = 0.16): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${opacity})`;
}

export function applyTenantConfig(config: TenantConfig): void {
  const root = document.documentElement;

  root.style.setProperty("--tenant-primary", config.primary_color);
  root.style.setProperty("--tenant-primary-hover", darken(config.primary_color, 0.1));
  root.style.setProperty("--tenant-primary-light", lightenedRgba(config.primary_color, 0.18));
  root.style.setProperty("--tenant-accent", config.accent_color);
  root.style.setProperty("--tenant-logo", config.logo_url ? `url(${config.logo_url})` : "none");

  root.dir = config.rtl ? "rtl" : "ltr";
  root.lang = config.locale || "en";
}
