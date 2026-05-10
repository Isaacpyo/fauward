export const hsLookupService = {
  async lookup(description: string) {
    const baseUrl = process.env.PYTHON_SERVICES_URL ?? 'http://localhost:8000';
    const query = new URLSearchParams({ description });
    const urls = [
      `${baseUrl.replace(/\/$/, '')}/api/customs/hs-lookup?${query.toString()}`,
      `${baseUrl.replace(/\/$/, '')}/customs/hs-lookup?${query.toString()}`
    ];

    let lastError: Error | null = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000)
        });
        if (response.status === 404) continue;
        if (!response.ok) throw new Error(`HS lookup failed with ${response.status}`);
        return response.json() as Promise<unknown>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('HS lookup failed');
      }
    }
    throw lastError ?? new Error('HS lookup failed');
  }
};
