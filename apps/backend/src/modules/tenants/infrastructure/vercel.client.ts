import { URL } from 'node:url';
import { config } from '../../../config/index.js';

export type VercelVerificationChallenge = {
  type: string;
  domain: string;
  value: string;
  reason: string;
};

export type VercelProjectDomain = {
  name: string;
  apexName?: string;
  projectId?: string;
  verified: boolean;
  verification?: VercelVerificationChallenge[];
  redirect?: string | null;
  redirectStatusCode?: number | null;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
  updatedAt?: number;
  createdAt?: number;
};

export type VercelDomainConfig = {
  configuredBy: 'A' | 'CNAME' | 'http' | 'dns-01' | null;
  acceptedChallenges?: string[];
  recommendedCNAME?: Array<{ rank: number; value: string }>;
  recommendedIPv4?: Array<{ rank: number; value: string[] }>;
  misconfigured?: boolean;
};

export class VercelDomainAlreadyTakenError extends Error {}

export class VercelApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}

export type VercelClientOptions = {
  apiBase: string;
  apiToken: string;
  portalProjectId: string;
  teamId?: string;
};

function defaultOptions(): VercelClientOptions {
  return {
    apiBase: config.vercel.apiBase,
    apiToken: config.vercel.apiToken,
    portalProjectId: config.vercel.portalProjectId,
    teamId: config.vercel.teamId
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorFields(body: unknown) {
  const error = isObject(body) && isObject(body.error) ? body.error : {};
  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    message: typeof error.message === 'string' ? error.message : undefined
  };
}

function isDomainConflict(status: number, code?: string, message?: string) {
  return (
    status === 409 ||
    code === 'domain_already_in_use' ||
    code === 'domain_already_exists' ||
    (status === 400 && /already (exists|in use)/i.test(message ?? ''))
  );
}

export class VercelClient {
  private readonly options: VercelClientOptions;

  constructor(options: VercelClientOptions = defaultOptions()) {
    this.options = options;
  }

  private url(path: string, query: Record<string, string | undefined> = {}) {
    const url = new URL(`${this.options.apiBase.replace(/\/$/, '')}${path}`);
    if (this.options.teamId) url.searchParams.set('teamId', this.options.teamId);
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
    return url;
  }

  private async req<T>(
    path: string,
    init: RequestInit = {},
    query: Record<string, string | undefined> = {}
  ): Promise<T> {
    const response = await fetch(this.url(path, query), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.options.apiToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const { code, message } = errorFields(body);
      if (isDomainConflict(response.status, code, message)) {
        throw new VercelDomainAlreadyTakenError(message ?? 'Domain is already in use');
      }
      throw new VercelApiError(message ?? response.statusText, response.status, code);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  addDomain(domain: string) {
    return this.req<VercelProjectDomain>(
      `/v10/projects/${this.options.portalProjectId}/domains`,
      { method: 'POST', body: JSON.stringify({ name: domain }) }
    );
  }

  getDomain(domain: string) {
    return this.req<VercelProjectDomain>(
      `/v9/projects/${this.options.portalProjectId}/domains/${encodeURIComponent(domain)}`,
      { method: 'GET' }
    );
  }

  verifyDomain(domain: string) {
    return this.req<VercelProjectDomain>(
      `/v9/projects/${this.options.portalProjectId}/domains/${encodeURIComponent(domain)}/verify`,
      { method: 'POST' }
    );
  }

  getDomainConfig(domain: string) {
    return this.req<VercelDomainConfig>(
      `/v6/domains/${encodeURIComponent(domain)}/config`,
      { method: 'GET' },
      { projectIdOrName: this.options.portalProjectId }
    );
  }

  async removeDomain(domain: string) {
    try {
      await this.req<Record<string, never>>(
        `/v9/projects/${this.options.portalProjectId}/domains/${encodeURIComponent(domain)}`,
        { method: 'DELETE', body: JSON.stringify({ removeRedirects: true }) }
      );
    } catch (error) {
      if (error instanceof VercelApiError && error.status === 404) return;
      throw error;
    }
  }
}
