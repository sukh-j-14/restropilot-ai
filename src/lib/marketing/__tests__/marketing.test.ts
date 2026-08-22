import assert from "node:assert/strict";
import test from "node:test";
import { calculatePricing, PRODUCT_PRICING } from "@/lib/marketing/pricing";
import { parseThemePreference, resolveTheme, THEME_INITIALIZER } from "@/lib/theme";

test("pricing durations derive consistent totals from one monthly base price", () => {
  const monthly = calculatePricing("monthly");
  const quarterly = calculatePricing("quarterly");
  const halfYear = calculatePricing("half-yearly");
  assert.equal(monthly.total, PRODUCT_PRICING.monthlyBasePrice);
  assert.equal(quarterly.total, Math.round(PRODUCT_PRICING.monthlyBasePrice * 3 * 0.9));
  assert.equal(halfYear.total, Math.round(PRODUCT_PRICING.monthlyBasePrice * 6 * 0.85));
  assert.ok(halfYear.effectiveMonthly < quarterly.effectiveMonthly);
});

test("theme parsing accepts only light, dark, and system", () => {
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("system"), "system");
  assert.equal(parseThemePreference("unexpected"), "system");
  assert.equal(parseThemePreference({ theme: "dark" }), "system");
});

test("system theme follows the operating-system preference", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("the pre-hydration initializer is bounded and safely falls back", () => {
  assert.match(THEME_INITIALIZER, /try\{/);
  assert.match(THEME_INITIALIZER, /catch\(e\)/);
  assert.match(THEME_INITIALIZER, /prefers-color-scheme: dark/);
  assert.doesNotMatch(THEME_INITIALIZER, /document\.write|eval\(/);
});
