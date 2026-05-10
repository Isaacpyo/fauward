export const TrackingSource = {
  TENANT_PORTAL: 'TENANT_PORTAL',
  SUPERADMIN: 'SUPERADMIN',
  FAUWARD_GO: 'FAUWARD_GO',
  CUSTOMER_PORTAL: 'CUSTOMER_PORTAL',
  CARRIER_WEBHOOK: 'CARRIER_WEBHOOK',
  API: 'API',
  SYSTEM_AUTOMATION: 'SYSTEM_AUTOMATION',
  AI_AGENT: 'AI_AGENT',
  QUEUE_WORKER: 'QUEUE_WORKER',
  MIGRATION: 'MIGRATION'
} as const;

export type TrackingSource = (typeof TrackingSource)[keyof typeof TrackingSource];

export const TrackingActorType = {
  TENANT_USER: 'TENANT_USER',
  PLATFORM_USER: 'PLATFORM_USER',
  CUSTOMER: 'CUSTOMER',
  FIELD_USER: 'FIELD_USER',
  DRIVER: 'DRIVER',
  SYSTEM: 'SYSTEM',
  AI_AGENT: 'AI_AGENT',
  CARRIER: 'CARRIER'
} as const;

export type TrackingActorType = (typeof TrackingActorType)[keyof typeof TrackingActorType];
