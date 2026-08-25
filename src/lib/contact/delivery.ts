import type { ContactSubmission } from "@/lib/contact/validation";
export type ContactDeliveryResult = { delivered: true } | { delivered: false; reason: "NOT_CONFIGURED" | "DELIVERY_FAILED" };

export async function deliverContactSubmission(submission: ContactSubmission, options: { endpoint?: string; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<ContactDeliveryResult> {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) return { delivered: false, reason: "NOT_CONFIGURED" };
  let url: URL;
  try { url = new URL(endpoint); } catch { return { delivered: false, reason: "NOT_CONFIGURED" }; }
  if (url.protocol !== "https:") return { delivered: false, reason: "NOT_CONFIGURED" };
  try {
    const response = await (options.fetcher ?? fetch)(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...submission, source: "restropilot-public-contact" }), cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 8_000) });
    return response.ok ? { delivered: true } : { delivered: false, reason: "DELIVERY_FAILED" };
  } catch { return { delivered: false, reason: "DELIVERY_FAILED" }; }
}
