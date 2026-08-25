import assert from "node:assert/strict";
import test from "node:test";
import { deliverContactSubmission } from "@/lib/contact/delivery";
import { validateContactInput } from "@/lib/contact/validation";

const valid = { fullName: "  Asha   Mehta ", businessName: " Olive   Table ", email: " ASHA@EXAMPLE.COM ", phone: "", enquiryType: "demo", message: "  We would like\r\n\r\n\r\na demo.  " };

test("valid contact input is safely normalized and optional phone is accepted", () => {
  const result = validateContactInput(valid);
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data, { fullName: "Asha Mehta", businessName: "Olive Table", email: "asha@example.com", phone: "", enquiryType: "demo", message: "We would like\n\na demo." });
});

test("required contact fields and email are validated", () => {
  const missing = validateContactInput({ ...valid, fullName: "", businessName: "", message: "" });
  assert.equal(missing.success, false);
  if (!missing.success) assert.deepEqual(Object.keys(missing.fieldErrors).sort(), ["businessName", "fullName", "message"]);
  const email = validateContactInput({ ...valid, email: "not-an-email" });
  assert.equal(email.success, false);
  if (!email.success) assert.ok(email.fieldErrors.email);
});

test("contact limits and enquiry allowlist are enforced", () => {
  const result = validateContactInput({ ...valid, fullName: "x".repeat(101), message: "x".repeat(2001), enquiryType: "sales-admin" });
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["enquiryType", "fullName", "message"]);
});

test("unexpected and tenant/internal identifier fields are rejected", () => {
  for (const field of ["unexpected", "restaurantId", "organizationId", "userId"]) assert.equal(validateContactInput({ ...valid, [field]: "internal" }).success, false);
});

test("contact delivery reports configuration honestly and sends validated data", async () => {
  const validated = validateContactInput(valid);
  assert.equal(validated.success, true);
  if (!validated.success) return;
  assert.deepEqual(await deliverContactSubmission(validated.data), { delivered: false, reason: "NOT_CONFIGURED" });
  let sent = "";
  const result = await deliverContactSubmission(validated.data, { endpoint: "https://contact.example.test/intake", fetcher: async (_url, init) => { sent = String(init?.body); return new Response(null, { status: 204 }); } });
  assert.deepEqual(result, { delivered: true });
  assert.match(sent, /restropilot-public-contact/);
  assert.doesNotMatch(sent, /restaurantId|organizationId|userId/);
});
