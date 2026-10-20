import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';

// Releases page (WP-4.1): GitHub releases when GITHUB_TOKEN + GITHUB_REPOSITORY are set; otherwise the page shows the
// backend /version and the console build info.

const SPEC = { required: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'], optional: { GITHUB_API_BASE_URL: 'https://api.github.com' } };

export type GithubRelease = { id: number; tagName: string; name: string | null; publishedAt: string | null; url: string; draft: boolean; prerelease: boolean; body: string | null };

type RawRelease = { id: number; tag_name: string; name: string | null; published_at: string | null; html_url: string; draft: boolean; prerelease: boolean; body: string | null };

export const githubAdapter = {
  vendor: 'github' as const,
  envNames: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,

  async listReleases(limit = 20): Promise<GithubRelease[]> {
    const values = requireVendorEnv('github', SPEC);
    const rows = await vendorRequest<RawRelease[]>('github', `${values.GITHUB_API_BASE_URL}/repos/${values.GITHUB_REPOSITORY}/releases`, {
      headers: { Authorization: `Bearer ${values.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' },
      query: { per_page: limit }
    });
    return rows.map((row) => ({ id: row.id, tagName: row.tag_name, name: row.name, publishedAt: row.published_at, url: row.html_url, draft: row.draft, prerelease: row.prerelease, body: row.body }));
  }
};
