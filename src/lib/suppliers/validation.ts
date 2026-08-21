import type { FieldErrors } from "@/lib/catalog/validation";

export type SupplierFields = { name: string; email: string; phone: string };

export function validateSupplier(fields: SupplierFields):
  | { success: true; data: SupplierFields }
  | { success: false; fieldErrors: FieldErrors<SupplierFields> } {
  const data = { name: fields.name.trim(), email: fields.email.trim(), phone: fields.phone.trim() };
  const fieldErrors: FieldErrors<SupplierFields> = {};
  if (data.name.length < 2 || data.name.length > 120) fieldErrors.name = "Name must be between 2 and 120 characters.";
  if (data.email && (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) fieldErrors.email = "Enter a valid email address.";
  if (data.phone && (data.phone.length > 24 || !/^[+\d][\d\s().-]{6,23}$/.test(data.phone))) fieldErrors.phone = "Enter a valid phone number.";
  return Object.keys(fieldErrors).length ? { success: false, fieldErrors } : { success: true, data };
}
