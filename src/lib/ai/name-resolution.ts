function operationalNameKey(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").replace(/(.)\1+/gu, "$1");
}

/** Exact names win. A conservative repeated-letter fallback is accepted only
 * when it resolves to one resource, so typo tolerance never becomes guessing. */
export function resolveUniqueOperationalName<T extends { name: string }>(items: T[], requestedName: string): T | undefined {
  const exact = items.filter((item) => item.name.trim().toLocaleLowerCase() === requestedName.trim().toLocaleLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const key = operationalNameKey(requestedName);
  const compatible = items.filter((item) => operationalNameKey(item.name) === key);
  return compatible.length === 1 ? compatible[0] : undefined;
}
