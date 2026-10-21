// gtm.handoff (WP-4.17): the code-defined sales → customer success handoff. Sales fills in the fields before passing the
// handoff to CS; the CSM ticks the checklist before completing it.

export const HANDOFF_TEMPLATE = {
  id: 'default-v1',
  name: 'Trial to paid handoff',
  fields: [
    { key: 'stakeholders', label: 'Stakeholders (names, roles, contact)', requiredForCs: true },
    { key: 'successCriteria', label: 'What success looks like for them', requiredForCs: true },
    { key: 'risks', label: 'Risks and open questions', requiredForCs: false },
    { key: 'commercialNotes', label: 'Commercial notes (discounts, promises made)', requiredForCs: false }
  ],
  checklist: [
    { key: 'kickoff_booked', label: 'Kick-off call booked' },
    { key: 'admins_confirmed', label: 'Tenant admins confirmed' },
    { key: 'integrations_reviewed', label: 'Integrations and data import reviewed' },
    { key: 'success_plan_shared', label: 'Success plan shared with the tenant' }
  ]
} as const;

export type HandoffFieldKey = (typeof HANDOFF_TEMPLATE.fields)[number]['key'];
export type HandoffChecklistKey = (typeof HANDOFF_TEMPLATE.checklist)[number]['key'];
