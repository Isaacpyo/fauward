/**
 * Legitimate or scheduled exceptions to the no-fake-data gate (architecture §11). Every entry names the file, the rule
 * it trips and why it is allowed. Entries that name a work package must be removed by that WP.
 */
export type FakeDataRule = "sampleRows" | "placeholder text" | "Math.random" | "simulated delay" | "currency literal";

export const NO_FAKE_DATA_ALLOWLIST: Array<{ file: string; rule: FakeDataRule; reason: string }> = [
  { file: "pillars/InternalOpsPage.tsx", rule: "currency literal", reason: "Regex back-reference \" $1\" that splits camelCase keys, not money" },
  { file: "pillars/WorkflowOpsPage.tsx", rule: "currency literal", reason: "Regex back-reference \" $1\" that splits camelCase keys, not money" }
];
