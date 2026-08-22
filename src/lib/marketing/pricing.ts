export type BillingDuration = "monthly" | "quarterly" | "half-yearly";

export const PRODUCT_PRICING = {
  currency: "INR",
  monthlyBasePrice: 2999,
  durations: {
    monthly: { label: "Monthly", months: 1, discountPercent: 0 },
    quarterly: { label: "3 Months", months: 3, discountPercent: 10 },
    "half-yearly": { label: "6 Months", months: 6, discountPercent: 15 },
  },
} as const;

export function calculatePricing(duration: BillingDuration) {
  const config = PRODUCT_PRICING.durations[duration];
  const undiscountedTotal = PRODUCT_PRICING.monthlyBasePrice * config.months;
  const total = Math.round(undiscountedTotal * (1 - config.discountPercent / 100));
  return { ...config, total, undiscountedTotal, effectiveMonthly: Math.round(total / config.months) };
}
