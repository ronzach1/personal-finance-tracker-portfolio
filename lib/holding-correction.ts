export function supportsGenericHoldingCorrection(instrumentKind: string) {
  return instrumentKind !== "deposit" && instrumentKind !== "pension";
}
