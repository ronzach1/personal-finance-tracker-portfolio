export type FirstRunLanguage = "he" | "en";

export const firstRunAccountName = (language: FirstRunLanguage) => language === "he" ? "החשבון הראשון שלי" : "My first account";

export function neutralFirstRunAccount(language: FirstRunLanguage) {
  return {
    clientId: "first-account",
    name: firstRunAccountName(language),
    kind: "other" as const,
    cashBalance: 0,
    cashCurrency: "ILS" as const,
  };
}
