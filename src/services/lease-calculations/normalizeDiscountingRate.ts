// @ts-nocheck
// utils/normalizeDiscountingRate.ts
export function normalizeDiscountingRate(
  discountingRates: { rate: number }[]
): number {
  if (!discountingRates || discountingRates.length === 0) {
    throw new Error("No Discount Rates provided");
  }

  // Take last yearly rate as percent
  const yearlyRatePercent = discountingRates[discountingRates.length - 1].rate;

  // Convert to decimal
  const yearlyRate = yearlyRatePercent / 100;

  // Apply formula
  const normalizedDecimal = 365 * (Math.pow(1 + yearlyRate / 12, 12 / 365) - 1);

  // Convert back to percent
  return +(normalizedDecimal * 100);
}
