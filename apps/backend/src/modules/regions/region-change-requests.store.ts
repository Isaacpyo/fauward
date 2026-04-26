export type RegionChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RegionChangeRequest = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  currentRegion: string;
  requestedRegion: string;
  requestedBy: string;
  status: RegionChangeStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

type CreateRegionChangeRequestInput = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  currentRegion: string;
  requestedRegion: string;
  requestedBy: string;
};

const requests: RegionChangeRequest[] = [];

export function createRegionChangeRequest(input: CreateRegionChangeRequestInput) {
  const now = new Date().toISOString();
  const existingPending = requests.find(
    (request) => request.tenantId === input.tenantId && request.status === 'PENDING'
  );

  if (existingPending) {
    existingPending.requestedRegion = input.requestedRegion;
    existingPending.requestedBy = input.requestedBy;
    existingPending.createdAt = now;
    return existingPending;
  }

  const request: RegionChangeRequest = {
    id: `rcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    status: 'PENDING',
    createdAt: now
  };
  requests.unshift(request);
  return request;
}

export function listRegionChangeRequests() {
  return requests;
}

export function updateRegionChangeRequestStatus(id: string, status: Exclude<RegionChangeStatus, 'PENDING'>, reviewedBy: string) {
  const request = requests.find((item) => item.id === id);
  if (!request) return null;

  request.status = status;
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = reviewedBy;
  return request;
}
