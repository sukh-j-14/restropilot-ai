export const ONBOARDING_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

export const ONBOARDING_CURRENCIES = ["INR", "USD", "AED", "SGD", "GBP", "EUR", "AUD"] as const;

export type OnboardingFields = {
  name: string;
  timezone: string;
  currency: string;
  phone: string;
  address: string;
  guestCapacity: string;
};

export type ValidatedOnboardingInput = {
  name: string;
  timezone: string;
  currency: string;
  phone: string | null;
  address: string | null;
  guestCapacity: number;
};

export type OnboardingFieldErrors = Partial<Record<keyof OnboardingFields, string>>;

export function validateOnboardingInput(fields: OnboardingFields):
  | { success: true; data: ValidatedOnboardingInput }
  | { success: false; fieldErrors: OnboardingFieldErrors } {
  const name = fields.name.trim();
  const timezone = fields.timezone.trim();
  const currency = fields.currency.trim().toUpperCase();
  const phone = fields.phone.trim();
  const address = fields.address.trim();
  const guestCapacity = Number(fields.guestCapacity);
  const fieldErrors: OnboardingFieldErrors = {};

  if (name.length < 2 || name.length > 120) {
    fieldErrors.name = "Enter a restaurant name between 2 and 120 characters.";
  }
  if (!ONBOARDING_TIMEZONES.includes(timezone as (typeof ONBOARDING_TIMEZONES)[number])) {
    fieldErrors.timezone = "Select a supported timezone.";
  }
  if (!ONBOARDING_CURRENCIES.includes(currency as (typeof ONBOARDING_CURRENCIES)[number])) {
    fieldErrors.currency = "Select a supported currency.";
  }
  if (phone && !/^[+0-9 ()-]{7,24}$/.test(phone)) {
    fieldErrors.phone = "Enter a valid phone number or leave this field blank.";
  }
  if (address.length > 300) {
    fieldErrors.address = "Address must be 300 characters or fewer.";
  }
  if (!Number.isInteger(guestCapacity) || guestCapacity < 1 || guestCapacity > 2_000) {
    fieldErrors.guestCapacity = "Capacity must be a whole number between 1 and 2,000.";
  }

  if (Object.keys(fieldErrors).length > 0) return { success: false, fieldErrors };
  return {
    success: true,
    data: {
      name,
      timezone,
      currency,
      phone: phone || null,
      address: address || null,
      guestCapacity,
    },
  };
}
