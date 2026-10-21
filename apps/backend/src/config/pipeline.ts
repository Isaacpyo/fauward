// gtm.pipeline (WP-4.18): the deal stages, their default win probability (percent) and how HubSpot's default
// pipeline stages map onto them. A HubSpot stage that is not listed imports as PROSPECTING with HubSpot's probability.

export const DEAL_STAGES = ['PROSPECTING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const OPEN_DEAL_STAGES: readonly DealStage[] = ['PROSPECTING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'];

export const DEFAULT_STAGE_PROBABILITY: Record<DealStage, number> = {
  PROSPECTING: 10,
  QUALIFIED: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0
};

export const HUBSPOT_STAGE_MAP: Record<string, DealStage> = {
  appointmentscheduled: 'PROSPECTING',
  qualifiedtobuy: 'QUALIFIED',
  presentationscheduled: 'PROPOSAL',
  decisionmakerboughtin: 'PROPOSAL',
  contractsent: 'NEGOTIATION',
  closedwon: 'WON',
  closedlost: 'LOST'
};
