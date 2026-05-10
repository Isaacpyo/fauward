export const TrackingVisibility = {
  PLATFORM_ONLY: 'PLATFORM_ONLY',
  TENANT_INTERNAL: 'TENANT_INTERNAL',
  CUSTOMER_VISIBLE: 'CUSTOMER_VISIBLE',
  FIELD_VISIBLE: 'FIELD_VISIBLE'
} as const;

export type TrackingVisibility = (typeof TrackingVisibility)[keyof typeof TrackingVisibility];

// Visibility hierarchy: higher index = more restricted
const VISIBILITY_ORDER: TrackingVisibility[] = [
  'CUSTOMER_VISIBLE',
  'FIELD_VISIBLE',
  'TENANT_INTERNAL',
  'PLATFORM_ONLY'
];

export type VisibilityAccessLevel = 'customer' | 'field' | 'tenant' | 'platform';

const LEVEL_ALLOWED_VISIBILITIES: Record<VisibilityAccessLevel, TrackingVisibility[]> = {
  customer: ['CUSTOMER_VISIBLE'],
  field: ['CUSTOMER_VISIBLE', 'FIELD_VISIBLE'],
  tenant: ['CUSTOMER_VISIBLE', 'FIELD_VISIBLE', 'TENANT_INTERNAL'],
  platform: ['CUSTOMER_VISIBLE', 'FIELD_VISIBLE', 'TENANT_INTERNAL', 'PLATFORM_ONLY']
};

export function getAllowedVisibilities(level: VisibilityAccessLevel): TrackingVisibility[] {
  return LEVEL_ALLOWED_VISIBILITIES[level];
}

export function canSeeVisibility(
  accessLevel: VisibilityAccessLevel,
  visibility: TrackingVisibility
): boolean {
  return getAllowedVisibilities(accessLevel).includes(visibility);
}

export { VISIBILITY_ORDER };
