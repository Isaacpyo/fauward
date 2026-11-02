import { VendorError, VendorNotConfiguredError, type VendorName } from './vendor-error.js';

// Shared HTTP plumbing for the REST-based adapters. Configuration comes from env vars only; a missing variable makes
// isConfigured() false and the calling service uses its native (vendor-free) path.

export type EnvSpec = { required: string[]; optional?: Record<string, string | undefined> };

export type VendorEnv = { configured: boolean; missing: string[]; values: Record<string, string | undefined> };

export function readVendorEnv(spec: EnvSpec, env: NodeJS.ProcessEnv = process.env): VendorEnv {
  const values: Record<string, string | undefined> = {};
  for (const name of spec.required) values[name] = env[name]?.trim() || undefined;
  for (const [name, fallback] of Object.entries(spec.optional ?? {})) values[name] = env[name]?.trim() || fallback;
  const missing = spec.required.filter((name) => !values[name]);
  return { configured: missing.length === 0, missing, values };
}

export function requireVendorEnv(vendor: VendorName, spec: EnvSpec): Record<string, string> {
  const env = readVendorEnv(spec);
  if (!env.configured) throw new VendorNotConfiguredError(vendor, env.missing);
  return env.values as Record<string, string>;
}

export type VendorRequest = { method?: string; headers?: Record<string, string>; body?: unknown; query?: Record<string, string | number | undefined>; timeoutMs?: number };

/** JSON request to a vendor; network errors, timeouts and non-2xx answers become VendorError (body not echoed). */
export async function vendorRequest<T>(vendor: VendorName, url: string, init: VendorRequest = {}): Promise<T> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(init.query ?? {})) if (value !== undefined) target.searchParams.set(key, String(value));
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers ?? {}) };
  if (init.body !== undefined && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(target, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 10_000)
    });
  } catch (error) {
    throw new VendorError(vendor, `${vendor} unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new VendorError(vendor, `${vendor} answered ${response.status}`, response.status);
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new VendorError(vendor, `${vendor} returned a body that is not JSON`, response.status);
  }
}
