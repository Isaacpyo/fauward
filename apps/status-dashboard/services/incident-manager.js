import { randomUUID } from 'crypto';
import { THRESHOLDS } from './registry.js';

const incidents          = new Map(); // id → incident
const auditLog           = new Map(); // id → [{ts, action, by, note}]
const consecutiveFailures = new Map(); // `${serviceId}:${env}` → count

export function getIncidents() {
  return Array.from(incidents.values())
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map(i => ({ ...i, audit: auditLog.get(i.id) ?? [] }));
}

export function getOpenIncidents() {
  return getIncidents().filter(i => i.status !== 'resolved');
}

export function getIncidentAudit(id) {
  return auditLog.get(id) ?? null;
}

function addAudit(id, action, by = 'system', note = null) {
  if (!auditLog.has(id)) auditLog.set(id, []);
  auditLog.get(id).push({ ts: new Date().toISOString(), action, by, note });
}

export function processServiceResult(service, env, status, error) {
  const key      = `${service.id}:${env}`;
  const isDown   = status === 'down';
  const isDeg    = status === 'degraded';

  if (isDown || isDeg) {
    const count = (consecutiveFailures.get(key) ?? 0) + 1;
    consecutiveFailures.set(key, count);

    const shouldIncident =
      count >= THRESHOLDS.downAfterFailedChecks &&
      ['critical', 'high'].includes(service.criticality);

    if (shouldIncident && !findOpenIncident(service.id, env)) {
      const severity = isDown
        ? (service.criticality === 'critical' ? 'critical' : 'high')
        : 'medium';
      createIncident({
        serviceId:         service.id,
        serviceName:       service.name,
        environment:       env,
        severity,
        title:             isDown
          ? `${service.name} is DOWN (${env})`
          : `${service.name} is DEGRADED (${env})`,
        message:           error ?? `Service ${status} for ${count} consecutive checks`,
        affectedWorkflows: service.affectedWorkflows ?? [],
      });
    }
  } else {
    consecutiveFailures.set(key, 0);
    const existing = findOpenIncident(service.id, env);
    if (existing) resolveIncident(existing.id);
  }
}

function findOpenIncident(serviceId, env) {
  return Array.from(incidents.values()).find(
    i => i.serviceId === serviceId && i.environment === env && i.status !== 'resolved'
  );
}

function createIncident(data) {
  const id = randomUUID();
  const incident = {
    id,
    serviceId:        data.serviceId,
    serviceName:      data.serviceName,
    environment:      data.environment,
    title:            data.title,
    severity:         data.severity,
    status:           'open',
    startedAt:        new Date().toISOString(),
    resolvedAt:       null,
    acknowledgedBy:   null,
    message:          data.message,
    affectedWorkflows: data.affectedWorkflows,
    resolutionNotes:  null,
  };
  incidents.set(id, incident);
  addAudit(id, 'created', 'system', data.message);
  console.log(`[INCIDENT] Created: ${incident.title}`);
  return incident;
}

function resolveIncident(id) {
  const inc = incidents.get(id);
  if (!inc) return;
  inc.status     = 'resolved';
  inc.resolvedAt = new Date().toISOString();
  addAudit(id, 'resolved', 'system', 'Service recovered');
  console.log(`[INCIDENT] Resolved: ${inc.title}`);
}

export function acknowledgeIncident(id, acknowledgedBy = 'ops', note = null) {
  const inc = incidents.get(id);
  if (!inc || inc.status === 'resolved') return false;
  inc.status         = 'acknowledged';
  inc.acknowledgedBy = acknowledgedBy;
  addAudit(id, 'acknowledged', acknowledgedBy, note);
  return true;
}
