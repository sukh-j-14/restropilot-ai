function operationalNameKey(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").replace(/(.)\1+/gu, "$1");
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

/** Exact names win. A conservative repeated-letter fallback is accepted only
 * when it resolves to one resource, so typo tolerance never becomes guessing. */
export function resolveUniqueOperationalName<T extends { name: string }>(items: T[], requestedName: string): T | undefined {
  const exact = items.filter((item) => item.name.trim().toLocaleLowerCase() === requestedName.trim().toLocaleLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const key = operationalNameKey(requestedName);
  const compatible = items.filter((item) => operationalNameKey(item.name) === key);
  if (compatible.length === 1) return compatible[0];
  if (compatible.length > 1 || key.length < 4) return undefined;
  const fuzzy = items.filter((item) => editDistance(operationalNameKey(item.name), key) === 1);
  return fuzzy.length === 1 ? fuzzy[0] : undefined;
}
