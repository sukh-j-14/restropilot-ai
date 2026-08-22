import {
  type OnboardingFieldErrors,
  type OnboardingFields,
  type ValidatedOnboardingInput,
  validateOnboardingInput,
} from "@/lib/onboarding/validation";

export const SETTINGS_FIELDS = ["name", "phone", "address", "timezone", "currency", "guestCapacity"] as const;
export type SettingsField = (typeof SETTINGS_FIELDS)[number];
export type SettingsFieldErrors = OnboardingFieldErrors & { form?: string };

export type SettingsValidationResult =
  | { success: true; data: ValidatedOnboardingInput }
  | { success: false; fieldErrors: SettingsFieldErrors };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateSettingsInput(input: unknown): SettingsValidationResult {
  if (!isPlainRecord(input)) return { success: false, fieldErrors: { form: "Invalid settings request." } };
  const keys = Object.keys(input);
  if (keys.some((key) => !SETTINGS_FIELDS.includes(key as SettingsField))) {
    return { success: false, fieldErrors: { form: "The request contained an unsupported field." } };
  }
  const fields = Object.fromEntries(
    SETTINGS_FIELDS.map((field) => [field, typeof input[field] === "string" ? input[field] : ""]),
  ) as OnboardingFields;
  return validateOnboardingInput(fields);
}

export function settingsObjectFromFormData(formData: FormData) {
  const entries = Array.from(formData.entries()).filter(([key]) => !key.startsWith("$ACTION_"));
  return Object.fromEntries(entries);
}
