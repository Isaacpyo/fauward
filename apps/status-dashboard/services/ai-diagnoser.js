/**
 * Multi-provider AI diagnostic engine.
 * Supports Kimi (Moonshot) and DeepSeek — both use the OpenAI-compatible API.
 * Streams responses token-by-token via SSE.
 */

const PROVIDERS = {
  kimi: {
    name:    'Kimi',
    apiKey:  process.env.MOONSHOT_API_KEY  ?? '',
    baseUrl: process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1',
    model:   'moonshot-v1-8k',
    icon:    '🤖',
  },
  deepseek: {
    name:    'DeepSeek',
    apiKey:  process.env.DEEPSEEK_API_KEY  ?? '',
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    model:   process.env.DEEPSEEK_MODEL    ?? 'deepseek-chat',
    icon:    '🧠',
  },
};

export function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, p]) => Boolean(p.apiKey))
    .map(([id, p]) => ({ id, name: p.name, icon: p.icon, model: p.model }));
}

export function isAvailable() {
  return getAvailableProviders().length > 0;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(svc, env, envState, depStates, queues) {
  const history  = (envState.history ?? []).slice(0, 15).reverse().map(h => h ? '✓' : '✗').join(' ');
  const depLines = depStates.length
    ? depStates.map(d => `  ${d.name}: ${d.status}${d.error ? ` — ${d.error}` : ''}`).join('\n')
    : '  (none)';

  const queueLines = queues?.length
    ? queues.slice(0, 5).map(q =>
        `  ${q.name}: depth=${q.depth ?? '?'} failed=${q.failed ?? '?'} workers=${q.workerCount ?? '?'}${q.oldestJobAgeSecs ? ` oldest=${q.oldestJobAgeSecs}s` : ''}`
      ).join('\n')
    : '';

  return `You are a senior DevOps/SRE engineer for Fauward — a multi-tenant logistics SaaS (Node.js / Fastify / PostgreSQL / Redis / BullMQ / Supabase, deployed on Railway + Vercel).

A service is ${envState.status === 'degraded' ? 'DEGRADED' : 'DOWN'}. Analyse and give a concise recovery plan.

─── SERVICE ─────────────────────────────────────────────
Name:          ${svc.name}
Type:          ${svc.type} / ${svc.category}
Criticality:   ${svc.criticality}
Environment:   ${env}
Status:        ${envState.status?.toUpperCase()}
Error:         ${envState.error ?? 'none'}
HTTP status:   ${envState.httpStatus ?? 'n/a'}
Response time: ${envState.responseTime ?? 0}ms
Last checked:  ${envState.lastChecked ?? 'unknown'}
${envState.degradedReason ? `Degraded via:  ${envState.degradedReason}` : ''}

─── DEPENDENCIES ────────────────────────────────────────
${depLines}

─── AFFECTED WORKFLOWS ──────────────────────────────────
${(svc.affectedWorkflows ?? []).join(', ') || 'unknown'}

─── CHECK HISTORY (last 15, newest first) ───────────────
${history || 'no history yet'}
${queueLines ? `\n─── QUEUE SNAPSHOT ──────────────────────────────────────\n${queueLines}` : ''}

─── FIX COMMAND ─────────────────────────────────────────
${svc.fix ?? 'none configured'}
─────────────────────────────────────────────────────────

Reply with exactly these three headings (markdown):

### Root Cause
One or two sentences on what most likely went wrong.

### Fix Steps
Numbered list of specific, actionable steps. Include exact terminal commands in backticks where relevant.

### Verify
How to confirm the service is healthy again.

Be brief and technical. No preamble.`;
}

// ── Streaming ─────────────────────────────────────────────────────────────────

export async function streamDiagnosis({ svc, env, envState, depStates, queues, provider = 'kimi', res }) {
  const p = PROVIDERS[provider] ?? PROVIDERS.kimi;

  if (!p.apiKey) {
    res.write(`data: ${JSON.stringify({ error: `${p.name} API key not set — add ${provider === 'kimi' ? 'MOONSHOT_API_KEY' : 'DEEPSEEK_API_KEY'} to .env.local` })}\n\n`);
    res.end();
    return;
  }

  const prompt = buildPrompt(svc, env, envState, depStates, queues);

  let aiRes;
  try {
    aiRes = await fetch(`${p.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify({
        model:       p.model,
        temperature: 0.2,
        max_tokens:  800,
        stream:      true,
        messages: [
          { role: 'system', content: 'You are a senior DevOps/SRE engineer. Be concise, specific, and technical.' },
          { role: 'user',   content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: `${p.name} unreachable: ${err.message}` })}\n\n`);
    res.end();
    return;
  }

  if (!aiRes.ok) {
    const text = await aiRes.text().catch(() => '');
    res.write(`data: ${JSON.stringify({ error: `${p.name} error ${aiRes.status}: ${text.slice(0, 200)}` })}\n\n`);
    res.end();
    return;
  }

  const reader = aiRes.body.getReader();
  const dec    = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = dec.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') { res.write('data: [DONE]\n\n'); break; }
        try {
          const json  = JSON.parse(raw);
          const token = json.choices?.[0]?.delta?.content ?? '';
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
        } catch { /* skip malformed lines */ }
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}
