"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { deliverContactSubmission } from "@/lib/contact/delivery";
import { validateContactInput, type ContactFieldErrors, type ContactInput } from "@/lib/contact/validation";

export type ContactActionState = { status: "idle" | "success" | "error"; message?: string; fieldErrors?: ContactFieldErrors };
const attempts = new Map<string, number[]>();
const formFields: (keyof ContactInput)[] = ["fullName", "businessName", "email", "phone", "enquiryType", "message"];
const allowedFormFields = new Set([...formFields, "website"]);
const formValue = (formData: FormData, name: string) => { const value = formData.get(name); return typeof value === "string" ? value : ""; };
function isRateLimited(key: string, now = Date.now()) { const recent = (attempts.get(key) ?? []).filter((timestamp) => now - timestamp < 600_000); if (recent.length >= 3) return true; recent.push(now); attempts.set(key, recent); return false; }

export async function submitContactAction(_previousState: ContactActionState, formData: FormData): Promise<ContactActionState> {
  if ([...formData.keys()].some((key) => !allowedFormFields.has(key) && !key.startsWith("$ACTION_"))) return { status: "error", message: "The form contains unsupported fields." };
  if (formValue(formData, "website")) return { status: "success", message: "Thanks. Your request has been received." };
  const validation = validateContactInput(Object.fromEntries(formFields.map((field) => [field, formValue(formData, field)])));
  if (!validation.success) return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: validation.fieldErrors };
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  if (isRateLimited(createHash("sha256").update(address).digest("hex"))) return { status: "error", message: "Too many requests were submitted. Please wait a few minutes and try again." };
  const result = await deliverContactSubmission(validation.data, { endpoint: process.env.CONTACT_WEBHOOK_URL });
  if (!result.delivered) return result.reason === "NOT_CONFIGURED" ? { status: "error", message: "Demo requests are not available online yet. Please try again later." } : { status: "error", message: "We couldn’t send your request right now. Please try again shortly." };
  return { status: "success", message: "Thanks — your request has been sent. We’ll be in touch." };
}
