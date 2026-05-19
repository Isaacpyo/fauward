const {
  CF_API_TOKEN,
  CF_ACCOUNT_ID,
  CF_ADMIN_BREAK_GLASS_LIST_ID
} = process.env;

const missing = [
  ['CF_API_TOKEN', CF_API_TOKEN],
  ['CF_ACCOUNT_ID', CF_ACCOUNT_ID],
  ['CF_ADMIN_BREAK_GLASS_LIST_ID', CF_ADMIN_BREAK_GLASS_LIST_ID]
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.log(`Skipping Cloudflare break-glass pruning; missing ${missing.join(', ')}`);
  process.exit(0);
}

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/rules/lists/${CF_ADMIN_BREAK_GLASS_LIST_ID}/items`;

async function cloudflareFetch(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API request failed: ${response.status} ${JSON.stringify(body.errors ?? body)}`);
  }

  return body;
}

function expiryFromComment(comment) {
  if (typeof comment !== 'string') return null;
  const match = comment.match(/(?:^|\s)expires_at=([^\s]+)/i);
  if (!match) return null;

  const expiresAt = new Date(match[1]);
  return Number.isNaN(expiresAt.getTime()) ? null : expiresAt;
}

async function listBreakGlassItems() {
  const items = [];
  let cursor = null;

  do {
    const url = new URL(apiBase);
    if (cursor) url.searchParams.set('cursor', cursor);

    const body = await cloudflareFetch(url);
    items.push(...(body.result ?? []));
    cursor = body.result_info?.cursors?.after ?? null;
  } while (cursor);

  return items;
}

const now = new Date();
const items = await listBreakGlassItems();
const expiredItems = items.filter((item) => {
  const expiresAt = expiryFromComment(item.comment);
  return expiresAt !== null && expiresAt <= now;
});

if (expiredItems.length === 0) {
  console.log('No expired Cloudflare break-glass IP entries found.');
  process.exit(0);
}

await cloudflareFetch(apiBase, {
  method: 'DELETE',
  body: JSON.stringify({
    items: expiredItems.map((item) => ({ id: item.id }))
  })
});

console.log(`Requested deletion for ${expiredItems.length} expired Cloudflare break-glass IP entr${expiredItems.length === 1 ? 'y' : 'ies'}.`);
