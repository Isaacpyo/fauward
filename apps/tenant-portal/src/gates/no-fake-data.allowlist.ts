/**
 * Legitimate or scheduled exceptions to the no-fake-data gate (architecture §11). Every entry names the file, the rule
 * it trips and why it is allowed. Entries that name a work package must be removed by that WP.
 */
export type FakeDataRule = "sampleRows" | "placeholder text" | "Math.random" | "simulated delay" | "currency literal";

export const NO_FAKE_DATA_ALLOWLIST: Array<{ file: string; rule: FakeDataRule; reason: string }> = [
  { file: "components/onboarding/StepFirstShipment.tsx", rule: "simulated delay", reason: "Onboarding steps call real endpoints in WP-2.17" },
  { file: "components/onboarding/StepFirstShipment.tsx", rule: "Math.random", reason: "Onboarding steps call real endpoints in WP-2.17" },
  { file: "components/onboarding/StepPayments.tsx", rule: "simulated delay", reason: "Onboarding steps call real endpoints in WP-2.17" },
  { file: "components/onboarding/StepPayments.tsx", rule: "Math.random", reason: "Onboarding steps call real endpoints in WP-2.17" }
];
