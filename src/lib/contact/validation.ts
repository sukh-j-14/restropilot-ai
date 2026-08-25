export const CONTACT_ENQUIRY_TYPES = ["demo", "pricing", "product", "partnership"] as const;
export type ContactEnquiryType = (typeof CONTACT_ENQUIRY_TYPES)[number];
export type ContactInput = { fullName: string; businessName: string; email: string; phone: string; enquiryType: string; message: string };
export type ContactSubmission = Omit<ContactInput, "enquiryType"> & { enquiryType: ContactEnquiryType };
export type ContactFieldErrors = Partial<Record<keyof ContactInput, string>>;

const limits = { fullName: 100, businessName: 120, email: 254, phone: 30, message: 2_000 } as const;
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeMessage = (value: string) => value.trim().replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

export function validateContactInput(input: unknown): { success: true; data: ContactSubmission } | { success: false; fieldErrors: ContactFieldErrors } {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) return { success: false, fieldErrors: { message: "The submitted form is invalid." } };
  const record = input as Record<string, unknown>;
  const allowed = ["fullName", "businessName", "email", "phone", "enquiryType", "message"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) return { success: false, fieldErrors: { message: "The form contains unsupported fields." } };
  if (allowed.some((key) => typeof record[key] !== "string")) return { success: false, fieldErrors: { message: "The submitted form is invalid." } };
  const data = { fullName: normalize(record.fullName as string), businessName: normalize(record.businessName as string), email: normalize(record.email as string).toLowerCase(), phone: normalize(record.phone as string), enquiryType: normalize(record.enquiryType as string), message: normalizeMessage(record.message as string) };
  const fieldErrors: ContactFieldErrors = {};
  if (!data.fullName) fieldErrors.fullName = "Enter your full name."; else if (data.fullName.length > limits.fullName) fieldErrors.fullName = `Use ${limits.fullName} characters or fewer.`;
  if (!data.businessName) fieldErrors.businessName = "Enter your restaurant or business name."; else if (data.businessName.length > limits.businessName) fieldErrors.businessName = `Use ${limits.businessName} characters or fewer.`;
  if (!data.email) fieldErrors.email = "Enter your work email."; else if (data.email.length > limits.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fieldErrors.email = "Enter a valid email address.";
  if (data.phone.length > limits.phone || (data.phone && !/^[+()\-\d\s.]+$/.test(data.phone))) fieldErrors.phone = "Enter a valid phone number.";
  if (!CONTACT_ENQUIRY_TYPES.includes(data.enquiryType as ContactEnquiryType)) fieldErrors.enquiryType = "Choose a valid enquiry type.";
  if (!data.message) fieldErrors.message = "Tell us how we can help."; else if (data.message.length > limits.message) fieldErrors.message = `Use ${limits.message.toLocaleString()} characters or fewer.`;
  if (Object.keys(fieldErrors).length) return { success: false, fieldErrors };
  return { success: true, data: data as ContactSubmission };
}
