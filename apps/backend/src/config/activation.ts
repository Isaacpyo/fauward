// Trial activation (gtm.trials, gtm.attribution): the nightly `gtm.trial-activation-score` job scores trialing tenants
// 0–100; below this a tenant is flagged for CSM intervention, at or above it counts as activated.
export const ACTIVATION_THRESHOLD = 50;
