export type CashChangeClassification = "" | "external_in" | "external_out" | "internal" | "correction";

const supportedCashChangeClassifications = ["external_in", "external_out", "internal", "correction"] as const;

export function cashClassificationReady(changed: boolean, classification: CashChangeClassification) {
  return !changed || supportedCashChangeClassifications.includes(classification as typeof supportedCashChangeClassifications[number]);
}
