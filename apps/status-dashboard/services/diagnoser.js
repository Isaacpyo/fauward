/**
 * Rule-based diagnosis engine.
 * Takes a service definition + environment state and returns a structured
 * diagnosis with likely cause and ordered recovery steps.
 */

function parseErrorType(error, httpStatus) {
  if (!error && !httpStatus) return 'unknown';
  if (error?.includes('Connection refused'))  return 'connection-refused';
  if (error?.includes('Timed out'))           return 'timeout';
  if (error?.includes('Host not found'))      return 'dns-failure';
  if (error?.includes('Connection reset'))    return 'connection-reset';
  if (httpStatus === 401)                     return 'http-401';
  if (httpStatus === 403)                     return 'http-403';
  if (httpStatus === 404)                     return 'http-404';
  if (httpStatus >= 500)                      return 'http-5xx';
  if (httpStatus >= 400)                      return 'http-4xx';
  return 'unknown';
}

const CAUSES = {
  'connection-refused': 'Service process is not running or the port is blocked.',
  'timeout':            'Service is not responding — it may be overloaded, crashed, or unreachable.',
  'dns-failure':        'Hostname cannot be resolved. DNS issue or wrong URL.',
  'connection-reset':   'Connection was dropped. Possible firewall rule, TLS mismatch, or crashed process.',
  'http-401':           'Service is UP and responding — authentication is required. This is likely a monitoring config issue, not a real outage.',
  'http-403':           'Service is UP but access is forbidden. Check IP allowlist or API key configuration.',
  'http-404':           'Service is UP but the health path returned 404. The URL or health endpoint path may be wrong.',
  'http-5xx':           'Service is running but returning server errors. Check application logs for unhandled exceptions.',
  'http-4xx':           'Service responded with a client error. Check the URL and expected status code.',
  'unknown':            'Status is unknown — check network connectivity and service logs.',
};

function getSteps(svc, env, errorType, httpStatus) {
  const isLocal  = env === 'local';
  const envCfg   = svc.environments?.[env];
  const fixCmd   = svc.fix;

  switch (errorType) {
    case 'connection-refused':
      if (isLocal) {
        return [
          fixCmd ? `Run: \`${fixCmd}\`` : 'Start the service',
          'Confirm Docker is running: `docker ps`',
          svc.type === 'tcp' ? `Verify port ${envCfg?.port ?? '?'} is open: \`netstat -an | grep ${envCfg?.port ?? '?'}\`` : 'Check another process is not already on this port',
          'Check the service logs for startup errors',
        ];
      }
      return [
        'Open the Railway/Vercel dashboard and check deployment status',
        'Review the most recent deploy logs for build or startup errors',
        'Verify environment variables are set (DATABASE_URL, REDIS_URL etc.)',
        'Check if the service was paused or suspended in the dashboard',
      ];

    case 'timeout':
      return [
        'Check service CPU/memory — it may be overwhelmed',
        'Look for long-running queries or jobs blocking the process',
        'Review error logs for stack traces',
        fixCmd && isLocal ? `Restart: \`${fixCmd}\`` : 'Restart the service from the dashboard',
        'If recurring, consider scaling up or adding a circuit breaker',
      ];

    case 'dns-failure':
      return [
        'Verify the URL in the service registry is correct',
        'Check DNS propagation if the domain was recently changed',
        'Try `nslookup <hostname>` from the server to confirm DNS resolution',
      ];

    case 'http-401':
      return [
        '✓ The service IS running — 401 means it responded successfully',
        'This is a monitoring configuration issue, not a real outage',
        `Fix: set \`expectedStatus: 401\` in registry.js for ${svc.name}`,
        'No action needed on the service itself',
      ];

    case 'http-403':
      return [
        'Service is running but blocking access',
        'Check IP allowlist rules — your monitoring server IP may be blocked',
        'Verify the monitoring API key or credentials are valid',
      ];

    case 'http-404':
      return [
        'Service is running but the health endpoint path is wrong',
        `Check \`healthPaths.health\` in registry.js for ${svc.name}`,
        'Try the base URL directly in a browser to confirm the service is up',
        'Common paths: /health, /live, /ready, /status, /ping',
      ];

    case 'http-5xx':
      return [
        'Check service error logs immediately — look for exceptions or panics',
        'Review recent deployments — a bad deploy often causes 5xx',
        'Check database/Redis connectivity (dependencies may be the root cause)',
        fixCmd && isLocal ? `Restart: \`${fixCmd}\`` : 'Roll back the last deploy if errors started after it',
        'Monitor error rate — if intermittent it may be an overload issue',
      ];

    default:
      return [
        'Check service logs for error output',
        'Verify the service URL and port are correct in the registry',
        'Test connectivity manually: `curl -I <url>`',
        fixCmd && isLocal ? `Restart: \`${fixCmd}\`` : 'Restart the service and monitor',
      ];
  }
}

export function diagnose(svc, env, envState) {
  if (!envState?.configured) {
    if (svc.id === 'supabase' && env === 'local') {
      return {
        status:      'unconfigured',
        likelyCause: 'Local Supabase REST monitoring is disabled. Fauward local development uses Docker Postgres on localhost:5432, not the Supabase CLI API on localhost:54321.',
        steps:       [
          'No action is needed for normal Fauward local development.',
          'Use the Postgres card to monitor the local database on localhost:5432.',
          'Only enable this check if you run the Supabase CLI stack with `supabase start`.',
          'To enable it, set `SUPABASE_LOCAL_ENABLED=true` and `SUPABASE_LOCAL_URL=http://localhost:54321` in `apps/status-dashboard/.env.local`.',
        ],
        isRealOutage: false,
      };
    }

    return {
      status:      'unconfigured',
      likelyCause: 'No URL or host configured for this environment.',
      steps:       [`Add a ${env} environment config to services/registry.js for ${svc.name}`],
      isRealOutage: false,
    };
  }

  if (envState.status === 'up') {
    return {
      status:      'up',
      likelyCause: 'Service is healthy.',
      steps:       [],
      isRealOutage: false,
    };
  }

  const errorType  = parseErrorType(envState.error, envState.httpStatus);
  const isRealOutage = !['http-401', 'http-403'].includes(errorType);

  return {
    status:        envState.status,
    error:         envState.error,
    httpStatus:    envState.httpStatus,
    responseTime:  envState.responseTime,
    errorType,
    likelyCause:   CAUSES[errorType] ?? CAUSES.unknown,
    steps:         getSteps(svc, env, errorType, envState.httpStatus),
    degradedReason: envState.degradedReason ?? null,
    isRealOutage,
    checkedAt:     envState.lastChecked,
  };
}
