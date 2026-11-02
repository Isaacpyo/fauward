// platform.flags (WP-4.1): runtime flags that are not plan features. A runtime flag is evaluated by code (for example a
// kill switch read from LaunchDarkly) rather than by planService, so it has no plan column and no native per-tenant
// override; the console lists it with its description and owner. The flag catalogue is planService.featureKeys() plus
// this list. Add an entry here in the same change that introduces the code reading the flag.

export type RuntimeFlag = {
  key: string;
  description: string;
  owner: string;
  /** Where the value comes from at runtime. */
  source: 'env' | 'launchdarkly';
};

export const RUNTIME_FLAGS: readonly RuntimeFlag[] = [];
