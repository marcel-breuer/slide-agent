import { z } from "zod";

export const CurrencySchema = z.enum(["USD", "EUR"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const PricingEntrySchema = z.object({
  provider: z.string(),
  model: z.string(),
  currency: CurrencySchema.default("USD"),
  inputPerMillion: z.number().min(0),
  outputPerMillion: z.number().min(0),
  imageGenerationUnit: z.number().min(0).default(0),
  effectiveDate: z.string().datetime(),
  active: z.boolean().default(true),
});
export type PricingEntry = z.infer<typeof PricingEntrySchema>;

export type UsageInput = {
  inputTokens: number;
  outputTokens: number;
  imageGenerations?: number;
};

export type CostEstimate = {
  providerCost: number;
  displayCost: number;
  providerCurrency: Currency;
  displayCurrency: Currency;
  totalTokens: number;
  uncertaintyLow: number;
  uncertaintyHigh: number;
};

export function estimateCost(
  pricing: PricingEntry,
  usage: UsageInput,
  displayCurrency: Currency,
  usdToEurRate: number,
): CostEstimate {
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const providerCost =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion +
    (usage.imageGenerations ?? 0) * pricing.imageGenerationUnit;
  const displayCost =
    pricing.currency === displayCurrency
      ? providerCost
      : displayCurrency === "EUR"
        ? providerCost * usdToEurRate
        : providerCost / usdToEurRate;

  return {
    providerCost,
    displayCost,
    providerCurrency: pricing.currency,
    displayCurrency,
    totalTokens,
    uncertaintyLow: displayCost * 0.8,
    uncertaintyHigh: displayCost * 1.3,
  };
}

export function canReserveBudget(
  remainingCost: number | null,
  remainingTokens: number | null,
  estimate: CostEstimate,
): boolean {
  const costAllowed = remainingCost === null || estimate.displayCost <= remainingCost;
  const tokenAllowed = remainingTokens === null || estimate.totalTokens <= remainingTokens;
  return costAllowed && tokenAllowed;
}
