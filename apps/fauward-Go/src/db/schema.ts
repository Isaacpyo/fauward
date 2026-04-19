export const dbTableNames = {
  jobs: "jobs",
  routes: "routes",
  stops: "stops",
  pendingMutations: "pendingMutations",
  podDrafts: "podDrafts",
  scanVerifications: "scanVerifications",
  locationPings: "locationPings",
} as const;

export const dbVersionOneSchema = {
  [dbTableNames.jobs]: "&id, shipmentId, routeId, stopId, status, priority, updatedAt",
  [dbTableNames.routes]: "&id, assignedAt, area",
  [dbTableNames.stops]: "&id, routeId, shipmentId, sequence, status, updatedAt",
  [dbTableNames.pendingMutations]: "&id, type, entityId, state, createdAt",
  [dbTableNames.podDrafts]: "&id, shipmentId, stopId, state, deliveredAt",
  [dbTableNames.scanVerifications]: "&id, shipmentId, stopId, target, synced, createdAt",
  [dbTableNames.locationPings]: "&id, createdAt, synced, stopId",
};

