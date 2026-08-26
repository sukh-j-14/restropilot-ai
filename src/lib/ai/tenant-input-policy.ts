/** Chat is never a trusted source for tenant selection. */
export function containsBrowserSuppliedTenantIdentity(message: string) {
  return /\b(?:restaurant|organization|tenant|clerk(?:\s*organization)?)[\s_-]*id\b\s*(?:is\b|[:=])/i.test(message);
}
